const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabaseUrl = 'https://tsafkhhyqmlknxrgnqgw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYWZraGh5cW1sa254cmducWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3MDg0MCwiZXhwIjoyMDg4MjQ2ODQwfQ.1-AzrYIDY9PU-VbWRHe_KoIzlpzD6Fj3Q_nCOIOeXnQ';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log("--- bot_settings ---");
    const { data: botSettings, error: err1 } = await supabase.from('bot_settings').select('id, bot_name, dashboard_title');
    if (err1) console.error("Error bot_settings:", err1);
    else console.log(botSettings);

    console.log("--- settings ---");
    const { data: settings, error: err2 } = await supabase.from('settings').select('id, bot_name, dashboard_title');
    if (err2) console.error("Error settings:", err2);
    else console.log(settings);
}
run();
