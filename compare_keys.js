const fs = require('fs');

const schema = fs.readFileSync('schema.sql', 'utf8');
const dashboard = fs.readFileSync('web/views/dashboard.html', 'utf8');

// Extract bot_settings columns
const columnsMatch = schema.match(/CREATE TABLE IF NOT EXISTS bot_settings \(([\s\S]*?)\);/);
const columns = columnsMatch[1].split('\n').map(line => {
    const match = line.trim().match(/^([a-z_0-9]+)\s/);
    return match ? match[1] : null;
}).filter(Boolean);

// Extract keys sent in saveSettings
let payloadKeys = new Set();
const payloadMatch = dashboard.match(/const s = {([\s\S]*?)\};/);
if (payloadMatch) {
    const lines = payloadMatch[1].split('\n');
    for (let line of lines) {
        const keyMatch = line.trim().match(/^([a-z_0-9]+):/);
        if (keyMatch) payloadKeys.add(keyMatch[1]);
    }
}

const dynFieldsMatch = dashboard.match(/const dynFields = \[\s*([\s\S]*?)\s*\];/);
if (dynFieldsMatch) {
    const dynStr = dynFieldsMatch[1];
    const regex = /'([^']+)'/g;
    let m;
    while ((m = regex.exec(dynStr)) !== null) {
        payloadKeys.add(m[1]);
    }
}

const missingInSchema = [];
for (let key of payloadKeys) {
    if (!columns.includes(key)) {
        missingInSchema.push(key);
    }
}

console.log("Keys sent by frontend but missing in DB schema:");
console.log(missingInSchema);
