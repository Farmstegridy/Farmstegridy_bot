const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabaseUrl = 'https://tsafkhhyqmlknxrgnqgw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYWZraGh5cW1sa254cmducWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3MDg0MCwiZXhwIjoyMDg4MjQ2ODQwfQ.1-AzrYIDY9PU-VbWRHe_KoIzlpzD6Fj3Q_nCOIOeXnQ';
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Restoring settings in La Frappe IDF DB (fallback)...");
    
    // Restore default row
    const { error: errDefault } = await supabase
        .from('bot_settings')
        .update({
            bot_name: 'La Frappe IDF',
            dashboard_title: 'La Frappe IDF Admin',
            private_contact_url: 'https://t.me/lafrappex'
        })
        .eq('id', 'default');
        
    if (errDefault) {
        console.error("Error updating default row:", errDefault);
    } else {
        console.log("Successfully restored 'default' row.");
    }

    // Restore config row
    const { error: errConfig } = await supabase
        .from('bot_settings')
        .update({
            bot_name: 'La Frappe IDF',
            dashboard_title: 'La Frappe IDF Admin',
            private_contact_url: 'https://t.me/lafrappex'
        })
        .eq('id', 'config');

    if (errConfig) {
        console.error("Error updating config row:", errConfig);
    } else {
        console.log("Successfully restored 'config' row.");
    }
}
run();
