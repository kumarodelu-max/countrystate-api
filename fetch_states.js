const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/main/states.json', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const states = JSON.parse(data);
        let sql = '';
        states.forEach(s => {
            if (s.state_code) {
                const safeName = s.name.replace(/'/g, "''");
                const safeCode = s.state_code.replace(/'/g, "''");
                sql += `UPDATE states SET state_code = '${safeCode}' WHERE name = '${safeName}' AND country_code = '${s.country_code}';\n`;
            }
        });
        fs.writeFileSync('update_all_states.sql', sql);
        console.log('SQL generated: ' + states.length + ' states processed.');
    });
}).on('error', (err) => {
    console.error('Error: ', err.message);
});
