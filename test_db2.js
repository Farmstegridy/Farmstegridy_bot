require('dotenv').config();
const { supabase } = require('./config/supabase');
async function test() {
  const { data } = await supabase.from('bot_products').select('stock').limit(1);
  console.log("Type of stock:", typeof data[0].stock);
}
test();
