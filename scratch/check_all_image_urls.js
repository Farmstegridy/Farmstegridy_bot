const { supabase } = require('../config/supabase');

async function run() {
    const { data: products, error } = await supabase.from('bot_products').select('id, name, image_url');
    if (error) {
        console.error("Error:", error);
    } else {
        products.forEach(p => {
            console.log(`Product: ${p.name} (${p.id}) -> image_url: ${p.image_url}`);
        });
    }
}
run();
