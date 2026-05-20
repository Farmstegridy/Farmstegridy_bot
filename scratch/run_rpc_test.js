const { supabase } = require('../config/supabase');
async function run() {
    // Try calling a hypothetical exec_sql or execute_sql function
    const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });
    if (error) {
        console.log("exec_sql failed:", error.message);
    } else {
        console.log("exec_sql success:", data);
    }
}
run();
