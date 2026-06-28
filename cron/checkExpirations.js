const cron = require('node-cron');
const db = require('../config/db');

function startExpirationJobs() {
    // Run every day at midnight (0 0 * * *)
    cron.schedule('0 0 * * *', async () => {
        try {
            console.log('[Cron] Checking for expired subscriptions...');
            
            // Find users whose plan_expires_at is in the past and are NOT on the free plan
            const result = await db.query(`
                SELECT id, email, plan, plan_expires_at 
                FROM users 
                WHERE plan != 'free' 
                  AND plan_expires_at < NOW()
                  AND is_active = true
            `);

            if (result.rows.length === 0) {
                console.log('[Cron] No expired plans found today.');
                return;
            }

            console.log(`[Cron] Found ${result.rows.length} expired plans. Downgrading to Free...`);

            for (const user of result.rows) {
                // Downgrade user
                await db.query(`
                    UPDATE users 
                    SET plan = 'free' 
                    WHERE id = $1
                `, [user.id]);

                // Reset API Key limits to free plan (100 daily)
                await db.query(`
                    UPDATE api_keys 
                    SET daily_limit = 100 
                    WHERE user_id = $1 AND is_active = true
                `, [user.id]);

                console.log(`[Cron] Downgraded ${user.email} from ${user.plan} to free.`);
            }

        } catch (err) {
            console.error('[Cron] Error checking expirations:', err);
        }
    });
    console.log('[Cron] Expiration jobs scheduled (runs daily at midnight).');
}

module.exports = { startExpirationJobs };
