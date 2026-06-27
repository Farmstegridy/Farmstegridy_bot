require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
    // 1. Fetch current settings
    const { data: currentData, error: fetchErr } = await supabase.from('bot_settings').select('*').eq('id', 'default').single();
    if (fetchErr) { console.error('Fetch error:', fetchErr); return; }
    
    console.log('Current payment_modes_config:', currentData.payment_modes_config);
    
    // 2. Update it with a test value
    const testConfig = JSON.stringify([
        { icon: '💸', label: 'Cash Test', id: 'CASH_TEST' },
        { icon: '💳', label: 'Card Test', id: 'CARD_TEST' }
    ]);
    
    const { error: updateErr } = await supabase.from('bot_settings').update({ payment_modes_config: testConfig }).eq('id', 'default');
    if (updateErr) { console.error('Update error:', updateErr); return; }
    
    // 3. Fetch again
    const { data: newData, error: fetchErr2 } = await supabase.from('bot_settings').select('payment_modes_config').eq('id', 'default').single();
    if (fetchErr2) { console.error('Fetch 2 error:', fetchErr2); return; }
    
    console.log('New payment_modes_config:', newData.payment_modes_config);
})();
