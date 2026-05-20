const { getUser } = require('../services/database');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
    try {
        console.log("Checking user telegram_1183134641...");
        const user = await getUser('telegram_1183134641');
        console.log("User:", JSON.stringify(user, null, 2));

        console.log("Checking user 1183134641 (no prefix)...");
        const userRaw = await getUser('1183134641');
        console.log("User (no prefix):", JSON.stringify(userRaw, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
