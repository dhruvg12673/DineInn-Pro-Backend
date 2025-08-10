const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

router.post('/api/send-bill', async (req, res) => {
  const { email, name, pdfBase64, filename } = req.body;

  if (!email || !pdfBase64) {
    console.log("🚫 Missing fields:", { email, hasPDF: !!pdfBase64 });
    return res.status(400).json({ error: 'Email and PDF are required.' });
  }

  // Setup transporter using Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // From your .env file
      pass: process.env.EMAIL_PASS  // App-specific password (not Gmail login password)
    }
  });

  // Define the email options
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Restaurant Bill',
    text: `Hello ${name || 'Customer'},\n\nThank you for dining with us.\nPlease find your bill attached.\n\nBest regards,\nYour Restaurant`,
    attachments: [
      {
        filename: filename || 'Bill.pdf',
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    // Send the email
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}`);
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

module.exports = router;