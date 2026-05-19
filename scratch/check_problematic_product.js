const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function checkProduct() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const productId = '1776040943833';
    const { data: product, error } = await supabase.from('bot_products').select('*').eq('id', productId).maybeSingle();
    
    if (error) {
        console.error('Error fetching product:', error.message);
        return;
    }
    
    if (!product) {
        console.log('Product not found');
        return;
    }
    
    console.log('Product details:', JSON.stringify(product, null, 2));
}

checkProduct();
