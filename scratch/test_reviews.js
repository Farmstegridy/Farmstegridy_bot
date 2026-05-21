require('dotenv').config();
const supabase = require('@supabase/supabase-js').createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);
(async () => {
    const { data, error } = await supabase.from('bot_reviews').select('*').limit(0);
    console.log(data, error);
})();
