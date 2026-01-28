// server.js

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { sendOfferEmail } = require('./offerMailer');
const { format, subDays, subMonths } = require('date-fns'); // Ensure this is present

// Route Imports
const sendBillRoute = require('./routes/sendBill');
const forgotPasswordRoutes = require('./routes/forgotPasswordRoutes');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;

// PostgreSQL connection to NeonDB
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

// Middleware
// Middleware to set timezone for every request
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Kolkata'");
});

app.use(cors({
  origin: ['http://localhost:3000', 'https://dineinpro.vercel.app', 'http://dineinpro.vercel.app', 'https://www.dineinnpro.com', 'https://dine-inn-pro.vercel.app'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// API Routes
app.use(sendBillRoute);
app.use('/api/forgot-password', forgotPasswordRoutes(pool));


app.get('/', (req, res) => {
  res.send('✅ API is running');
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ DB Test Error:', err);
    res.status(500).send('Database error');
  }
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Listen for a client to join a restaurant-specific room
  socket.on('join-restaurant-room', (restaurantId) => {
    if (restaurantId) {
      const roomName = `restaurant-${restaurantId}`;
      socket.join(roomName);
      console.log(`Socket ${socket.id} joined room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});
// server.js

// Replace the existing '/api/notify-waiter' route
// In server.js, replace your existing route with this one.

app.post('/api/notify-waiter', async (req, res) => {
  const { restaurantId, categoryId, tableId } = req.body;

  if (!restaurantId || !categoryId || !tableId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const message = `Waiter call for Table: ${tableId} in Category: ${categoryId}`;
    
    // ✅ FIX 1: Add "RETURNING *" to get the full database record back, including the new ID.
    const query = `
      INSERT INTO waiter_calls (restaurant_id, category_id, table_id, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *; 
    `;
    const result = await pool.query(query, [restaurantId, categoryId, tableId, message]);
    
    // ✅ FIX 2: The payload is now the complete record from the database.
    const newCallWithId = result.rows[0];
    
    // ✅ FIX 3: Define the room and emit the notification after saving to the database.
    const roomName = `restaurant-${restaurantId}`;
    io.to(roomName).emit('waiter-call', newCallWithId);

    // 4. Send a success response
    res.status(200).json({ message: 'Waiter call sent and logged successfully' });

  } catch (err) {
    console.error('Error logging waiter call to DB:', err);
    res.status(500).json({ 
      message: 'Waiter call was sent, but failed to be logged in the database.' 
    });
  }
});
// In server.js, add this new route

app.get('/api/waiter-calls', async (req, res) => {
  const { restaurantId } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant ID is required' });
  }

  try {
    const query = `
      SELECT id, restaurant_id, category_id, table_id, created_at
      FROM waiter_calls
      WHERE restaurant_id = $1
      ORDER BY created_at DESC
      LIMIT 50; -- Optional: Limit to the 50 most recent calls
    `;
    const { rows } = await pool.query(query, [restaurantId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching waiter calls:', err);
    res.status(500).json({ error: 'Failed to fetch stored waiter calls' });
  }
});
// In server.js

app.delete('/api/waiter-calls/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // The query now only deletes by the primary key 'id'.
    await pool.query('DELETE FROM waiter_calls WHERE id = $1', [id]);
    
    // Send a 204 No Content response, which is standard for a successful delete.
    res.status(204).send();

  } catch (err) {
    console.error(`Error deleting waiter call with ID ${id}:`, err);
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
});


const getSafeDateRange = (range) => {
    const now = new Date();
    // Set time to midnight to ensure consistent date boundaries
    now.setHours(0, 0, 0, 0);

    let startDate = new Date(now);
    let endDate = new Date(now);

    switch (range) {
        case 'yesterday':
            startDate.setDate(now.getDate() - 1);
            endDate.setDate(now.getDate() - 1);
            break;
        case 'week':
            // Correctly sets the start date to 6 days before today
            startDate.setDate(now.getDate() - 6);
            // End date remains today
            break;
        case 'month':
            // Correctly sets the start date to 1 month before today
            startDate.setMonth(now.getMonth() - 1);
            // End date remains today
            break;
        case 'today':
        default:
            // No changes needed, start and end are both today
            break;
    }

    // Helper function to format dates into the 'YYYY-MM-DD' string format
    // This is crucial for matching your database's date format.
    const toYYYYMMDD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    return {
        startDate: toYYYYMMDD(startDate),
        endDate: toYYYYMMDD(endDate)
    };
};
app.get('/api/dashboard/kpis', async (req, res) => {
    const { restaurantId, range = 'today' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    const { startDate, endDate } = getSafeDateRange(range);

    try {
      const revenueResult = await pool.query(
        `SELECT COALESCE(SUM(totalamount), 0) AS total FROM orders WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3`,
        [restaurantId, startDate, endDate]
      );
      const expensesResult = await pool.query(
        `SELECT COALESCE(SUM(totalpaid), 0) AS total FROM expenses WHERE restaurantid = $1 AND date BETWEEN $2 AND $3`,
        [restaurantId, startDate, endDate]
      );

      const revenue = parseFloat(revenueResult.rows[0].total);
      const expenses = parseFloat(expensesResult.rows[0].total);

      res.json({
        revenue,
        expenses,
        netProfit: revenue - expenses,
      });
    } catch (err) {
      console.error('Error fetching KPI data:', err);
      res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/dashboard/sales-vs-expenses', async (req, res) => {
    const { restaurantId, range = 'week' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const query = `
            WITH daily_sales AS (
                SELECT DATE_TRUNC('day', orderdate)::date AS day, SUM(totalamount) AS sales
                FROM orders
                WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
                GROUP BY day
            ),
            daily_expenses AS (
                SELECT date AS day, SUM(totalpaid) AS expenses
                FROM expenses
                WHERE restaurantid = $1 AND date BETWEEN $2 AND $3
                GROUP BY day
            )
            SELECT
                to_char(COALESCE(ds.day, de.day), 'Mon DD') AS date,
                COALESCE(ds.sales, 0) AS sales,
                COALESCE(de.expenses, 0) AS expenses
            FROM daily_sales ds
            FULL OUTER JOIN daily_expenses de ON ds.day = de.day
            ORDER BY COALESCE(ds.day, de.day);
        `;
        const result = await pool.query(query, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales vs expenses data:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/dashboard/top-dishes', async (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    
    // Use the last month for a good sample size
    const { startDate, endDate } = getSafeDateRange('month');
    
    try {
        // This query now correctly JOINS orders and order_details
        // and uses the 'orderdate' column from the 'orders' table.
        const result = await pool.query(`
            SELECT
                od.item_name AS name,
                SUM(od.quantity)::integer AS value
            FROM
                order_details od
            JOIN
                orders o ON od.order_id = o.id
            WHERE
                o.restaurantid = $1 AND DATE(o.orderdate) BETWEEN $2 AND $3
            GROUP BY
                od.item_name
            ORDER BY
                value DESC
            LIMIT 5;
        `, [restaurantId, startDate, endDate]);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching top dishes:', err);
        res.status(500).json({ error: 'Server error fetching top dishes' });
    }
});

// In server.js, replace the existing peak-order-times route with this one:

// In server.js

// ... (your other routes)

// ✅ CORRECTED: Staff Attendance Route
// In server.js

// In server.js

app.get('/api/dashboard/staff-attendance', async (req, res) => {
    const { restaurantId, range = 'today' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    const { startDate, endDate } = getSafeDateRange(range);

    try {
        // 1. Get the total number of staff for the restaurant.
        const totalStaffResult = await pool.query(
            'SELECT COUNT(*) as total FROM staff WHERE restaurantid = $1',
            [restaurantId]
        );
        const totalStaff = parseInt(totalStaffResult.rows[0].total, 10);

        if (totalStaff === 0) {
            return res.json([
                { name: 'Present', value: 0, color: '#4CAF50' },
                { name: 'Absent', value: 0, color: '#F44336' },
            ]);
        }

        // 2. Calculate the number of days in the selected date range.
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Add 1 to include both the start and end day in the count.
        const dayCount = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // 3. Calculate the total possible "attendance slots" for the period.
        // (e.g., 10 staff * 7 days = 70 possible slots)
        const totalPossibleSlots = totalStaff * dayCount;

        // 4. Count the total actual check-ins that occurred within the date range.
        const totalCheckInsResult = await pool.query(
            `SELECT COUNT(*) AS total_check_ins
             FROM attendance
             WHERE DATE(attendancedate) BETWEEN $1 AND $2
               AND staffid IN (SELECT id FROM staff WHERE restaurantid = $3)`,
            [startDate, endDate, restaurantId]
        );
        const totalCheckIns = parseInt(totalCheckInsResult.rows[0].total_check_ins || 0, 10);

        // 5. The number of absent slots is the remainder.
        const totalAbsentSlots = totalPossibleSlots - totalCheckIns;

        res.json([
            { name: 'Present', value: totalCheckIns, color: '#4CAF50' },
            // Ensure the value isn't negative in case of data inconsistencies.
            { name: 'Absent', value: Math.max(0, totalAbsentSlots), color: '#F44336' },
        ]);
    } catch (err) {
        console.error('Error fetching staff attendance:', err);
        res.status(500).json({ error: 'Server error while fetching staff attendance' });
    }
});

// ✅ CORRECTED: Peak Order Times Route
app.get('/api/dashboard/peak-order-times', async (req, res) => {
    const { restaurantId, range = 'today' } = req.query; // Now respects the date range
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    // This now correctly uses the selected date range
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const result = await pool.query(`
            SELECT to_char(orderdate, 'HH24') AS hour, COUNT(id) AS orders
            FROM orders
            WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
            GROUP BY hour
            ORDER BY hour;
        `, [restaurantId, startDate, endDate]); // Correctly passes all parameters

        const formattedData = result.rows.map(row => ({
            hour: `${parseInt(row.hour, 10)}:00`,
            orders: parseInt(row.orders, 10)
        }));
        res.json(formattedData);
    } catch (err) {
        console.error('Error fetching peak order times:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// In server.js
// In server.js, add these new routes

// --- New vs. Returning Customers ---
app.get('/api/dashboard/customer-type', async (req, res) => {
    const { restaurantId, range = 'month' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const query = `
            WITH customer_orders AS (
                SELECT 
                    customerno, 
                    MIN(orderdate) as first_order_date
                FROM orders
                WHERE restaurantid = $1 AND customerno IS NOT NULL
                GROUP BY customerno
            )
            SELECT
                SUM(CASE WHEN co.first_order_date >= $2 THEN 1 ELSE 0 END) AS new_customers,
                SUM(CASE WHEN co.first_order_date < $2 THEN 1 ELSE 0 END) AS returning_customers
            FROM customer_orders co
            JOIN orders o ON co.customerno = o.customerno
            WHERE o.restaurantid = $1 AND DATE(o.orderdate) BETWEEN $2 AND $3;
        `;
        const result = await pool.query(query, [restaurantId, startDate, endDate]);
        const { new_customers, returning_customers } = result.rows[0];
        res.json([
            { name: 'New', value: parseInt(new_customers || 0) },
            { name: 'Returning', value: parseInt(returning_customers || 0) }
        ]);
    } catch (err) {
        console.error('Error fetching customer types:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Average Order Value (AOV) ---
// In server.js

// --- Average Order Value (AOV) ---
app.get('/api/dashboard/aov', async (req, res) => {
    const { restaurantId, range = 'week' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        // This query is corrected to group by the same date expression
        // that is being selected, which resolves the SQL error.
        const result = await pool.query(`
            SELECT 
                to_char(DATE(orderdate), 'Mon DD') as date,
                AVG(totalamount)::integer as value
            FROM orders
            WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
            GROUP BY DATE(orderdate)
            ORDER BY DATE(orderdate);
        `, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching AOV:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// --- Top Spenders ---
app.get('/api/dashboard/top-spenders', async (req, res) => {
    const { restaurantId, range = 'month' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const result = await pool.query(`
            SELECT 
                customername as name, 
                SUM(totalamount)::integer as total
            FROM orders
            WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3 AND customername IS NOT NULL
            GROUP BY customername
            ORDER BY total DESC
            LIMIT 5;
        `, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching top spenders:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Popular Menu Categories ---
app.get('/api/dashboard/popular-categories', async (req, res) => {
    const { restaurantId, range = 'month' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const result = await pool.query(`
            SELECT 
                mi.category as name, 
                SUM(od.quantity)::integer as orders
            FROM order_details od
            JOIN menuitems mi ON od.menu_item_id = mi.id
            JOIN orders o ON od.order_id = o.id
            WHERE o.restaurantid = $1 AND DATE(o.orderdate) BETWEEN $2 AND $3
            GROUP BY mi.category
            ORDER BY orders DESC;
        `, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching popular categories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/dashboard/most-tipped-staff', async (req, res) => {
    const { restaurantId, range = 'month' } = req.query;
    if (!restaurantId) {
        return res.status(400).json({ error: 'restaurantId is required' });
    }
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const query = `
            SELECT 
                s.fullname AS name, 
                SUM(t.amount)::integer AS tips
            FROM 
                tips t
            JOIN 
                staff s ON t.staffid = s.id
            WHERE 
                t.restaurantid = $1 AND t.date BETWEEN $2 AND $3
            GROUP BY 
                s.fullname
            ORDER BY 
                tips DESC
            LIMIT 5;
        `;
        const result = await pool.query(query, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching most tipped staff:', err);
        res.status(500).json({ error: 'Server error fetching most tipped staff' });
    }
});

app.get('/api/dashboard/inventory-levels', async (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) {
        return res.status(400).json({ error: 'restaurantId is required' });
    }

    try {
        const query = `
            SELECT 
                item, 
                quantity
            FROM 
                inventory
            WHERE 
                restaurantid = $1
            ORDER BY 
                quantity DESC
            LIMIT 5;
        `;
        const result = await pool.query(query, [restaurantId]);
        
        // Format the data for the Recharts BarChart component
        const formattedData = result.rows.map(row => ({
            name: row.item,
            stock: row.quantity 
        }));
        
        res.json(formattedData);
    } catch (err) {
        console.error('Error fetching inventory levels:', err);
        res.status(500).json({ error: 'Server error fetching inventory levels' });
    }
});

// --- Low Stock Alerts ---
app.get('/api/dashboard/low-stock-alerts', async (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

    try {
        const result = await pool.query(`
            SELECT item, quantity, unit, threshold 
            FROM inventory 
            WHERE restaurantid = $1 AND quantity < threshold 
            ORDER BY item;
        `, [restaurantId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching low stock alerts:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/dashboard/daily-profit', async (req, res) => {
    const { restaurantId, range = 'week' } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    
    const { startDate, endDate } = getSafeDateRange(range);

    try {
        const query = `
            WITH daily_sales AS (
                SELECT 
                    DATE_TRUNC('day', orderdate)::date AS day, 
                    SUM(totalamount) AS sales
                FROM orders
                WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
                GROUP BY day
            ),
            daily_expenses AS (
                SELECT date AS day, SUM(totalpaid) AS expenses
                FROM expenses
                WHERE restaurantid = $1 AND date BETWEEN $2 AND $3
                GROUP BY day
            )
            SELECT 
                to_char(COALESCE(ds.day, de.day), 'Mon DD') AS date,
                COALESCE(ds.sales, 0)::integer AS sales, 
                COALESCE(de.expenses, 0)::integer AS expenses,
                (COALESCE(ds.sales, 0) - COALESCE(de.expenses, 0))::integer AS profit
            FROM daily_sales ds
            FULL OUTER JOIN daily_expenses de ON ds.day = de.day
            ORDER BY COALESCE(ds.day, de.day);
        `;
        const result = await pool.query(query, [restaurantId, startDate, endDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching daily profit data:', err);
        res.status(500).json({ error: 'Server error fetching daily profit data' });
    }
});

// ... (the rest of your server.js file)

// ... (the rest of your server.js file)
app.get('/api/dashboard/feedback-sentiment', async (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    
    // We'll analyze feedback from the last 30 days
    const { startDate, endDate } = getSafeDateRange('month');
    
    try {
        const result = await pool.query(`
            SELECT 
                SUM(CASE WHEN would_recommend = 'yes' THEN 1 ELSE 0 END) AS positive,
                SUM(CASE WHEN would_recommend = 'maybe' THEN 1 ELSE 0 END) AS neutral,
                SUM(CASE WHEN would_recommend = 'no' THEN 1 ELSE 0 END) AS negative
            FROM feedback
            WHERE restaurantid = $1 AND DATE(timestamp) BETWEEN $2 AND $3;
        `, [restaurantId, startDate, endDate]);

        const { positive, neutral, negative } = result.rows[0];
        
        res.json([
            { name: 'Positive', value: parseInt(positive || 0, 10), color: '#4CAF50' },
            { name: 'Neutral', value: parseInt(neutral || 0, 10), color: '#FF9800' },
            { name: 'Negative', value: parseInt(negative || 0, 10), color: '#F44336' }
        ]);
    } catch (err) {
        console.error('Error fetching feedback sentiment:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/dashboard/revenue-by-source', async(req, res) => {
      const { restaurantId, range = 'week' } = req.query;
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
      const { startDate, endDate } = getSafeDateRange(range);
      try {
          const result = await pool.query(`
            SELECT deliverytype AS name, SUM(totalamount)::integer AS value
            FROM orders
            WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
            GROUP BY deliverytype;
          `, [restaurantId, startDate, endDate]);

          const colors = { 'Dine-in': '#2196F3', 'Delivery': '#FF9800', 'Takeaway': '#4CAF50' };
          const formattedData = result.rows.map(row => ({...row, color: colors[row.name] || '#8884d8' }));

          res.json(formattedData);
      } catch(err) {
          console.error('Error fetching revenue by source:', err);
          res.status(500).json({ error: 'Server Error' });
      }
});

app.get('/api/dashboard/order-status-funnel', async(req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
    const { startDate, endDate } = getSafeDateRange('today');
    try {
        const query = `
            SELECT status, COUNT(id)::integer as value
            FROM orders
            WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
            GROUP BY status;
        `;
        const result = await pool.query(query, [restaurantId, startDate, endDate]);
        const fills = { 'pending': '#8884d8', 'accepted': '#83a6ed', 'served': '#82ca9d', 'paid': '#a4de6c' };
        const formattedData = result.rows.map(row => ({
            name: row.status.charAt(0).toUpperCase() + row.status.slice(1),
            value: row.value,
            fill: fills[row.status] || '#8dd1e1'
        }));
        res.json(formattedData);
    } catch(err) {
        console.error('Error fetching order status funnel:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});
// ========== RESTAURANT ACCESS MANAGEMENT (NEW) ==========

// GET all restaurants
app.get('/api/restaurants', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM restaurants ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching restaurants:', err);
    res.status(500).json({ error: 'Failed to fetch restaurants' });
  }
});

// POST a new restaurant and its admin user
app.post('/api/restaurants', async (req, res) => {
    const {
        restaurantId,
        restaurantName,
        adminEmail,
        password,
        startDate,
        expiryDate,
        status,
        plan
    } = req.body;

    if (!restaurantId || !restaurantName || !adminEmail || !password || !startDate || !expiryDate || !status || !plan) {
        return res.status(400).json({ error: 'All fields are required to create a restaurant.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert into restaurants table
        const restaurantQuery = `
            INSERT INTO restaurants (id, name, admin_email, start_date, expiry_date, status, plan)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const restaurantValues = [restaurantId, restaurantName, adminEmail, startDate, expiryDate, status, plan];
        const restaurantResult = await client.query(restaurantQuery, restaurantValues);
        const newRestaurant = restaurantResult.rows[0];

        // Hash password and insert admin user credentials
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userQuery = `
            INSERT INTO usercredentials (restaurantid, email, password, role)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(userQuery, [restaurantId, adminEmail, hashedPassword, 'admin']);

        await client.query('COMMIT');
        res.status(201).json(newRestaurant);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating restaurant:', err);
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'Restaurant ID or Admin Email already exists.' });
        }
        res.status(500).json({ error: 'Server error during restaurant creation.' });
    } finally {
        client.release();
    }
});

// PUT (update) a restaurant's details. This can be used for suspension.
app.put('/api/restaurants/:id', async (req, res) => {
    const { id } = req.params;
    // Note: In a real app, you would destructure only the fields you want to update.
    const { name, admin_email, start_date, expiry_date, status, plan } = req.body;

    try {
        const result = await pool.query(
            `UPDATE restaurants SET
                name = $1, admin_email = $2, start_date = $3,
                expiry_date = $4, status = $5, plan = $6
            WHERE id = $7 RETURNING *`,
            [name, admin_email, start_date, expiry_date, status, plan, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Restaurant not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating restaurant ${id}:`, err);
        res.status(500).json({ error: 'Server error.' });
    }
});


// DELETE (Hard Delete) a restaurant and its credentials
app.delete('/api/restaurants/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // First, get the admin email from the restaurant record to delete the corresponding user.
        const restaurantRes = await client.query('SELECT admin_email FROM restaurants WHERE id = $1', [id]);
        
        if (restaurantRes.rowCount > 0) {
            const { admin_email } = restaurantRes.rows[0];
            // Delete the user from usercredentials table
            if (admin_email) {
                await client.query('DELETE FROM usercredentials WHERE email = $1 AND restaurantid = $2', [admin_email, id]);
            }
        } else {
             // If the restaurant doesn't exist, we can just inform the user.
            return res.status(404).json({ error: 'Restaurant not found.' });
        }
        
        // Finally, delete the restaurant from the restaurants table
        const deleteRestaurantResult = await client.query('DELETE FROM restaurants WHERE id = $1', [id]);
        
        if (deleteRestaurantResult.rowCount === 0) {
            // This case should theoretically not be hit if the first select works, but it's good practice.
            throw new Error('Restaurant was found but could not be deleted.');
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Restaurant and associated credentials permanently deleted successfully.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting restaurant ${id}:`, err);
        res.status(500).json({ error: 'Server error during deletion.' });
    } finally {
        client.release();
    }
});


// ========== LOGIN ==========
// ========== LOGIN ==========
// server.js

app.post('/api/login', async (req, res) => {
  const { restaurantId, email, password } = req.body;

  if (!restaurantId || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // 1. Check the restaurant's status first
    const restaurantRes = await pool.query(
      'SELECT id, status, expiry_date FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantRes.rows.length === 0) {
      // For security, you might want a generic error, but for this panel, specific is better.
      return res.status(404).json({ error: 'Restaurant ID not found.' });
    }

    const restaurant = restaurantRes.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate date comparison
    const expiryDate = new Date(restaurant.expiry_date);

    // 2. Check if expired and update status to 'On-Hold' if it's not already
    if (expiryDate < today && restaurant.status !== 'On-Hold') {
       await pool.query(
         "UPDATE restaurants SET status = 'On-Hold' WHERE id = $1",
         [restaurantId]
       );
       // After updating, block the login.
       return res.status(403).json({ error: "This restaurant's subscription has expired. Access is on hold." });
    }

    // 3. If status is already On-Hold or Suspended, block login
    if (restaurant.status === 'On-Hold' || restaurant.status === 'Suspended') {
        return res.status(403).json({ error: `This restaurant's access is ${restaurant.status}. Please contact support.` });
    }

    // 4. If restaurant is active, proceed with user authentication
    const userRes = await pool.query(
      'SELECT * FROM usercredentials WHERE restaurantid = $1 AND email = $2',
      [restaurantId, email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // 5. Login successful
    const { id, restaurantid, email: userEmail, role } = user;
    res.json({ user: { id, restaurantid, email: userEmail, role } });

  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
//Guest Side
app.get('/api/validate-guest', async (req, res) => {
  try {
    const { restaurantid, tablenumber, categoryid } = req.query;

    if (!restaurantid || !tablenumber || !categoryid) {
      return res.status(400).json({ valid: false, message: 'Missing parameters' });
    }

    // Convert types properly
    const rId = Number(restaurantid);
    const tNum = String(tablenumber);
    const cId = Number(categoryid);

    const queryText = `
      SELECT id FROM restauranttables 
      WHERE restaurantid = $1 AND tablenumber = $2 AND categoryid = $3
      LIMIT 1;
    `;

    const { rowCount } = await pool.query(queryText, [rId, tNum, cId]);

    if (rowCount > 0) {
      return res.json({ valid: true });
    } else {
      return res.json({ valid: false, message: 'Invalid guest credentials' });
    }
  } catch (error) {
    console.error('Error validating guest:', error);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
});

//Cateory Creation
app.get('/api/categories', async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE restaurantid = $1 ORDER BY id ASC',
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});


// POST /api/categories - Create a new category
app.post('/api/categories', async (req, res) => {
  const { restaurantId, name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO categories (restaurantId, name) VALUES ($1, $2) RETURNING *',
      [restaurantId, name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  const categoryId = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2 RETURNING *`,
      [name, categoryId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Category not found' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    if (error.code === '23505') { // unique violation
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update category' });
    }
  }
});
app.delete('/api/categories/:id', async (req, res) => {
  const categoryId = req.params.id;

  try {
    // Set categoryId to NULL for tables with this categoryId
    await pool.query(
      'UPDATE restauranttables SET categoryid = NULL WHERE categoryid = $1',
      [categoryId]
    );

    // Delete the category
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1',
      [categoryId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Category not found' });

    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});



app.get('/api/tables', async (req, res) => {
  const { restaurantId, categoryId } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  try {
    let query = 'SELECT * FROM restauranttables WHERE restaurantid = $1';
    const params = [restaurantId];

    if (categoryId) {
      query += ' AND categoryid = $2';
      params.push(categoryId);
    }

    query += ' ORDER BY id ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tables:', err);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});



app.post('/api/tables', async (req, res) => {
  const { restaurantId, tableNumber, categoryId } = req.body;
  if (!restaurantId || !tableNumber) return res.status(400).json({ error: 'restaurantId and tableNumber are required' });

  try {
    const result = await pool.query(
      `INSERT INTO restauranttables (restaurantid, tablenumber, categoryid)
       VALUES ($1, $2, $3) RETURNING *`,
      [restaurantId, tableNumber, categoryId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding table:', error);
    res.status(500).json({ error: 'Failed to add table' });
  }
});


// Update table with given id
app.put('/api/tables/:id', async (req, res) => {
  const tableId = req.params.id;
  const { tableNumber, categoryId } = req.body;
  if (!tableNumber) return res.status(400).json({ error: 'tableNumber is required' });

  try {
    const result = await pool.query(
      `UPDATE restauranttables SET tablenumber = $1, categoryid = $2 WHERE id = $3 RETURNING *`,
      [tableNumber, categoryId || null, tableId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Table not found' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ error: 'Failed to update table' });
  }
});


// Delete table by id
app.delete('/api/tables/:id', async (req, res) => {
  const tableId = req.params.id;

  try {
    const result = await pool.query(
      'DELETE FROM restauranttables WHERE id = $1',
      [tableId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Table not found' });

    res.json({ message: 'Table deleted' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: 'Failed to delete table' });
  }
});





// ========== MENUITEMS ==========
// GET menuitems-grouped - filter by menuid query param
// ========== MENUITEMS ==========

app.get('/api/menu-item-categories', async (req, res) => {
    const { restaurantId } = req.query;
    if (!restaurantId) {
        return res.status(400).json({ error: 'restaurantId is required' });
    }
    try {
        const result = await pool.query(
            'SELECT DISTINCT category FROM menuitems WHERE restaurantid = $1 AND category IS NOT NULL AND category <> \'\' ORDER BY category ASC',
            [restaurantId]
        );
        // Transform the array of objects into an array of strings
        const categories = result.rows.map(row => row.category);
        res.json(categories);
    } catch (err) {
        console.error('Error fetching menu item categories:', err);
        res.status(500).json({ error: 'Failed to fetch menu item categories' });
    }
});

// "Delete" a menu category by re-assigning items to 'Uncategorized'
app.delete('/api/menu-item-categories', async (req, res) => {
    const { restaurantId, categoryName } = req.body;
    if (!restaurantId || !categoryName) {
        return res.status(400).json({ error: 'restaurantId and categoryName are required.' });
    }
    if (categoryName === 'Uncategorized') {
        return res.status(400).json({ error: 'Cannot delete the "Uncategorized" category.' });
    }

    try {
        const result = await pool.query(
            `UPDATE menuitems 
             SET category = 'Uncategorized' 
             WHERE restaurantid = $1 AND category = $2`,
            [restaurantId, categoryName]
        );
        res.status(200).json({ message: `Category '${categoryName}' removed. ${result.rowCount} items were moved to Uncategorized.` });
    } catch (error) {
        console.error('Error "deleting" menu category:', error);
        res.status(500).json({ error: 'Failed to remove menu category' });
    }
});
//ORDERS LIST
// server.js

// GET orders with date filtering
app.get('/api/orders', async (req, res) => {
  const { restaurantId, startDate, endDate } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant ID is required' });
  }

  try {
    let query = `
      SELECT 
        id, billno, restaurantid, customername, customerno,
        deliverytype, paymenttype, totalamount, 
        to_char(orderdate, 'YYYY-MM-DD') as orderdate, 
        isoptedin, ispaid, categoryid, email_id, tablenumber,
        status, staff_id, 
        to_char(accepted_time, 'HH12:MI AM') as accepted_time, 
        to_char(served_time, 'HH12:MI AM') as served_time
      FROM orders 
      WHERE restaurantid = $1
    `;
    const params = [restaurantId];

    if (startDate && endDate) {
      query += ` AND DATE(orderdate) BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY orderdate DESC, id DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
// server.js

// PUT to update a single order field
app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { field, value, restaurantId } = req.body;

  if (!field || value === undefined || !restaurantId) {
    return res.status(400).json({ error: 'Field, value, and restaurantId are required' });
  }

  // A whitelist of columns that are allowed to be edited from this page.
  const allowedFields = [
    'customername', 'customerno', 'deliverytype', 'paymenttype', 
    'totalamount', 'orderdate', 'ispaid', 'email_id', 'tablenumber', 'status'
  ];

  if (!allowedFields.includes(field)) {
    return res.status(403).json({ error: `Field '${field}' cannot be edited.` });
  }

  try {
    const result = await pool.query(
      // The query uses the field name safely and checks for both ID and restaurantId
      `UPDATE orders SET ${field} = $1 WHERE id = $2 AND restaurantid = $3 RETURNING *`,
      [value, id, restaurantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found or you do not have permission to edit it.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating order field '${field}':`, err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ========== MENU ITEMS ==========
// GET all menu items for a restaurant, grouped by category
// server.js

// ... (previous code)

// server.js

// ... (previous code)

// GET all menu items for a restaurant, grouped by category
// server.js

// GET all menu items for a restaurant, grouped by category
app.get('/api/menuitems-grouped', async (req, res) => {
  // Destructure `show_all` from the query parameters
  const { restaurantId, show_all } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'Missing restaurantId parameter' });
  }

  try {
    let query = 'SELECT * FROM menuitems WHERE restaurantid = $1';
    const params = [restaurantId];

    // By default, only show available items.
    // If a request includes `?show_all=true`, then show all items.
    if (show_all !== 'true') {
      query += ' AND is_available = true';
    }

    query += ' ORDER BY category, itemname'; // Keep the ordering

    const result = await pool.query(query, params);

    const grouped = {};
    result.rows.forEach(row => {
      const category = row.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = {
            category: category,
            isOpen: true,
            items: []
        };
      }
      // The push logic includes the new is_available flag
      grouped[category].items.push({
        id: row.id,
        name: row.itemname,
        price: row.price,
        description: row.itemdescription,
        ingredients: row.ingredients,
        image: row.image,
        category: row.category,
        restaurantid: row.restaurantid,
        is_available: row.is_available
      });
    });
    
    const output = Object.values(grouped);
    res.json(output);

  } catch (err) {
    console.error('GET /menuitems-grouped error:', err);
    res.status(500).send('Error grouping menu items');
  }
});

// ... (previous code)

// PUT to toggle a menu item's availability
// server.js

// PUT to toggle a menu item's availability
app.put('/api/menuitems/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const { restaurantId } = req.body; // For security, ensure the user owns this item

  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant ID is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE menuitems 
       SET is_available = NOT is_available 
       WHERE id = $1 AND restaurantid = $2
       RETURNING *`,
      [id, restaurantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Menu item not found or you do not have permission to edit it.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(`PUT /api/menuitems/${id}/toggle error:`, err.message);
    res.status(500).send('Error toggling menu item availability');
  }
});
// ... (rest of your server code)
// POST a new menu item
app.post('/api/menuitems', async (req, res) => {
  const {
    restaurantid,
    menuid, // Now receiving menuid
    itemname,
    itemdescription,
    price,
    category,
    ingredients,
    image,
  } = req.body;

  if (!restaurantid || !itemname || !price || !category || !menuid) {
    return res.status(400).json({ error: 'restaurantid, menuid, itemname, price, and category are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO menuitems
      (restaurantid, menuid, itemname, itemdescription, price, category, ingredients, image)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [restaurantid, menuid, itemname, itemdescription, price, category, ingredients, image]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /menuitems error:', err.message);
    res.status(500).json({ error: 'Error adding menu item' });
  }
});
 
// PUT (update) an existing menu item
app.put('/api/menuitems/:id', async (req, res) => {
  const { id } = req.params;
  const {
    itemname,
    itemdescription,
    price,
    category,
    ingredients,
    image,
    restaurantid,
    menuid, // Now receiving menuid
  } = req.body;

  if (!itemname || !price || !category || !restaurantid || !menuid) {
    return res.status(400).json({ error: 'itemname, price, category, menuid, and restaurantid are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE menuitems SET 
        itemname = $1, 
        itemdescription = $2, 
        price = $3,
        category = $4, 
        ingredients = $5, 
        image = $6,
        menuid = $7
      WHERE id = $8 AND restaurantid = $9
      RETURNING *`,
      [itemname, itemdescription, price, category, ingredients, image, menuid, id, restaurantid]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Menu item not found or you do not have permission to edit it.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /menuitems error:', err.message);
    res.status(500).send('Error updating menu item');
  }
});

// DELETE a menu item
app.delete('/api/menuitems/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Instead of deleting, we update the is_available flag to false.
    const result = await pool.query(
      'UPDATE menuitems SET is_available = false WHERE id = $1 RETURNING *', 
      [id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Menu item not found.' });
    }
    // 204 No Content is still appropriate as the item is effectively "gone" from the active menu.
    res.status(204).send(); 
  } catch (err) {
    console.error('DELETE /menuitems error:', err.message);
    // The foreign key error will no longer happen, but we keep this for other potential errors.
    res.status(500).send('Error deactivating menu item');
  }
});



// ========== POLL ROUTES ==========
// GET polls with options by restaurantId
// Add this new route to your server.js file

app.delete('/api/polls/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // Begin a transaction to ensure both deletions succeed or fail together
    await client.query('BEGIN');

    // First, delete all options associated with the poll to maintain data integrity
    await client.query('DELETE FROM polloptions WHERE pollid = $1', [id]);
    
    // Then, delete the poll itself from the polls table
    const result = await client.query('DELETE FROM polls WHERE id = $1', [id]);

    // Check if a row was actually deleted. If not, the poll was not found.
    if (result.rowCount === 0) {
      await client.query('ROLLBACK'); // Rollback the transaction
      return res.status(404).json({ error: 'Poll not found.' });
    }

    // If both deletions were successful, commit the transaction
    await client.query('COMMIT');
    res.status(200).json({ message: 'Poll and its options were deleted successfully.' });

  } catch (err) {
    // If any error occurs, roll back the entire transaction
    await client.query('ROLLBACK');
    console.error(`Error deleting poll ${id}:`, err);
    res.status(500).json({ error: 'Server error during poll deletion.' });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});


app.get('/api/polls', async (req, res) => {
  const { restaurantId } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'Missing restaurantId' });
  }

  try {
    // 1. Get all polls for the given restaurant
    const pollsResult = await pool.query(
      'SELECT id, question FROM polls WHERE restaurantid = $1 ORDER BY id DESC',
      [restaurantId]
    );

    const polls = pollsResult.rows;
    if (polls.length === 0) {
      return res.json([]);
    }

    // 2. Get all options for those polls in a single second query
    const pollIds = polls.map(p => p.id);
    const optionsResult = await pool.query(
      'SELECT id, pollid, optiontext, votes FROM polloptions WHERE pollid = ANY($1::int[]) ORDER BY id ASC',
      [pollIds]
    );

    // 3. Map the options back to their parent polls (This is the section you posted)
    const pollsWithDetails = polls.map(poll => {
      const pollOptions = optionsResult.rows.filter(opt => opt.pollid === poll.id);
      const totalVotes = pollOptions.reduce((sum, opt) => sum + opt.votes, 0);

      return {
        id: poll.id,
        question: poll.question,
        options: pollOptions.map(opt => ({
          id: opt.id,
          text: opt.optiontext,
          votes: opt.votes
        })),
        totalVotes: totalVotes,
        status: 'active'
      };
    });

    res.json(pollsWithDetails);

  } catch (err) {
    console.error('❌ Error fetching polls:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});// Add this new route to your server.js file

app.put('/api/poll-options/vote/:optionId', async (req, res) => {
  const { optionId } = req.params;

  try {
    // Atomically increment the vote count for the given option ID
    // RETURNING * sends the updated row back to the frontend
    const result = await pool.query(
      'UPDATE polloptions SET votes = votes + 1 WHERE id = $1 RETURNING *',
      [optionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Poll option not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(`❌ Error voting for option ${optionId}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// POST create new poll with options
app.post('/api/polls', async (req, res) => {
  const { restaurantId, question, options } = req.body;

  if (!restaurantId || !question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).send('Invalid poll input');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // INSERT poll (only restaurantId + question)
    const pollRes = await client.query(
      'INSERT INTO polls (restaurantid, question) VALUES ($1, $2) RETURNING id',
      [restaurantId, question]
    );
    const pollId = pollRes.rows[0].id;

    // INSERT options
    const insertOptionQuery = 'INSERT INTO polloptions (pollid, optiontext, votes) VALUES ($1, $2, 0)';
    for (const optionText of options) {
      await client.query(insertOptionQuery, [pollId, optionText]);
    }

    await client.query('COMMIT');
    res.status(201).json({ pollId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ POST /api/polls error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ========== INVENTORY ==========
// GET inventory items for a specific restaurant
// Get inventory for a restaurant
app.get('/api/inventory', async (req, res) => {
  const { restaurantId } = req.query;
  try {
    const result = await pool.query('SELECT * FROM inventory WHERE restaurantid = $1 ORDER BY datereceived DESC', [restaurantId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Add new inventory item
app.post('/api/inventory', async (req, res) => {
  const {
    item,
    quantity,
    unit,
    state,
    threshold,
    rate,
    totalprice,
    suppliername,
    suppliernumber,
    datereceived,
    restaurantid,
  } = req.body;

  if (!item || !restaurantid) {
    return res.status(400).json({ error: 'Item name and restaurantId are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO inventory 
      (item, quantity, unit, state, threshold, rate, totalprice, suppliername, suppliernumber, datereceived, restaurantid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        item,
        quantity !== undefined ? quantity : 0,
        unit || 'kg',
        state || 'Available',
        threshold !== undefined ? threshold : 0,
        rate || null,
        totalprice || null,
        suppliername || null,
        suppliernumber || null,
        datereceived || null,
        restaurantid,
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding inventory item:', error);
    res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

// PUT /api/inventory/:id - Update inventory item partially
app.put('/api/inventory/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  // Allowed fields for update
  const fields = [
    'item',
    'quantity',
    'unit',
    'state',
    'threshold',
    'rate',
    'totalprice',
    'suppliername',
    'suppliernumber',
    'datereceived',
  ];

  const updates = [];
  const values = [];
  let idx = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx}`);
      values.push(req.body[field]);
      idx++;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided to update' });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE inventory SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM inventory WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

//Expenses
// GET expenses by restaurantId
// GET all expenses for a restaurant
app.get('/api/expenses', async (req, res) => {
  // 1. Get the restaurantId from the query parameters sent by the frontend.
  const { restaurantId } = req.query;
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  try {
    // 2. Use the restaurantId to query the 'expenses' table.
    // This ensures only expenses for the logged-in user's restaurant are fetched.
    // We SELECT from lowercase columns (Postgres default) and alias them to camelCase for the frontend.
    const result = await pool.query(
      `SELECT 
         id, 
         description, 
         amount, 
         totalpaid AS "totalPaid", 
         staffpaid AS "staffPaid", 
         paidto AS "paidTo", 
         phonenumber AS "phoneNumber", 
         date, 
         restaurantid AS "restaurantId"
       FROM expenses 
       WHERE restaurantid = $1 
       ORDER BY date DESC`,
      [restaurantId]
    );
    // 3. Send the filtered expenses back to the frontend in a consistent camelCase format.
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching expenses:', err.message);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST add a new expense
app.post('/api/expenses', async (req, res) => {
  // The frontend sends camelCase keys, which we destructure here.
  const { description, amount, totalPaid, staffPaid, paidTo, phoneNumber, date, restaurantId } = req.body;

  if (!description || !amount || !totalPaid || !staffPaid || !paidTo || !phoneNumber || !date || !restaurantId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // We INSERT into the lowercase database columns, which is the Postgres default.
    const result = await pool.query(
      `INSERT INTO expenses 
      (description, amount, totalpaid, staffpaid, paidto, phonenumber, date, restaurantid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      // ✅ CORRECTED: The variable 'PaidTo' is now correctly cased as 'paidTo'.
      [description, amount, totalPaid, staffPaid, paidTo, phoneNumber, date, restaurantId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Failed to insert expense:', err.message);
    res.status(500).json({ error: 'Failed to submit expense' });
  }
});


// PUT update an existing expense by its ID
app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { description, amount, totalPaid, staffPaid, paidTo, phoneNumber, date } = req.body;

  try {
    // We UPDATE the lowercase database columns.
    const result = await pool.query(
      `UPDATE expenses SET 
        description = $1, amount = $2, totalpaid = $3, staffpaid = $4, 
        paidto = $5, phonenumber = $6, date = $7
       WHERE id = $8
       RETURNING *`,
      [description, amount, totalPaid, staffPaid, paidTo, phoneNumber, date, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating expense:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE an expense by its ID
app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Error deleting expense:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//Cahsflow


// This is the main endpoint for your cash flow page.
// It fetches summary data and detailed transaction lists based on a date range.
app.get('/api/financials', async (req, res) => {
  const { restaurantId, startDate, endDate } = req.query;

  if (!restaurantId || !startDate || !endDate) {
    return res.status(400).json({ error: 'restaurantId, startDate, and endDate are required.' });
  }

  try {
    // --- REAL-TIME TOTALS CALCULATION ---
    // 1. Calculate Total Billed Amount (Cash In) directly from the 'orders' table.
    // COALESCE ensures we get 0 instead of null if there are no orders.
    const totalBilledQuery = `
      SELECT COALESCE(SUM(totalamount), 0) AS total 
      FROM orders 
      WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3;
    `;
    const totalBilledResult = await pool.query(totalBilledQuery, [restaurantId, startDate, endDate]);
    const totalBilled = parseFloat(totalBilledResult.rows[0].total);

    // 2. Calculate Total Expenses (Cash Out) directly from the 'expenses' table.
    const totalExpensesQuery = `
      SELECT COALESCE(SUM(totalpaid), 0) AS total 
      FROM expenses 
      WHERE restaurantid = $1 AND date BETWEEN $2 AND $3;
    `;
    const totalExpensesResult = await pool.query(totalExpensesQuery, [restaurantId, startDate, endDate]);
    const totalExpenses = parseFloat(totalExpensesResult.rows[0].total);

    // 3. Calculate net profit.
    const totalProfit = totalBilled - totalExpenses;


    // --- DETAILED TRANSACTION LISTS ---
    // 4. Get detailed "Cash In" items (from orders table) for the list.
    const cashInQuery = `
      SELECT 
        id,
        billno AS "invoiceNo",
        customername AS "customerName",
        totalamount AS "amount",
        paymenttype AS "paymentType",
        orderdate AS "date",
        to_char(orderdate, 'HH24:MI') as "time"
      FROM orders
      WHERE restaurantid = $1 AND DATE(orderdate) BETWEEN $2 AND $3
      ORDER BY orderdate DESC;
    `;
    const cashInResult = await pool.query(cashInQuery, [restaurantId, startDate, endDate]);

    // 5. Get detailed "Cash Out" items (from expenses table) for the list.
    const cashOutQuery = `
      SELECT 
        id,
        description,
        totalpaid AS "amount",
        staffpaid AS "paidBy",
        paidto AS "paidTo",
        date
      FROM expenses
      WHERE restaurantid = $1 AND date BETWEEN $2 AND $3
      ORDER BY date DESC;
    `;
    const cashOutResult = await pool.query(cashOutQuery, [restaurantId, startDate, endDate]);

    // 6. Send all data back in one response with the freshly calculated totals.
    res.json({
      summary: {
        totalProfit: totalProfit,
        totalBilled: totalBilled,
        totalExpenses: totalExpenses,
      },
      billedAmounts: cashInResult.rows,
      expenses: cashOutResult.rows,
    });

  } catch (err) {
    console.error('Error fetching financial data:', err);
    res.status(500).json({ error: 'Failed to fetch financial data.' });
  }
});


// Billing
// In server.js, find the app.post('/api/orders', ...) route and update it
// In server.js

// NEW ENDPOINT: Directly occupy a table by creating a new, empty order.
// In server.js

// NEW ENDPOINT: Directly occupy a table by creating a new, empty order.

// ... your existing app.post('/api/orders', ...) route and other routes follow
app.post('/api/orders', async (req, res) => {
  const {
    customername, customerno, email_id = null, deliverytype, paymenttype,
    totalamount, orderitems, restaurantid, isoptedin, ispaid,
    tablenumber = null, categoryid = null, staff_id = null
  } = req.body;

  // --- DEBUG LOG 1: See what data the server receives ---
  console.log(`[POST /api/orders] Received order for Table: ${tablenumber}, Category ID: ${categoryid}`);

  if (!restaurantid || !orderitems || !Array.isArray(orderitems) || orderitems.length === 0) {
    return res.status(400).json({ error: 'Missing required fields or order items' });
  }

  const parsedRestaurantId = parseInt(restaurantid, 10);
  if (isNaN(parsedRestaurantId)) {
    return res.status(400).json({ error: `Invalid restaurant ID format.` });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingOrderRes = await client.query(
      `SELECT id, billno, totalamount FROM orders 
       WHERE restaurantid = $1 AND tablenumber = $2 AND categoryid = $3 AND ispaid = false 
       ORDER BY orderdate DESC LIMIT 1`,
      [parsedRestaurantId, tablenumber, categoryid]
    );

    let orderId;
    let billNo;

    if (existingOrderRes.rowCount > 0) {
      // Logic for an already existing order (e.g., adding more items)
      const existingOrder = existingOrderRes.rows[0];
      orderId = existingOrder.id;
      billNo = existingOrder.billno;
      
      const newTotalAmount = parseFloat(existingOrder.totalamount) + totalamount;

      await client.query(
        `UPDATE orders SET totalamount = $1, status = 'pending', accepted_time = NULL, served_time = NULL WHERE id = $2`,
        [newTotalAmount, orderId]
      );

      for (const item of orderitems) {
          const { menuid, itemname, quantity, price } = item;
          const existingItemRes = await client.query(
              `SELECT id, quantity FROM order_details WHERE order_id = $1 AND menu_item_id = $2`,
              [orderId, menuid]
          );

          if (existingItemRes.rowCount > 0) {
              const existingItem = existingItemRes.rows[0];
              const newTotalQuantity = existingItem.quantity + quantity;
              await client.query(
                  `UPDATE order_details SET quantity = $1 WHERE id = $2`,
                  [newTotalQuantity, existingItem.id]
              );
          } else {
              await client.query(
                  `INSERT INTO order_details (order_id, restaurantid, billno, menu_item_id, quantity, price_at_order, item_name, quantity_served)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
                  [orderId, parsedRestaurantId, billNo, menuid, quantity, price, itemname]
              );
          }
      }

    } else {
      // Logic for a brand new order
      const orderInsertQuery = `
        INSERT INTO orders (restaurantid, customername, customerno, email_id, deliverytype, paymenttype, totalamount, isoptedin, ispaid, tablenumber, categoryid, staff_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
        RETURNING id, billno;
      `;
      const orderResult = await client.query(orderInsertQuery, [
        parsedRestaurantId, customername, customerno, email_id, deliverytype, paymenttype, totalamount, isoptedin, ispaid, tablenumber, categoryid, staff_id
      ]);
      
      orderId = orderResult.rows[0].id;
      billNo = orderResult.rows[0].billno;

      if (tablenumber && categoryid) {
        // --- DEBUG LOG 2: Check if the condition to occupy the table is met ---
        console.log(`Attempting to occupy table with Number: ${tablenumber} and Category ID: ${categoryid}`);
        
        const updateResult = await client.query(
          `UPDATE restauranttables SET status = 'occupied' WHERE restaurantid = $1 AND tablenumber = $2 AND categoryid = $3`,
          [parsedRestaurantId, tablenumber, categoryid]
        );
        
        // --- DEBUG LOG 3: See if the database update was successful ---
        console.log(`Table update query affected ${updateResult.rowCount} row(s).`);
      }
      
      for (const item of orderitems) {
          await client.query(
              `INSERT INTO order_details (order_id, restaurantid, billno, menu_item_id, quantity, price_at_order, item_name, quantity_served)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
              [orderId, parsedRestaurantId, billNo, item.menuid, item.quantity, item.price, item.itemname]
          );
      }
    }

    await client.query('COMMIT');
    
    const roomName = `restaurant-${parsedRestaurantId}`;
    const kotPayload = {
        message: `New KOT received for Bill No: ${billNo}`,
        restaurant_id: parsedRestaurantId,
        order_id: orderId,
        bill_no: billNo,
    };
    io.to(roomName).emit('new-order-for-kitchen', kotPayload);
    
    res.status(201).json({ message: 'Order updated successfully', billno: billNo });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error in [POST /api/orders]:', err);
    res.status(500).json({ error: 'Internal server error during transaction' });
  } finally {
    client.release();
  }
});


// GET the active (unpaid) order for a specific table
// This replaces your existing /api/orders/by-table route

// In server.js

// GET the active (unpaid) order for a specific table
app.get('/api/orders/by-table', async (req, res) => {
  // We now accept 'tableCategoryId' to uniquely identify the table
  const { restaurantId, tableNumber, tableCategoryId } = req.query;

  if (!restaurantId || !tableNumber || !tableCategoryId) {
    return res.status(400).json({ error: 'Restaurant ID, Table Number, and Table Category ID are required' });
  }

  try {
    const orderResult = await pool.query(
      `SELECT * FROM orders 
       WHERE restaurantid = $1 AND tablenumber = $2 AND categoryid = $3 AND ispaid = false 
       ORDER BY orderdate DESC LIMIT 1`,
      [restaurantId, tableNumber, tableCategoryId] // Use all three params
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: 'No active order found for this table.' });
    }

    const order = orderResult.rows[0];

    const detailsResult = await pool.query(
      `SELECT * FROM order_details WHERE order_id = $1`,
      [order.id]
    );

    res.json({
      ...order,
      items: detailsResult.rows
    });

  } catch (err) {
    console.error('❌ Error fetching active order by table:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PUT (Update) - Finalize a bill and free the table
// This is a new route to add to your server.js
// In server.js, add or replace your existing PUT /api/orders/:orderId/finalize route with this version.
// ADD THIS NEW ROUTE to server.js

// GET a single order's full details by its bill number
app.get('/api/orders/details/:billno', async (req, res) => {
  const { billno } = req.params;
  const { restaurantId } = req.query; // Pass restaurantId for security

  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant ID is required' });
  }

  try {
    // First, find the order by its bill number
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE billno = $1 AND restaurantid = $2`,
      [billno, restaurantId]
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // Then, get all the items for that order from order_details
    const detailsResult = await pool.query(
      `SELECT * FROM order_details WHERE order_id = $1`,
      [order.id]
    );

    // Combine the order with its items and send it back
    res.json({
      ...order,
      items: detailsResult.rows
    });

  } catch (err) {
    console.error(`Error fetching details for bill no ${billno}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// In server.js, REPLACE your existing '/api/orders/:orderId/finalize' route with this one:

app.put('/api/orders/:orderId/finalize', async (req, res) => {
  const { orderId } = req.params;
  const { paymentMode, customername, customerno, email_id } = req.body;

  if (!paymentMode) {
    return res.status(400).json({ error: 'Payment mode is required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Transaction starts

    // First, get the order's delivery type
    const orderTypeRes = await client.query('SELECT deliverytype FROM orders WHERE id = $1', [orderId]);
    if (orderTypeRes.rowCount === 0) {
      throw new Error('Order not found.');
    }
    const { deliverytype } = orderTypeRes.rows[0];

    // Determine the final status based on the order type
    // If it's a 'Dine-in' order, the final status is 'paid'. Otherwise, it's 'delivered'.
    const finalStatus = (deliverytype?.toLowerCase() === 'dine-in') ? 'paid' : 'delivered';

    // The UPDATE query now includes the logic to set the final status
    const orderUpdateResult = await client.query(
      `UPDATE orders SET 
        ispaid = true, 
        paymenttype = $1, 
        status = $2, -- This line is new
        customername = $3, 
        customerno = $4, 
        email_id = $5 
       WHERE id = $6 
       RETURNING restaurantid, tablenumber, categoryid`,
      [paymentMode, finalStatus, customername, customerno, email_id, orderId]
    );
    
    const { restaurantid, tablenumber, categoryid } = orderUpdateResult.rows[0];

    // If the order was for a table, free up the table
    if (tablenumber && categoryid) {
       await client.query(
        `UPDATE restauranttables SET status = 'available' WHERE restaurantid = $1 AND tablenumber = $2 AND categoryid = $3`,
        [restaurantid, tablenumber, categoryid]
      );
    }

    await client.query('COMMIT'); // Transaction is committed
    res.status(200).json({ message: 'Bill finalized and status updated successfully.' });

  } catch (err) {
    await client.query('ROLLBACK'); // Rolls back changes on error
    console.error(`❌ Error finalizing order ${orderId}:`, err);
    res.status(500).json({ error: 'Failed to finalize bill.' });
  } finally {
    client.release(); // Releases the database client
  }
});
// This should be placed before you start the server (app.listen(...))
// Import the email sending function from our new service file
const { sendTokenEmail } = require('./emailService');
// POST /api/valet - Adds a new car and uses the email service
// We make the route handler async to use await

//Customers
// GET CUSTOMERS FOR OFFERS PAGE
// GET CUSTOMERS FOR OFFERS PAGE
app.get('/api/customers', async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  try {
    // This query now also selects the 'email_id' and aliases it as 'email'.
    // The DISTINCT ON and ORDER BY clauses are updated to correctly handle unique customers.
    const query = `
      SELECT DISTINCT ON (customername, customerno, email_id)
        id,
        customername AS name,
        customerno AS phone,
        email_id AS email,
        orderdate AS "lastVisit"
      FROM orders
      WHERE restaurantid = $1 AND customername IS NOT NULL AND customerno IS NOT NULL
      ORDER BY customername, customerno, email_id, orderdate DESC;
    `;
    const { rows } = await pool.query(query, [restaurantId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});
// --- ADD THIS API ENDPOINT ---
// 2. ADD the new API route to handle the request from the frontend
app.post('/api/send-offer-email', async (req, res) => {
    try {
        // The req.body will contain { pdf, emails, offerTitle } from the frontend
        await sendOfferEmail(req.body);
        res.status(200).json({ message: 'Emails sent successfully!' });
    } catch (error) {
        console.error('SERVER ERROR: Failed to send emails.', error);
        res.status(500).json({ message: 'An error occurred while sending the offer.' });
    }
});
// In server.js

// ... (other routes)

// POST a new order manually from the order list page
app.post('/api/orders/manual', async (req, res) => {
  const {
    customername,
    customerno,
    email_id, // ADD THIS
    totalamount,
    paymenttype,
    deliverytype,
    ispaid,
    orderdate,
    restaurantId
  } = req.body;

  if (!customername || !totalamount || !restaurantId) {
    return res.status(400).json({ error: 'Customer name, total amount, and restaurantId are required.' });
  }

  try {
    // ADD "email_id" to the query
    const query = `
      INSERT INTO orders 
        (customername, customerno, totalamount, paymenttype, deliverytype, ispaid, orderdate, restaurantid, status, email_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9)
      RETURNING *;
    `;
    // ADD "email_id" to the values array
    const values = [customername, customerno, totalamount, paymenttype, deliverytype, ispaid, orderdate, restaurantId, email_id];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error creating manual order:', error);
    res.status(500).json({ error: 'Failed to create manual order.' });
  }
});


// ... (the rest of your server.js file)


//CHEF 
// CHEF - Kitchen Orders (only show unserved items)
app.get('/api/kitchen-orders', async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
  const parsedRestaurantId = parseInt(restaurantId, 10);
  if (isNaN(parsedRestaurantId)) return res.status(400).json({ error: 'Invalid restaurantId format' });

  try {
    // **FIX**: This query now only fetches items where the total quantity is greater than the served quantity.
    const query = `
      SELECT
        o.id, o.tablenumber, c.name AS "categoryName", s.fullname AS "waiterName",
        o.orderdate AS "placedTime", o.status, o.accepted_time AS "acceptedTime", o.served_time AS "servedTime",
        (
          SELECT json_agg(
            json_build_object(
              'name', od.item_name, 
              'quantity', od.quantity - od.quantity_served
            )
          )
          FROM order_details od
          WHERE od.order_id = o.id AND od.quantity > od.quantity_served
        ) AS items
      FROM orders o
      LEFT JOIN staff s ON o.staff_id = s.id
      LEFT JOIN categories c ON o.categoryid = c.id
      WHERE o.restaurantid = $1 AND o.ispaid = false
      ORDER BY o.orderdate DESC;
    `;

    const { rows } = await pool.query(query, [parsedRestaurantId]);
    const filteredRows = rows.filter(order => order.items && order.items.length > 0);
    res.json(filteredRows);
  } catch (err) {
    console.error('Error fetching kitchen orders:', err);
    res.status(500).json({ error: 'Failed to fetch kitchen orders' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    if (status === 'served') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const orderUpdateResult = await client.query(
                `UPDATE orders SET status = $1, served_time = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
                [status, id]
            );
            if (orderUpdateResult.rowCount === 0) throw new Error('Order not found');

            // **FIX**: When marking as served, set the served quantity equal to the total quantity.
            await client.query(
                `UPDATE order_details SET quantity_served = quantity WHERE order_id = $1`,
                [id]
            );

            await client.query('COMMIT');
            res.json(orderUpdateResult.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`Error marking order ${id} as served:`, err);
            res.status(500).json({ error: 'Failed to update order status' });
        } finally {
            client.release();
        }
    } else {
        let query;
        const params = [status, id];
        if (status === 'accepted') {
            query = `UPDATE orders SET status = $1, accepted_time = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
        } else {
            query = `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`;
        }
        try {
            const result = await pool.query(query, params);
            if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
            res.json(result.rows[0]);
        } catch (err) {
            console.error(`Error updating order status for order ${id}:`, err);
            res.status(500).json({ error: 'Failed to update order status' });
        }
    }
});

// ========== TIPS ROUTE (NEW) ==========
// In server.js

// ... (keep all your existing routes)

// ========== TIPS ROUTES (NEW) ==========

// POST /api/tips - Called by the guest on TipPage.jsx to save a new tip
app.post('/api/tips', async (req, res) => {
  const { restaurantid, staffid, orderid, amount } = req.body;

  if (!restaurantid || !amount || !orderid) {
    return res.status(400).json({ error: 'Restaurant ID, Order ID, and Tip Amount are required.' });
  }

  try {
    // This query now saves the tip against the specific order ID
    const query = `
      INSERT INTO tips (restaurantid, staffid, order_id, amount, date)
      VALUES ($1, $2, $3, $4, CURRENT_DATE)
      ON CONFLICT (order_id) DO UPDATE SET
        amount = EXCLUDED.amount,
        staffid = EXCLUDED.staffid
      RETURNING *;
    `;
    // The ON CONFLICT clause allows a guest to change their tip before the bill is finalized.
    const values = [restaurantid, staffid || null, orderid, parseFloat(amount)];
    const result = await pool.query(query, values);
    
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error saving tip:', error);
    res.status(500).json({ error: 'Failed to save tip.' });
  }
});

// GET /api/tips?orderId=... - Called by BillingPage.js to retrieve the tip
app.get('/api/tips', async (req, res) => {
    const { orderId } = req.query;

    if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required.' });
    }

    try {
        const result = await pool.query(
            'SELECT amount FROM tips WHERE order_id = $1 LIMIT 1',
            [orderId]
        );

        if (result.rowCount > 0) {
            res.json(result.rows[0]);
        } else {
            // If no tip is found, return 0.
            res.json({ amount: 0 });
        }
    } catch (error) {
        console.error('Error fetching tip:', error);
        res.status(500).json({ error: 'Failed to fetch tip.' });
    }
});
// ========== STAFF + ATTENDANCE ==========

/**
 * @route   DELETE /api/staff/:id
 * @desc    Delete a staff member
 * @access  Private
 */


// ========== ATTENDANCE UPDATE & DELETE ROUTES ==========

/**
 * @route   PUT /api/attendance/:id
 * @desc    Update an attendance record, primarily for clocking out
 * @access  Private
 */


/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete an attendance record
 * @access  Private
 */
app.delete('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM attendance WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ error: 'Internal server error while deleting attendance' });
  }
});



// ========== ATTENDANCE ROUTES (UPDATED) ========== //

app.get('/api/attendance', async (req, res) => {
  const { restaurantId, date } = req.query;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  try {
    // This query now joins staff to get the full name for each attendance record.
    let query = `SELECT a.*, s.fullname 
                 FROM attendance a 
                 JOIN staff s ON a.staffid = s.id
                 WHERE s.restaurantid = $1`;
    let params = [restaurantId];

    // UPDATED: Filtering by the 'attendancedate' column for better performance.
    if (date) {
      query += ` AND a.attendancedate = $2`;
      params.push(date);
    }

    query += ` ORDER BY a.checkin DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/attendance', async (req, res) => {
  const { staffid, restaurantid, shift } = req.body;

  const client = await pool.connect();
  try {
    const staffCheck = await client.query(
      'SELECT id FROM staff WHERE id = $1 AND restaurantid = $2',
      [staffid, restaurantid]
    );

    if (staffCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Staff not found or does not belong to this restaurant' });
    }
    
    // The query now uses CURRENT_TIMESTAMP to set the check-in time.
    const result = await client.query(
      `INSERT INTO attendance (staffid, checkin, shift)
       VALUES ($1, CURRENT_TIMESTAMP, $2) RETURNING *`,
      [staffid, shift]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting attendance:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
      client.release();
  }
});

// ✅ FIX: This route now generates the timestamp on the server.
app.put('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    // The query now uses CURRENT_TIMESTAMP to set the checkout time
    // and calculates the duration automatically.
    const query = `UPDATE attendance SET
                    checkout = CURRENT_TIMESTAMP,
                    shiftduration = (CURRENT_TIMESTAMP - checkin)
                   WHERE id = $1
                   RETURNING *`;
    
    const result = await client.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/attendance/:id error:', err);
    res.status(500).json({ error: 'Error updating attendance' });
  } finally {
      client.release();
  }
});




//STAFF
app.get('/api/staff', async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });

  try {
    const result = await pool.query(
      'SELECT * FROM staff WHERE restaurantid = $1 ORDER BY fullname ASC',
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching staff:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// POST Staff (Create new Staff and User Credentials)
// server.js

// POST Staff (Create new Staff and User Credentials)
// server.js

// ... (keep all your existing code)

// POST Staff (Create new Staff and User Credentials) - UPDATED
// In server.js, REPLACE your existing app.post('/api/staff', ...) with this version

app.post('/api/staff', async (req, res) => {
  const {
    restaurantid, fullname, phonenumber, email, role,
    staffphoto, idcardphoto, password, monthly_salary
  } = req.body;

  if (!restaurantid || !email || !password || !role || !fullname) {
    return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start a transaction

    // Step 1: Insert into the 'staff' table first and get the new ID back.
    // The "RETURNING id" clause is the most important part here.
    const staffResult = await client.query(
      `INSERT INTO staff (restaurantid, fullname, phonenumber, email, role, staffphoto, idcardphoto, monthly_salary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, // Get the new ID
      [restaurantid, fullname, phonenumber, email, role, staffphoto, idcardphoto, monthly_salary || 0]
    );
    
    // This is the newly created, correct ID from the 'staff' table.
    const newStaffId = staffResult.rows[0].id;

    // Step 2: Now, use that exact 'newStaffId' to create the user's login credentials.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userCredentialsQuery = `
      INSERT INTO usercredentials (id, restaurantid, email, password, role)
      VALUES ($1, $2, $3, $4, $5)
    `;
    // We are now providing the ID explicitly to ensure it matches.
    await client.query(userCredentialsQuery, [newStaffId, restaurantid, email, hashedPassword, role]);

    await client.query('COMMIT'); // Commit the transaction
    
    // Return the full staff object you created
    const finalStaffResult = await pool.query('SELECT * FROM staff WHERE id = $1', [newStaffId]);
    res.status(201).json(finalStaffResult.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK'); // Roll back changes on error
    console.error('Error inserting staff and credentials:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email or ID already exists.' });
    }
    res.status(500).json({ error: 'Internal server error while saving staff' });
  } finally {
    client.release();
  }
});


/**
 * @route   PUT /api/staff/:id
 * @desc    Update a staff member and their corresponding credentials - UPDATED
 * @access  Private
 */
app.put('/api/staff/:id', async (req, res) => {
    const { id } = req.params;
    const {
        fullname, phonenumber, email, role, staffphoto, idcardphoto, monthly_salary // Added monthly_salary
    } = req.body;

    if (!fullname || !role || !email) {
        return res.status(400).json({ error: 'Full name, email, and role are required fields' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const oldStaffData = await client.query('SELECT email FROM staff WHERE id = $1', [id]);
        if (oldStaffData.rowCount === 0) {
            return res.status(404).json({ error: 'Staff member not found' });
        }
        const oldEmail = oldStaffData.rows[0].email;

        // Update the staff table, now including monthly_salary
        const staffUpdateResult = await pool.query(
            `UPDATE staff SET
              fullname = $1, phonenumber = $2, email = $3, role = $4, staffphoto = $5, idcardphoto = $6, monthly_salary = $7
            WHERE id = $8
            RETURNING *`,
            [fullname, phonenumber, email, role, staffphoto, idcardphoto, monthly_salary || 0, id]
        );
        
        await client.query(
            `UPDATE usercredentials SET email = $1, role = $2 WHERE email = $3`,
            [email, role, oldEmail]
        );
        
        await client.query('COMMIT');
        res.json(staffUpdateResult.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating staff:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Another user with this email already exists.' });
        }
        res.status(500).json({ error: 'Internal server error while updating staff' });
    } finally {
        client.release();
    }
});

// ... (keep all your other routes)





/**
 * @route   DELETE /api/staff/:id
 * @desc    Delete a staff member and their corresponding credentials
 * @access  Private
 */
app.delete('/api/staff/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
      await client.query('BEGIN');

      // Get the staff member's email before deleting them from the staff table
      const staffRes = await client.query('SELECT email FROM staff WHERE id = $1', [id]);
      if (staffRes.rowCount === 0) {
          // If staff not found, no need to proceed.
          return res.status(404).json({ error: 'Staff member not found' });
      }
      const { email } = staffRes.rows[0];

      // Delete the user from the usercredentials table using their email.
      if (email) {
          await client.query('DELETE FROM usercredentials WHERE email = $1', [email]);
      }
      
      // If your attendance table has a foreign key to staff with ON DELETE CASCADE,
      // the next line is not needed. But it's safer to have it.
      await client.query('DELETE FROM attendance WHERE staffid = $1', [id]);

      // Finally, delete the staff member from the staff table.
      await client.query('DELETE FROM staff WHERE id = $1', [id]);

      await client.query('COMMIT');
      res.json({ message: 'Staff member and their credentials deleted successfully' });

  } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error deleting staff:', err);
      res.status(500).json({ error: 'Internal server error while deleting staff' });
  } finally {
      client.release();
  }
});
//PAYROLL
// server.js

// ... (at the end of your API routes, before app.listen)

// ========== PAYROLL ROUTES (NEW) ==========

// GET Payroll data for a given month
app.get('/api/payroll', async (req, res) => {
    const { restaurantId, month } = req.query; // month should be in 'YYYY-MM-DD' format (e.g., '2025-08-01')

    if (!restaurantId || !month) {
        return res.status(400).json({ error: 'Restaurant ID and month are required.' });
    }

    try {
        const firstDayOfMonth = month;
        const lastDayOfMonth = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).toISOString().split('T')[0];

        // This complex query does everything in one go for efficiency:
        // 1. Fetches all staff from the restaurant.
        // 2. LEFT JOINs any existing payroll data for the month.
        // 3. LEFT JOINs a subquery that calculates actual present days from the attendance table.
        const query = `
            WITH AttendanceSummary AS (
                SELECT
                    staffid,
                    COUNT(DISTINCT attendancedate) AS calculated_present_days
                FROM attendance
                WHERE attendancedate BETWEEN $2 AND $3
                GROUP BY staffid
            )
            SELECT
                s.id,
                s.fullname AS name,
                s.monthly_salary AS "monthlySalary",
                COALESCE(p.status, 'pending') AS status,
                COALESCE(p.already_paid, 0) AS "alreadyPaid",
                COALESCE(p.bonus, 0) AS bonus,
                -- Use saved present_days if available, otherwise use calculated days
                COALESCE(p.present_days, att.calculated_present_days, 0)::int AS "presentDays"
            FROM
                staff s
            LEFT JOIN
                payroll p ON s.id = p.staff_id AND p.payroll_month = $2
            LEFT JOIN
                AttendanceSummary att ON s.id = att.staffid
            WHERE
                s.restaurantid = $1
            ORDER BY
                s.fullname;
        `;

        const result = await pool.query(query, [restaurantId, firstDayOfMonth, lastDayOfMonth]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching payroll data:', err);
        res.status(500).json({ error: 'Server error fetching payroll data' });
    }
});

// POST (Save) Payroll data for a staff member for a specific month
app.post('/api/payroll', async (req, res) => {
    const {
        staffId,
        restaurantId,
        payrollMonth, // 'YYYY-MM-DD'
        monthlySalary,
        presentDays,
        absentDays,
        bonus,
        alreadyPaid,
        status
    } = req.body;

    if (!staffId || !restaurantId || !payrollMonth) {
        return res.status(400).json({ error: 'staffId, restaurantId, and payrollMonth are required.' });
    }

    try {
        // UPSERT operation: Insert a new record, or update the existing one if it already exists for that staff/month.
        const query = `
            INSERT INTO payroll (staff_id, restaurant_id, payroll_month, monthly_salary, present_days, absent_days, bonus, already_paid, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (staff_id, payroll_month) DO UPDATE SET
                monthly_salary = EXCLUDED.monthly_salary,
                present_days = EXCLUDED.present_days,
                absent_days = EXCLUDED.absent_days,
                bonus = EXCLUDED.bonus,
                already_paid = EXCLUDED.already_paid,
                status = EXCLUDED.status
            RETURNING *;
        `;
        const values = [staffId, restaurantId, payrollMonth, monthlySalary, presentDays, absentDays, bonus, alreadyPaid, status];
        const result = await pool.query(query, values);
        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error('Error saving payroll data:', err);
        res.status(500).json({ error: 'Server error saving payroll data.' });
    }
});


// Create a new valet parking record
// POST /api/valet - Adds a new car to the database and sends the token email.
app.post('/api/valet', async (req, res) => {
    console.log('POST /api/valet - Received new car request');
    const {
        token_number,
        owner_name,
        phone_number,
        car_number,
        email,
        status = 'With Us',
        restaurantId
    } = req.body;

    if (!token_number || !owner_name || !phone_number || !car_number || !email || !restaurantId) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        // First, save the car details to the database within a transaction
        const result = await pool.query(
            `INSERT INTO valet_parking
             (token_number, owner_name, phone_number, car_number, status, restaurantId)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [token_number, owner_name, phone_number, car_number, status, restaurantId]
        );
        const newCar = result.rows[0];

        // Then, attempt to send the email
        console.log(`Attempting to send email via emailService to ${email}...`);
        await sendTokenEmail(email, token_number, owner_name, car_number);

        console.log('Car details saved:', newCar);

        res.status(201).json({
            message: `Token sent to ${email} and car details saved.`,
            car: newCar
        });

    } catch (error) {
        console.error('The transaction or email service failed:', error);
        res.status(500).json({ message: 'Failed to save car details or send token email. Please check server configuration.' });
    }
});

// Get all valet cars for a restaurant
app.get('/api/valet', async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId query parameter required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM valet_parking WHERE restaurantId = $1 ORDER BY timestamp DESC',
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/valet error:', err);
    res.status(500).json({ error: 'Failed to fetch valet cars' });
  }
});

// Update valet car status or other fields by id
app.put('/api/valet/:id', async (req, res) => {
  const { id } = req.params;
  const {
    owner_name,
    phone_number,
    car_number,
    status,
    token_number,
  } = req.body;

  try {
    // Build dynamic query based on provided fields
    const fields = [];
    const values = [];
    let idx = 1;

    if (owner_name !== undefined) {
      fields.push(`owner_name = $${idx++}`);
      values.push(owner_name);
    }
    if (phone_number !== undefined) {
      fields.push(`phone_number = $${idx++}`);
      values.push(phone_number);
    }
    if (car_number !== undefined) {
      fields.push(`car_number = $${idx++}`);
      values.push(car_number);
    }
    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (token_number !== undefined) {
      fields.push(`token_number = $${idx++}`);
      values.push(token_number);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }

    values.push(id);
    const query = `UPDATE valet_parking SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Valet car not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/valet/:id error:', err);
    res.status(500).json({ error: 'Failed to update valet car' });
  }
});

// Delete valet car by id
app.delete('/api/valet/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM valet_parking WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Valet car not found' });
    }

    res.json({ message: 'Valet car deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/valet/:id error:', err);
    res.status(500).json({ error: 'Failed to delete valet car' });
  }
});


// ========== FEEDBACK ==========
app.get('/api/feedback', async (req, res) => {
  // 1. Get the restaurantId from the query parameters
  const { restaurantId } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant ID is required.' });
  }

  try {
    // 2. Query the database for all feedback matching the restaurantId, newest first
    const query = `
      SELECT id, timestamp, subject, message, type 
      FROM feedback 
      WHERE restaurantid = $1 
      ORDER BY timestamp DESC;
    `;
    const { rows } = await pool.query(query, [restaurantId]);

    // 3. Transform the data to match what the frontend component expects
    const formattedFeedback = rows.map(feedback => ({
      id: feedback.id,
      date: format(new Date(feedback.timestamp), 'dd MMM yyyy'), // e.g., "27 Jul 2025"
      time: format(new Date(feedback.timestamp), 'p'), // e.g., "1:38 PM"
      // Combine subject and message for a complete feedback text
      text: `${feedback.subject ? `<strong>${feedback.subject}</strong><br/>` : ''}${feedback.message}`
    }));

    // 4. Send the formatted data back to the frontend
    res.json(formattedFeedback);

  } catch (error) {
    console.error('Error fetching feedback from database:', error);
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

// In server.js

app.post('/api/feedback', async (req, res) => {
  // Destructure all expected fields, ensuring 'would_recommend' is included
  const {
    restaurantid,
    tableid,
    type,
    message,
    subject,
    rating,
    is_anonymous,
    would_recommend, // This line is crucial
    visit_frequency
  } = req.body;

  // Basic validation
  if (!restaurantid || !message || !type) {
    return res.status(400).json({ error: 'Missing required fields: restaurantid, message, type.' });
  }

  const query = `
    INSERT INTO feedback (
      restaurantid, tableid, type, message, subject, 
      rating, is_anonymous, would_recommend, visit_frequency
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const values = [
    restaurantid,
    tableid,
    type,
    message,
    subject,
    rating,
    is_anonymous,
    would_recommend, // Ensure it's passed to the query
    visit_frequency
  ];

  try {
    const result = await pool.query(query, values);
    // Send a 201 Created status with the new feedback record
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error inserting feedback into database:', error);
    res.status(500).json({ error: 'Failed to save feedback.' });
  }
});
// GET /api/restaurants/:id
app.put('/api/restaurants/:id/gst', async (req, res) => {
    const { id } = req.params;
    const { gst_number } = req.body;

    // Basic validation for the GST number format
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gst_number || !gstRegex.test(gst_number)) {
        return res.status(400).json({ error: 'A valid 15-digit GST number is required.' });
    }

    try {
        const result = await pool.query(
            `UPDATE restaurants SET gst_number = $1 WHERE id = $2 RETURNING *`,
            [gst_number, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Restaurant not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating GST for restaurant ${id}:`, err);
        res.status(500).json({ error: 'Server error while updating GST number.' });
    }
});




app.get('/api/restaurants/:id', async (req, res) => {
  const restaurantId = parseInt(req.params.id, 10);

  if (isNaN(restaurantId)) {
    return res.status(400).json({ error: 'Invalid restaurant ID.' });
  }

  try {
    // ✅ CORRECTED: Changed 'db.query' to 'pool.query'
    const result = await pool.query('SELECT * FROM restaurants WHERE id = $1', [restaurantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error fetching restaurant with ID ${restaurantId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
  const fs = require('fs');
const path = require('path');

// Make a folder to store bills if not exists
const billsDir = path.join(__dirname, 'public', 'bills');
if (!fs.existsSync(billsDir)) {
  fs.mkdirSync(billsDir, { recursive: true });
}

// Serve static files
app.use('/bills', express.static(billsDir));

app.post('/api/upload-bill', async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64 || !filename) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const filePath = path.join(billsDir, filename);
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(filePath, pdfBuffer);

    // Public URL (example: http://localhost:5000/bills/Bill_123.pdf)
    const fileUrl = `${req.protocol}://${req.get('host')}/bills/${filename}`;
    res.json({ url: fileUrl });
  } catch (err) {
    console.error('Error saving bill PDF:', err);
    res.status(500).json({ error: 'Failed to save PDF' });
  }
});
});


// ========== START SERVER ==========
server.listen(port, () => {
  console.log(`🚀 Local backend running at http://localhost:${port}`);
});
