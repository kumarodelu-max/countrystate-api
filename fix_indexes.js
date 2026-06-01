require('dotenv').config();
const db = require('./config/db');

async function fixIndexes() {
    console.log('[Fix] Starting database index creation...');
    try {
        // 1. Index on api_logs.api_key for fast history retrieval
        console.log('Creating index on api_logs(api_key)...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_api_logs_api_key ON api_logs(api_key);`);

        // 2. Index on api_logs.user_id for rate limiting (already exists, but just in case)
        console.log('Creating index on api_logs(user_id)...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);`);

        // 3. Index on cities.state_id for fast city retrieval by state
        console.log('Creating index on cities(state_id)...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_cities_state_id ON cities(state_id);`);

        // 4. Index on translations for fast left joins
        console.log('Creating index on translations(entity_type, entity_id, locale)...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_translations_entity ON translations(entity_type, entity_id, locale);`);
        
        // 5. Index on states.country_id
        console.log('Creating index on states(country_id)...');
        await db.query(`CREATE INDEX IF NOT EXISTS idx_states_country_id ON states(country_id);`);

        console.log('[Fix] All indexes created successfully! API will now be blazing fast.');
    } catch (err) {
        console.error('[Fix] Error creating indexes:', err);
    } finally {
        process.exit(0);
    }
}

fixIndexes();
