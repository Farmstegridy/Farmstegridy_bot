const { supabase } = require('../config/supabase');

async function run() {
    const sql = `
        ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS address TEXT;
        NOTIFY pgrst, 'reload schema';
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error("SQL Execution failed:", error.message);
    } else {
        console.log("SQL Execution success:", data);
    }
}
run();
