const { supabase } = require('./config/supabase');
async function test() {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.rpc('get_tables'); // Or maybe just list from pg_tables?
    console.log(data, error);
}
test();
