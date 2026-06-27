require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const dashboard = fs.readFileSync('web/views/dashboard.html', 'utf8');

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

// remove false positives from regex
payloadKeys.delete('icon');
payloadKeys.delete('label');
payloadKeys.delete('url');

(async () => {
    let failedKeys = [];
    for (let key of payloadKeys) {
        const payload = {};
        payload[key] = null;
        const { error } = await supabase.from('bot_settings').update(payload).eq('id', 'default');
        if (error && error.code === 'PGRST204') {
            failedKeys.push(key);
        }
    }
    console.log("Missing keys in DB according to frontend payload:");
    console.log(failedKeys);
})();
