const { supabase } = require('./config/supabase');
async function run() {
    const { data } = await supabase.from('bot_orders').select('*').eq('status', 'delivered').limit(1);
    console.log(data);
}
run();
