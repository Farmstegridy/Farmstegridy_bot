const { supabase } = require('../config/supabase');
async function run() {
    const { data, error } = await supabase.from('bot_settings').select('*');
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Rows in bot_settings:", data.length);
        data.forEach(row => {
            console.log("Row ID:", row.id);
            console.log("telegram_token:", row.telegram_token);
            console.log("bot_name:", row.bot_name);
            console.log("admin_telegram_id:", row.admin_telegram_id);
            console.log("dashboard_title:", row.dashboard_title);
        });
    }
}
run();
