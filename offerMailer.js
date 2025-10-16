const nodemailer = require('nodemailer');

// --- 1. CORRECTED Nodemailer Transporter Setup ---
// This explicit configuration is more reliable on cloud platforms like Render
// and securely uses your environment variables.
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Must be false for port 587
    auth: {
        user: process.env.EMAIL_USER, // Loads email from environment variable
        pass: process.env.EMAIL_PASS  // Loads password from environment variable
    },
    tls: {
      rejectUnauthorized: false
    }
});

/**
 * Sends an email with a PDF attachment to a list of recipients.
 */
async function sendOfferEmail({ pdf, emails, offerTitle }) {
    if (!emails || emails.length === 0) {
        console.log("No emails to send.");
        return;
    }

    const mailOptions = {
        from: '"DineInn Pro Offers" <dineinnpro@gmail.com>', // Set your "from" name
        to: emails.join(','),
        subject: `A Special Offer For You: ${offerTitle}`,
        html: `
            <p>Dear Valued Customer,</p>
            <p>Thank you for being one of our best customers! We're excited to share a special promotional offer with you.</p>
            <p>Please find the details in the attached PDF.</p>
            <br>
            <p>We look forward to seeing you soon!</p>
            <p>Best,</p>
            <p>The DineInn Pro Team</p>
        `,
        attachments: [
            {
                filename: 'promotional-offer.pdf',
                // --- 2. CORRECTED PDF Handling ---
                // This removes the "data:application/pdf;base64," part from the string
                content: pdf.split("base64,")[1],
                encoding: 'base64',
                contentType: 'application/pdf'
            },
        ],
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Offer emails sent successfully:', info.response);
        return info;
    } catch (error) {
        console.error('❌ Error sending offer emails:', error);
        throw error;
    }
}

module.exports = { sendOfferEmail };