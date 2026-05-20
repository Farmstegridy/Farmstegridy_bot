require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
    console.log('🔓 Réinitialisation du verrou TG-LOCK...');
    
    // 1. Afficher l'état actuel du verrou
    const { data: before } = await supabase
        .from('bot_stats')
        .select('id, tg_lock_owner, tg_lock_expires')
        .eq('id', 1)
        .single();
    
    console.log('État actuel:', before);
    
    if (!before) {
        console.log('❌ Impossible de lire bot_stats (id=1)');
        process.exit(1);
    }

    if (!before.tg_lock_owner) {
        console.log('✅ Aucun verrou actif. Le bot devrait pouvoir démarrer normalement.');
        process.exit(0);
    }

    // 2. Effacer le verrou
    const { error } = await supabase
        .from('bot_stats')
        .update({ tg_lock_owner: null, tg_lock_expires: null })
        .eq('id', 1);

    if (error) {
        console.error('❌ Erreur reset verrou:', error.message);
        process.exit(1);
    }

    // 3. Vérifier le résultat
    const { data: after } = await supabase
        .from('bot_stats')
        .select('id, tg_lock_owner, tg_lock_expires')
        .eq('id', 1)
        .single();
    
    console.log('✅ Verrou effacé. État après reset:', after);
    console.log('\n▶️  Redémarre le bot avec : npm run dev');
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
