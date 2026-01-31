const nodemailer = require('nodemailer');

// --- Nodemailer Transporter Setup ---
// This is the core of the email sending functionality.
// IMPORTANT: Replace with your own Gmail credentials.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,   
        pass: process.env.EMAIL_PASS
}
});

console.log('Nodemailer transporter configured in emailService.js');

/**
 * Sends the valet token email to a customer.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} tokenNumber - The valet token number.
 * @param {string} ownerName - The name of the car owner.
 * @param {string} carNumber - The car's license plate number.
 * @returns {Promise<string>} - A promise that resolves with the success message from nodemailer.
 */
const sendTokenEmail = async (toEmail, tokenNumber, ownerName, carNumber) => {
    const mailOptions = {
        from: '"Your Valet Service" <dineinnpro@gmail.com>',
        to: toEmail,
        subject: `Your Valet Token: ${tokenNumber}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0056b3;">Thank you for using our valet service!</h2>
                <p>Please keep this token number safe for retrieving your car.</p>
                <p style="font-size: 28px; font-weight: bold; color: #d9534f; border: 2px dashed #d9534f; padding: 10px; text-align: center;">
                    ${tokenNumber}
                </p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <h4>Your Details:</h4>
                <ul>
                    <li><strong>Owner:</strong> ${ownerName}</li>
                    <li><strong>Car Number:</strong> ${carNumber}</li>
                </ul>
                <p>We look forward to serving you!</p>
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



    // 2. Return a promise that handles the email sending
    return new Promise((resolve, reject) => {
        transporter.const.sendEmail = async (to, subject, html) => {
  console.log("🚀 Sending email to:", to);
  console.log("📬 Subject:", subject);

  const mailOptions = {
    from: 'dineinnpro@gmail.com',
    to,
    subject,
    html
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", result.response);
    return result;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};

  });
};

// Export the function so it can be used in other files
module.exports = { sendTokenEmail };
