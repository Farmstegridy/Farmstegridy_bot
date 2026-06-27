require('dotenv').config();
const { getAppSettings, updateAppSettings } = require('./services/database');

(async () => {
    try {
        const settings = await getAppSettings();
        console.log("Current payment modes:", settings.payment_modes_config);
        
        const updates = { 
            payment_modes_config: '[{"icon":"💸","label":"Cash","id":"CASH"}]',
            bot_name: settings.bot_name || 'Thegreenvalley'
        };
        const { error } = await updateAppSettings(updates);
        if (error) {
            console.error("Supabase Error:", error);
        } else {
            console.log("Save successful!");
            
            const newSettings = await getAppSettings();
            console.log("New payment modes:", newSettings.payment_modes_config);
        }
    } catch (e) {
        console.error(e);
    }
})();
