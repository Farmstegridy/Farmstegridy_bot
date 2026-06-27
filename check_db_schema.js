require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const schema = fs.readFileSync('schema.sql', 'utf8');

const columnsMatch = schema.match(/CREATE TABLE IF NOT EXISTS bot_settings \(([\s\S]*?)\);/);
const schemaCols = columnsMatch[1].split('\n').map(line => {
    const match = line.trim().match(/^([a-z_0-9]+)\s/);
    return match ? match[1] : null;
}).filter(Boolean);

(async () => {
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
    for (let col of schemaCols) {
        if (!dbKeys.includes(col)) {
            missing.push(col);
        }
    }
    
    console.log("Columns in schema.sql but missing in DB:");
    console.log(missing);
})();
