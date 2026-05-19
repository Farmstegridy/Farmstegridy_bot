
const { createClient } = require('@supabase/supabase-js');
const url = 'https://tsafkhhyqmlknxrgnqgw.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYWZraGh5cW1sa254cmducWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3MDg0MCwiZXhwIjoyMDg4MjQ2ODQwfQ.1-AzrYIDY9PU-VbWRHe_KoIzlpzD6Fj3Q_nCOIOeXnQ';
const supabase = createClient(url, key);

async function run() {
    try {
        const { data, error } = await supabase.from('bot_products').select('name');
        if (error) throw error;
        console.log('--- ALL NAMES LA FABRIK PROJECT ---');
        data.forEach(p => {
            console.log(`"${p.name}"`);
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
