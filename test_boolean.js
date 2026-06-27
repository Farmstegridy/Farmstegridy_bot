require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
    const payload = { auto_approve_new: "on" };
    const { error } = await supabase.from('bot_settings').update(payload).eq('id', 'default');
    console.log("Error:", error);
})();
