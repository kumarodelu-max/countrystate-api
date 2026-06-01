require('dotenv').config();
const db = require('./db');

async function migrate() {
    console.log('Starting Database SaaS Migration...');
    
    try {
        // 1. Update USERS table
        console.log('Adding verification columns to users...');
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)
        `);

        // Update existing users to be verified (so you don't get locked out)
        await db.query(`UPDATE users SET is_verified = TRUE`);

        // Update the plan ENUM/CHECK constraint
        console.log('Updating user plans constraint...');
        await db.query(`
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
            ALTER TABLE users ADD CONSTRAINT users_plan_check 
            CHECK (plan IN ('free', 'starter', 'supporter', 'professional', 'business'));
        `);

        // 2. Update API_KEYS table
        console.log('Adding allowed_origins to api_keys...');
        await db.query(`
            ALTER TABLE api_keys 
            ADD COLUMN IF NOT EXISTS allowed_origins TEXT[] DEFAULT '{}'
        `);

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
