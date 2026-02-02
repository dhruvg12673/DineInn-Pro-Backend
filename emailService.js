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


const sendTokenEmail = async (toEmail, tokenNumber, ownerName, carNumber) => {
    const mailOptions = {
        from: '"Your Valet Service" <dineinnpro@gmail.com>',
        to: toEmail,
        subject: `Your Valet Token: ${tokenNumber}`,
        html: `
            <div>
                Token: ${tokenNumber}
                Owner: ${ownerName}
                Car: ${carNumber}
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent:', info.response);
        return info.response;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
};

module.exports = { sendTokenEmail };
