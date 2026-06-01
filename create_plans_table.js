require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                daily_limit INT NOT NULL DEFAULT 100,
                monthly_limit INT NOT NULL DEFAULT 3000,
                price_monthly DECIMAL(10, 2) DEFAULT 0.00,
                price_yearly DECIMAL(10, 2) DEFAULT 0.00,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert default plans if they don't exist
        const defaultPlans = [
            { code: 'free', name: 'Free', daily: 100, monthly: 3000, pm: 0, py: 0 },
            { code: 'starter', name: 'Starter', daily: 1000, monthly: 30000, pm: 9, py: 90 },
            { code: 'supporter', name: 'Supporter', daily: 2000, monthly: 60000, pm: 19, py: 190 },
            { code: 'professional', name: 'Professional', daily: 5000, monthly: 150000, pm: 49, py: 490 },
            { code: 'business', name: 'Business', daily: 25000, monthly: 750000, pm: 199, py: 1990 }
        ];

        for (const p of defaultPlans) {
            await db.query(`
                INSERT INTO plans (code, name, daily_limit, monthly_limit, price_monthly, price_yearly)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (code) DO NOTHING
            `, [p.code, p.name, p.daily, p.monthly, p.pm, p.py]);
        }

        console.log('Successfully created plans table and inserted defaults.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

migrate();
