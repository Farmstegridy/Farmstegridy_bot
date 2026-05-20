const { createClient } = require('@supabase/supabase-js');

async function run() {
    const url = 'https://todfwctsutqmlhwctgnl.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZGZ3Y3RzdXRxbWxod2N0Z25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIxMTQ3OCwiZXhwIjoyMDk0Nzg3NDc4fQ.hb_b_N7c89ayBwK9bEIORN6ORQuzRkz7NNepsYkLxOs';
    const supabase = createClient(url, key);
    
    const newToken = '8862302922:AAFzu8MzFw58HLQC1aRJFlpV4qM38Rt2pYo';
    console.log('Updating token in bot_settings to:', newToken);
    
    const { data, error } = await supabase
        .from('bot_settings')
        .update({ telegram_token: newToken })
        .eq('id', 'default')
        .select();
        
    if (error) {
        console.error('Error updating token:', error);
    } else {
        console.log('Update success:', data);
    }
}

run();
