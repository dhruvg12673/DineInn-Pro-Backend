const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// This wrapper allows the file to receive the 'pool' object from server.js
module.exports = (pool) => {
  
  // In-memory store for OTPs.
  const otpStore = {};

  // Your working Nodemailer transport configuration
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });


  /**
   * @route   POST /api/forgot-password/send-otp
   */
  router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    try {
      // ✅ ADDED: Check if a user with this email exists in your database.
      const userCheck = await pool.query('SELECT id FROM usercredentials WHERE email = $1', [email]);
      if (userCheck.rowCount === 0) {
        return res.status(404).json({ error: 'User with this email is not registered.' });
      }

      // This part remains the same as your working version
      const otp = crypto.randomInt(100000, 999999).toString();
      const expires = Date.now() + 5 * 60 * 1000;
      otpStore[email] = { otp, expires };

      console.log(`Generated OTP for ${email}: ${otp}`);

      const mailOptions = {
        from: '"DineInnPro Support" <no-reply@dineinnpro.com>',
        to: email,
        subject: 'Your Password Reset OTP',
        html: `<p>Your OTP is: <strong>${otp}</strong>. It is valid for 5 minutes.</p>`,
      };
      
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: 'OTP sent successfully.' });

    } catch (error) {
      console.error('Error in send-otp process:', error);
      res.status(500).json({ error: 'Failed to send OTP email.' });
    }
  });

  /**
   * @route   POST /api/forgot-password/verify-otp
   */
  router.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required.' });
    }
    const storedOtpData = otpStore[email];
    if (!storedOtpData) {
        return res.status(400).json({ error: 'Invalid OTP. Please request a new one.' });
    }
    if (Date.now() > storedOtpData.expires) {
        delete otpStore[email];
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    if (storedOtpData.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP.' });
    }
    res.status(200).json({ message: 'OTP verified successfully.' });
  });

  /**
   * @route   POST /api/forgot-password/reset-password
   */
  router.post('/reset-password', async (req, res) => {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) {
        return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
    }

    const storedOtpData = otpStore[email];
    if (!storedOtpData || storedOtpData.otp !== otp || Date.now() > storedOtpData.expires) {
        return res.status(400).json({ error: 'Invalid or expired session. Please start over.' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.query(
          'UPDATE usercredentials SET password = $1 WHERE email = $2',
          [hashedPassword, email]
        );
        
        console.log(`Password for ${email} has been updated.`);
        
        delete otpStore[email];
        res.status(200).json({ message: 'Password has been reset successfully.' });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
  });

  return router;
};
