const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking and updating schema...");
    
    // We can't run raw SQL via supabase-js client directly without an RPC.
    // But we can try to insert a dummy record to see if it fails, 
    // or just inform the user if we see it fails.
    
    // Actually, I'll try to use the 'rpc' if they have a 'exec_sql' or similar, 
    // but usually they don't.
    
    console.log("Please run this SQL in your Supabase SQL Editor:");
    console.log(`
    ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS telegram_id TEXT;
    ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS tracked_messages JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS last_menu_id BIGINT;
    
    -- Also check bot_stats for locks
    ALTER TABLE bot_stats ADD COLUMN IF NOT EXISTS tg_lock_owner TEXT;
    ALTER TABLE bot_stats ADD COLUMN IF NOT EXISTS tg_lock_expires TIMESTAMPTZ;
    `);
}

run();
