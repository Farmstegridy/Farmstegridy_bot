const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.RAILWAY_ENVIRONMENT ? '.env.railway' : '.env' });

// The project URL is public; credentials must come only from the server environment.
const supabaseUrl = (process.env.SUPABASE_URL || 'https://todfwctsutqmlhwctgnl.supabase.co').trim();
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();
if (supabaseUrl !== 'https://todfwctsutqmlhwctgnl.supabase.co') {
    throw new Error('Unexpected Supabase project URL; check server configuration.');
}
if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(supabaseKey)) {
    throw new Error('A modern server-side Supabase secret key is required.');
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});
module.exports = { supabase };
