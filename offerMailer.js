// offerMailer.js

const nodemailer = require('nodemailer');

// Configure Nodemailer transporter.
// IMPORTANT: Use environment variables in a real app to protect your credentials.
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use other services like SendGrid, Mailgun etc.
    auth: {
        user: 'dineinnpro@gmail.com', // Your email address
        pass: 'wdqq itrb pkzu pdcw',   // Your email's app-specific password
    },
});

/**
 * Sends an email with a PDF attachment to a list of recipients.
 * @param {object} options - The email options.
 * @param {string} options.pdf - The base64 encoded PDF string.
 * @param {string[]} options.emails - An array of recipient email addresses.
 * @param {string} options.offerTitle - The title of the offer for the email subject.
 */
async function sendOfferEmail({ pdf, emails, offerTitle }) {
    if (!emails || emails.length === 0) {
        console.log("No emails to send.");
        return;
    }

    const mailOptions = {
        from: '"DineInn Pro" <your-email@gmail.com>',
        to: emails.join(','), // Send to all recipients
        subject: `A Special Offer For You: ${offerTitle}`,
        html: `
            <p>Dear Valued Customer,</p>
            <p>Thank you for being one of our best customers! We're excited to share a special promotional offer with you.</p>
            <p>Please find the details in the attached PDF.</p>
            <br>
            <p>We look forward to seeing you soon!</p>
            <p>Best,</p>
            <p>The Team at Your Restaurant Name</p>
        `,
        attachments: [
            {
                filename: 'promotional-offer.pdf',
                content: pdf,
                encoding: 'base64',
                contentType: 'application/pdf'
            },
        ],
    };

    return transporter.sendMail(mailOptions);
}

// Export the function to be used in server.js
module.exports = { sendOfferEmail };