require('dotenv').config();
const { getUser } = require('../services/database');
async function run() {
    const u1 = await getUser('telegram_1183134641');
    console.log("u1.is_livreur:", u1.is_livreur);
    console.log("u1.data.is_livreur:", u1.data && u1.data.is_livreur);
    console.log("u1.role:", u1.role);
}
run();
