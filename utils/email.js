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

/**
 * Send Admin Alert on New Registration
 */
async function sendAdminNewUserAlert(userEmail, fullName) {
    if (!SMTP_USER) return;
    
    const mailOptions = {
        from: `"CountryStateAPI System" <${SMTP_USER}>`,
        to: 'kumar.odelu@gmail.com',
        subject: `New User Registration: ${fullName}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h3 style="color: #0f766e;">New API Developer Registered</h3>
                <p><strong>Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${userEmail}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
        `,
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

/**
 * Send Admin Alert for Contact Us Query
 */
async function sendAdminContactMessage(name, userEmail, message) {
    if (!SMTP_USER) return;
    
    const mailOptions = {
        from: `"CountryStateAPI Contact Form" <${SMTP_USER}>`,
        to: 'kumar.odelu@gmail.com',
        subject: `New Support Query from ${name}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h3 style="color: #ea580c;">New Message from Contact Form</h3>
                <p><strong>From:</strong> ${name} (${userEmail})</p>
                <hr style="border:1px solid #eee; margin:20px 0;"/>
                <p style="white-space: pre-wrap;">${message}</p>
            </div>
        `,
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

/**
 * Send Follow-up Check-in Email
 */
async function sendFollowUpEmail(toEmail, fullName) {
    if (!SMTP_USER) return;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const unsubUrl = `${baseUrl}/api/v1/users/unsubscribe?email=${encodeURIComponent(toEmail)}`;
    
    const mailOptions = {
        from: `"CountryStateAPI Support" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'Getting started with CountryState API',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <p>Hi ${fullName},</p>
                <p>Welcome to CountryState API! We are checking in to ensure you have everything you need to successfully integrate our geographical data into your application.</p>
                <p>If you require any technical assistance, have questions about our endpoints, or need help reviewing the documentation, our support team is here for you.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${baseUrl}/contact.html" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Contact Support</a>
                </div>
                <p>Best regards,<br>The CountryState API Team</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 11px; color: #999; text-align: center;">
                    You are receiving this email because you registered for a developer account. 
                    <br><a href="${unsubUrl}" style="color: #999;">Unsubscribe from notification emails</a>
                </p>
            </div>
        `,
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

/**
 * Send Rating/Feedback Email to Active Users
 */
async function sendRatingEmail(toEmail, fullName) {
    if (!SMTP_USER) return;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const unsubUrl = `${baseUrl}/api/v1/users/unsubscribe?email=${encodeURIComponent(toEmail)}`;
    
    const mailOptions = {
        from: `"CountryStateAPI Team" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'How is your experience with CountryState API?',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <p>Hi ${fullName},</p>
                <p>We hope your application integration is going smoothly! We strive to provide the fastest and most reliable geographical data API available.</p>
                <p>As a valued developer on our platform, your feedback is incredibly important to us. If you have a moment, we would love to hear your thoughts, feature requests, or a quick rating on your experience so far.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${baseUrl}/contact.html" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Share Feedback</a>
                </div>
                <p>Thank you for building with us!<br>The CountryState API Team</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 11px; color: #999; text-align: center;">
                    You are receiving this email because you are an active user of our API. 
                    <br><a href="${unsubUrl}" style="color: #999;">Unsubscribe from notification emails</a>
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Rating Request email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send Rating Request email:', error);
    }
}

/**
 * Send Unverified Nudge Email (Day 5 - 0 API Calls - Not Verified)
 */
async function sendUnverifiedNudgeEmail(toEmail, token) {
    if (!SMTP_USER) return;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const verifyUrl = `${baseUrl}/?verify=${token}`;
    const unsubscribeUrl = `${baseUrl}/api/auth/unsubscribe?email=${encodeURIComponent(toEmail)}`;

    const mailOptions = {
        from: `"Kumar Odelu" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'Action Required: Your CountryState API Profile is Inactive',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #0f766e;">Profile Activation Pending</h2>
                <p>Hi there,</p>
                <p>I noticed you registered for the CountryState API a few days ago, but you haven't verified your email yet. As a result, your profile is completely inactive and you cannot make any API calls.</p>
                <p>If you still want to use the API, simply click the button below to instantly verify your account and activate your profile:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verifyUrl}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify My Account</a>
                </div>
                <p>If you're having trouble, just reply to this email and I'll personally help you out.</p>
                <p>Best regards,<br>Kumar Odelu<br>Founder, CountryState API</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="text-align: center; font-size: 12px; color: #999;">
                    Don't want these check-ins? <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe here</a>.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Unverified Nudge email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send Unverified Nudge email:', error);
    }
}

/**
 * Send Inactive Help Email (Day 5 - 0 API Calls - Verified)
 */
async function sendInactiveHelpEmail(toEmail, userName) {
    if (!SMTP_USER) return;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const contactUrl = `${baseUrl}/contact.html`;
    const unsubscribeUrl = `${baseUrl}/api/auth/unsubscribe?email=${encodeURIComponent(toEmail)}`;

    const mailOptions = {
        from: `"Kumar Odelu" <${SMTP_USER}>`,
        to: toEmail,
        subject: 'Are you stuck? I can help! (CountryState API)',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #0f766e;">Checking in!</h2>
                <p>Hi ${userName},</p>
                <p>Kumar here, the founder of the CountryState API. I noticed your profile is verified, but you still haven't made a single API call.</p>
                <p>Are you facing any technical issues, or did you have trouble integrating the API into your app? I want to make sure you have everything you need to succeed.</p>
                <p>If you're stuck, please don't hesitate to reach out! You can <a href="${contactUrl}">contact me here</a> or just reply directly to this email, and I will personally help you get set up.</p>
                <p>Best regards,<br>Kumar Odelu</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="text-align: center; font-size: 12px; color: #999;">
                    Don't want these check-ins? <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe here</a>.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Inactive Help email sent to ${toEmail}`);
    } catch (error) {
        console.error('❌ Failed to send Inactive Help email:', error);
    }
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPromoEmail,
    sendAdminNewUserAlert,
    sendAdminContactMessage,
    sendFollowUpEmail,
    sendRatingEmail,
    sendUnverifiedNudgeEmail,
    sendInactiveHelpEmail
};
