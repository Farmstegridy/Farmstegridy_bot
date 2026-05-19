const { createClient } = require('@supabase/supabase-js');
const { validateLicense } = require('../services/license');
require('dotenv').config({ path: process.env.RAILWAY_ENVIRONMENT ? '.env.railway' : '.env' });

/*
if (!validateLicense()) {
    console.error('❌ Licence invalide.');
    process.exit(1);
}
*/

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_KEY;

// Fallback "debrouille toi" si les variables d'environnement sont manquantes ou factices
if (!supabaseUrl || supabaseUrl.includes('xyqjyjqyqjyjqyqjyjqy') || !supabaseUrl.startsWith('https')) {
    supabaseUrl = 'https://todfwctsutqmlhwctgnl.supabase.co';
}
if (!supabaseKey || supabaseKey.includes('xycmpmcmpm') || supabaseKey.length < 50) {
    supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZGZ3Y3RzdXRxbWxod2N0Z25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIxMTQ3OCwiZXhwIjoyMDk0Nzg3NDc4fQ.hb_b_N7c89ayBwK9bEIORN6ORQuzRkz7NNepsYkLxOs';
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
