
const { getAppSettings } = require('./services/database');
(async () => {
    try {
        const settings = await getAppSettings();
        console.log('--- CURRRENT SETTINGS ---');
        console.log(JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error(e);
    }
})();
