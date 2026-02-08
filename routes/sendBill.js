const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

router.post('/api/send-bill', async (req, res) => {
  const { email, name, pdfBase64, filename } = req.body;

  if (!email || !pdfBase64) {
    return res.status(400).json({ error: 'Email and PDF are required.' });
  }

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // ✅ Mandatory for Port 465
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
});

  const mailOptions = {
    from: process.env.GMAIL_USER,
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
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;