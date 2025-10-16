const nodemailer = require('nodemailer');

// --- 1. CORRECTED Nodemailer Transporter Setup ---
// This explicit configuration is more reliable on cloud platforms like Render.
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
});

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
        from: '"Your Valet Service" <dineinnpro@gmail.com>', // Use your verified email
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

    // --- 2. CLEANED UP Sending Logic ---
    // The original async/await try/catch block was correct. The extra code has been removed.
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent:', info.response);
        return info.response;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error; // Propagate the error to be handled by the calling function
    }
};

// Export the function so it can be used in other files
module.exports = { sendTokenEmail };