require('dotenv').config();
const { getUser, updateUser } = require('../services/database');

async function test() {
    try {
        const uid = 'telegram_1183134641'; // Try to use a known ID or fetch one
        const user = await getUser(uid);
        console.log("Before:", user?.address);
        
        const res = await updateUser(uid, { address: JSON.stringify([{ id: '1', name: 'Test', address: '123 Rue Test' }]) });
        console.log("Update result:", res);
        
        const after = await getUser(uid);
        console.log("After:", after?.address);
    } catch(e) {
        console.error("Error:", e);
    }
}
test();
