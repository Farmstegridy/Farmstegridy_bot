const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.RAILWAY_ENVIRONMENT ? '.env.railway' : '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseUrl.startsWith('https://') || !supabaseKey) {
    throw new Error('Supabase server credentials must be configured in the hosting environment.');
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});
module.exports = { supabase };
