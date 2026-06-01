const nodemailer = require('nodemailer');

// Set these in your .env file
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

/**
 * Send Verification Email
 */
async function sendVerificationEmail(toEmail, token) {
    if (!SMTP_USER) {
        console.warn('⚠️ SMTP credentials missing. Skipping verification email to:', toEmail);
        console.log(`🔗 Verification Link (For Dev Testing): http://localhost:${process.env.PORT || 3000}/?verify=${token}`);
        return;
    }

    // Determine the base URL dynamically or fallback to localhost
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyUrl = `${baseUrl}/?verify=${token}`;
    
    const mailOptions = {
        from: `"CountryStateAPI" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'Verify your email - CountryState API',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #0f766e;">Welcome to CountryState API!</h2>
                <p>Thank you for registering. Please click the button below to verify your email address and get your free API key.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verifyUrl}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
                </div>
                <p style="color: #666; font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="color: #666; font-size: 12px; word-break: break-all;">${verifyUrl}</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Verification email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send email:', error);
    }
}

/**
 * Send Password Reset Email
 */
async function sendPasswordResetEmail(toEmail, token) {
    if (!SMTP_USER) {
        console.warn('⚠️ SMTP credentials missing. Skipping password reset email to:', toEmail);
        console.log(`🔗 Reset Link (For Dev Testing): http://localhost:${process.env.PORT || 3000}/?reset=${token}`);
        return;
    }

    // Determine the base URL dynamically or fallback to localhost
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetUrl = `${baseUrl}/?reset=${token}`;
    
    const mailOptions = {
        from: `"CountryStateAPI" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'Reset your password - CountryState API',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #0f766e;">Password Reset Request</h2>
                <p>We received a request to reset your password for your CountryState API account. If you didn't make this request, you can safely ignore this email.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                </div>
                <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Password reset email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send password reset email:', error);
    }
}

/**
 * Send Promo Email
 */
async function sendPromoEmail(toEmail, promoMessage) {
    if (!SMTP_USER) {
        console.warn('⚠️ SMTP credentials missing. Skipping promo email to:', toEmail);
        return;
    }

    const mailOptions = {
        from: `"CountryStateAPI Updates" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'New Update from CountryState API',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px;">
                    <h3 style="color: #ea580c; margin-top: 0;">Special Announcement</h3>
                    <p style="color: #334155; font-size: 16px; line-height: 1.5;">${promoMessage}</p>
                </div>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                    You are receiving this because you opted in to email updates in your CountryState API dashboard.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Promo email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send promo email:', error);
    }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendPromoEmail };
