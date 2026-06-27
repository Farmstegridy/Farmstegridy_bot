const { updateAppSettings } = require('../services/database');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

async function updateDb() {
    try {
        console.log("Updating database private_contact_url...");
        const result = await updateAppSettings({
            private_contact_url: 'https://t.me/don_r91'
        });
        console.log("Update success:", result);
    } catch (e) {
        console.error("Error updating db:", e);
    }
}
updateDb();
