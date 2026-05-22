require('dotenv').config();
const { supabase } = require('./config/supabase');
async function test() {
  const { data } = await supabase.from('bot_settings').select('*').limit(1);
  const keys = Object.keys(data[0] || {});
  console.log("Has 'key':", keys.includes('key'));
  console.log("Has 'data':", keys.includes('data'));
}
test();
