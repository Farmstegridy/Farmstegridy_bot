const { supabase } = require('./config/supabase');
async function test() {
    const { data, error } = await supabase.from('bot_state').select('*').limit(1);
    console.log("Data:", data, "Error:", error);
}
test();
