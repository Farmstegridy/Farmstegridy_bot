const fetch = require('node-fetch');
const { getAppSettings } = require('../services/database');
require('dotenv').config();

(async () => {
    try {
        const settings = await getAppSettings().catch(() => ({}));
        const dbToken = settings.telegram_token;
        const envToken = process.env.BOT_TOKEN;

        console.log("DB Token:", dbToken);
        console.log("Env Token:", envToken);

        const tokenToTest = dbToken || envToken;
        if (!tokenToTest) {
            console.error("No token found!");
            process.exit(1);
        }

        const res = await fetch(`https://api.telegram.org/bot${tokenToTest.trim()}/getMe`);
        const data = await res.json();
        console.log("Telegram getMe result:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
