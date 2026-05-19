const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function listTables() {
    if (!supabaseUrl || !supabaseKey) { return; }
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // We can't list tables directly via public API easily without RPC, 
    // but we can try to query some standard ones.
    const potentialTables = ['users', 'bot_users', 'customers', 'clients'];
    for (const t of potentialTables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (!error) console.log(`Table '${t}' exists with ${count} rows`);
    }
}

listTables();
