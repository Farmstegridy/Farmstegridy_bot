const { supabase } = require('../config/supabase');

async function run() {
    const { data: product, error } = await supabase.from('bot_products').select('*').eq('id', '1779222593473dn6sut').maybeSingle();
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Product:", product);
    }
}
run();
