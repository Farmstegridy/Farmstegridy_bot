const { supabase } = require('./config/supabase');
async function run() {
    const { data, count } = await supabase.from('bot_users').select('*', { count: 'exact' });
    console.log('Total users:', count || (data ? data.length : 0));
}
run();
