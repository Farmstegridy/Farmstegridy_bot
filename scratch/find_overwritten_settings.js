const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabaseUrl = 'https://tsafkhhyqmlknxrgnqgw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYWZraGh5cW1sa254cmducWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3MDg0MCwiZXhwIjoyMDg4MjQ2ODQwfQ.1-AzrYIDY9PU-VbWRHe_KoIzlpzD6Fj3Q_nCOIOeXnQ';
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from('bot_settings').select('*');
    if (error) {
        console.error("Error reading fallback DB:", error);
        return;
    }
    data.forEach(row => {
        console.log(`\nRow ID: ${row.id}`);
        for (const [key, val] of Object.entries(row)) {
            if (val && typeof val === 'string' && (val.includes('Farmstegridy') || val.includes('farmstegridy'))) {
                console.log(`  ${key}: "${val}"`);
            }
        }
    });
}
run();
