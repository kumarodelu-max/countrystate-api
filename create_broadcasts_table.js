require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS broadcasts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Successfully created broadcasts table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

migrate();
