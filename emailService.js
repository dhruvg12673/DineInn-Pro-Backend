const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // ✅ Mandatory for Port 465
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
});

const sendTokenEmail = async (toEmail, tokenNumber, ownerName, carNumber) => {
    const mailOptions = {
        // Use your Gmail address here
        from: `"Your Valet Service" <${process.env.GMAIL_USER}>`,
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