const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function checkProduct() {
    console.log('Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const productId = '1776040943833';
    console.log('Fetching product 1776040943833...');
    const { data: product, error } = await supabase.from('bot_products').select('image_url, name').eq('id', productId);
    
    if (error) {
        console.error('Error fetching product:', error.message);
        process.exit(1);
    }
    
    if (!product || product.length === 0) {
        console.log('Product not found');
        process.exit(0);
    }
    
    console.log('Product details:', JSON.stringify(product[0], null, 2));
    process.exit(0);
}

checkProduct();
