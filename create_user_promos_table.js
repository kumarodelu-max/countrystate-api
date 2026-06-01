require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        await db.query(`DROP TABLE IF EXISTS broadcasts;`);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_promos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'promo',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Successfully dropped broadcasts and created user_promos table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

migrate();
