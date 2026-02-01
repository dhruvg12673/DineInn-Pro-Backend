const nodemailer = require('nodemailer');

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
