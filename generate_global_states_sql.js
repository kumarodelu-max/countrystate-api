const { State } = require('country-state-city');
const fs = require('fs');

console.log('Loading global states from official dataset...');
const allStates = State.getAllStates();

let sql = '';
let count = 0;

allStates.forEach(s => {
    if (s.isoCode && s.name && s.countryCode) {
        // Escape single quotes for SQL (e.g. "St. John's")
        const safeName = s.name.replace(/'/g, "''");
        const safeCode = s.isoCode.replace(/'/g, "''");
        const safeCountry = s.countryCode.replace(/'/g, "''");
        
        sql += `UPDATE states SET state_code = '${safeCode}' WHERE name = '${safeName}' AND country_code = '${safeCountry}';\n`;
        count++;
    }
});

fs.writeFileSync('update_global_states.sql', sql);
console.log(`Successfully generated update_global_states.sql with ${count} state codes!`);
