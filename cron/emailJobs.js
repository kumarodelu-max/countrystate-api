const cron = require('node-cron');
const db = require('../config/db');
const { sendFollowUpEmail, sendRatingEmail, sendUnverifiedNudgeEmail, sendInactiveHelpEmail } = require('../utils/email');

function startEmailJobs() {
    // Run every day at 10:00 AM (server time)
    cron.schedule('0 10 * * *', async () => {
        console.log('[Cron] Running daily email jobs...');
        try {
            // 1. Follow-up for users registered exactly 1 day ago (24-48 hours) with <= 1 api call
            const inactiveUsers = await db.query(`
                SELECT u.id, u.email, u.full_name, u.email_unsubscribed,
                       (SELECT COUNT(*) FROM api_logs al WHERE al.user_id = u.id) as api_count
                FROM users u
                WHERE u.created_at >= NOW() - INTERVAL '48 hours'
                  AND u.created_at < NOW() - INTERVAL '24 hours'
                  AND u.email_unsubscribed = FALSE
            `);

            for (const user of inactiveUsers.rows) {
                if (parseInt(user.api_count) <= 1) {
                    await sendFollowUpEmail(user.email, user.full_name || 'Developer');
                }
            }

            // 2. Rating request for users registered exactly 3 days ago (72-96 hours) with > 50 api calls
            const activeUsers = await db.query(`
                SELECT u.id, u.email, u.full_name, u.email_unsubscribed,
                       (SELECT COUNT(*) FROM api_logs al WHERE al.user_id = u.id) as api_count
                FROM users u
                WHERE u.created_at >= NOW() - INTERVAL '96 hours'
                  AND u.created_at < NOW() - INTERVAL '72 hours'
                  AND u.email_unsubscribed = FALSE
            `);

            for (const user of activeUsers.rows) {
                if (parseInt(user.api_count) > 50) {
                    await sendRatingEmail(user.email, user.full_name || 'Developer');
                }
            }

            // 3. Unverified Nudge for users registered exactly 1 week ago (168-192 hours) who never verified
            const unverifiedUsers = await db.query(`
                SELECT id, email, verification_token
                FROM users
                WHERE created_at >= NOW() - INTERVAL '192 hours'
                  AND created_at < NOW() - INTERVAL '168 hours'
                  AND is_verified = FALSE
                  AND email_unsubscribed = FALSE
            `);

            for (const user of unverifiedUsers.rows) {
                await sendUnverifiedNudgeEmail(user.email, user.verification_token);
            }

            // 4. Inactive Help for verified users registered exactly 1 week ago (168-192 hours) with 0 api calls
            const zeroCallUsers = await db.query(`
                SELECT u.id, u.email, u.full_name, u.email_unsubscribed,
                       (SELECT COUNT(*) FROM api_logs al WHERE al.user_id = u.id) as api_count
                FROM users u
                WHERE u.created_at >= NOW() - INTERVAL '192 hours'
                  AND u.created_at < NOW() - INTERVAL '168 hours'
                  AND u.is_verified = TRUE
                  AND u.email_unsubscribed = FALSE
            `);

            for (const user of zeroCallUsers.rows) {
                if (parseInt(user.api_count) === 0) {
                    await sendInactiveHelpEmail(user.email, user.full_name || 'Developer');
                }
            }
            
            console.log('[Cron] Daily email jobs completed successfully.');
        } catch (error) {
            console.error('[Cron] Error running email jobs:', error);
        }
    });
    console.log('[Cron] Email jobs scheduled (runs daily at 10:00 AM).');
}

module.exports = { startEmailJobs };
