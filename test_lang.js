require('dotenv').config();
const { getUser } = require('./services/database');
(async () => {
    const user = await getUser('1183134641', 'telegram');
    console.log("User data:", JSON.stringify(user?.data, null, 2));
    console.log("User language_code:", user?.language_code);
    process.exit(0);
})();
