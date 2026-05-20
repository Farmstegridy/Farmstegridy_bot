const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabaseUrl = 'https://todfwctsutqmlhwctgnl.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZGZ3Y3RzdXRxbWxod2N0Z25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIxMTQ3OCwiZXhwIjoyMDk0Nzg3NDc4fQ.hb_b_N7c89ayBwK9bEIORN6ORQuzRkz7NNepsYkLxOs';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from('bot_settings').select('id, admin_password, bot_name');
    if (error) {
        console.error("Error reading Farmstegridy DB:", error);
    } else {
        console.log("Farmstegridy DB settings:");
        console.log(data);
    }
}
run();
