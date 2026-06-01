require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS plan_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                old_plan VARCHAR(50),
                new_plan VARCHAR(50),
                old_limit INT,
                new_limit INT,
                source VARCHAR(100),
                changed_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Successfully created plan_history table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

migrate();
