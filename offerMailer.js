const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS
  }
});


async function sendOfferEmail({ pdf, emails, offerTitle }) {
    if (!emails || emails.length === 0) {
        console.log("No emails to send.");
        return;
    }

    const mailOptions = {
        from: '"DineInn Pro Offers" <dineinnpro@gmail.com>',
        to: emails.join(','),
        subject: `A Special Offer For You: ${offerTitle}`,
        attachments: [
            {
                filename: 'promotional-offer.pdf',
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
