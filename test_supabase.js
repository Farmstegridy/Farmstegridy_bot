require('dotenv').config();
const { supabase } = require('./config/supabase');
supabase.from('bot_reviews').select('*').limit(5).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
