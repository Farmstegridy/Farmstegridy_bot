const { supabase } = require('./config/supabase');
async function run() {
    const { data, error } = await supabase.from('bot_orders').select('*').limit(1);
    console.log(Object.keys(data[0]));
}
run();
