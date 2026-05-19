
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixSettings() {
    console.log('🔄 Mise à jour des paramètres en base de données...');
    
    // On désactive le mode privé et on active l'auto-approbation
    const { data, error } = await supabase
        .from('bot_settings')
        .update({ 
            private_mode: false, 
            auto_approve_new: true 
        })
        .eq('id', 1);

    if (error) {
        console.error('❌ Erreur lors de la mise à jour:', error.message);
    } else {
        console.log('✅ Paramètres mis à jour avec succès : mode privé DÉSACTIVÉ.');
    }
}

fixSettings();
