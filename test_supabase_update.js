require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
    const { data, error } = await supabase.from('bot_settings').update({ custom_links: '[]' }).eq('id', 'default');
    if (error) {
        console.log("Error updating custom_links:");
        console.log(error);
    } else {
        console.log("Success updating custom_links! It must exist.");
    }
})();
