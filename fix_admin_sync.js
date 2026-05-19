const { supabase, COL_USERS, getAppSettings, updateAppSettings, decryptUser } = require('./services/database');

async function syncAdminSettings() {
    console.log('🔄 Synchronisation des administrateurs...');
    
    // 1. Récupérer tous les admins en base
    const { data: admins, error } = await supabase.from(COL_USERS).select('*').eq('is_admin', true);
    if (error) {
        console.error('❌ Erreur Supabase:', error);
        return;
    }

    const decryptedAdmins = admins.map(decryptUser);
    const adminIds = decryptedAdmins.map(a => a.platform_id).filter(Boolean);

    console.log(`✅ Admis en base : ${adminIds.length} (${adminIds.join(', ')})`);

    // 2. Mettre à jour les settings
    const settings = await getAppSettings();
    let currentAdminIdsStr = String(settings.admin_telegram_id || '');
    let currentIds = currentAdminIdsStr.split(/[\s,]+/).filter(Boolean);

    let changed = false;
    adminIds.forEach(id => {
        if (!currentIds.includes(String(id))) {
            currentIds.push(String(id));
            changed = true;
        }
    });

    if (changed) {
        await updateAppSettings({ admin_telegram_id: currentIds.join(', ') });
        console.log(`✅ Paramètres mis à jour avec les nouveaux IDs : ${currentIds.join(', ')}`);
    } else {
        console.log('ℹ️ Aucune modification nécessaire, les IDs sont déjà synchronisés.');
    }
}

syncAdminSettings().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
