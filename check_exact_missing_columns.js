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

payloadKeys.delete('icon');
payloadKeys.delete('label');
payloadKeys.delete('url');

(async () => {
    // Attempt an update with everything set to null
    // Except we'll just try to fetch a row and compare keys
    const { data, error } = await supabase.from('bot_settings').select('*').limit(1);
    if (error) {
        console.error("DB Error:", error);
        return;
    }
    
    let dbKeys = [];
    if (data && data.length > 0) {
        dbKeys = Object.keys(data[0]);
    }

    const missing = [];
    for (let key of payloadKeys) {
        if (!dbKeys.includes(key)) {
            missing.push(key);
        }
    }
    
    console.log("Missing columns in Supabase:", missing);
    
    // Attempt an update that will trigger the PGRST204 error if there are missing columns not reported by select
    let testPayload = {};
    for (let key of payloadKeys) { testPayload[key] = null; }
    
    const { error: errUpdate } = await supabase.from('bot_settings').update(testPayload).eq('id', 'default');
    if (errUpdate) {
        console.log("Update Error:", errUpdate);
    } else {
        console.log("Update with all keys succeeded!");
    }
})();
