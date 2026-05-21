require('dotenv').config();
const { getUser } = require('../services/database');
async function run() {
    const user = await getUser('telegram_1183134641');
    const isLivreur = !!user.is_livreur;
    const isAdmin = !!user.is_admin;
    console.log("isLivreur:", isLivreur);
    console.log("isAdmin:", isAdmin);
    console.log("Full user payload:", JSON.stringify(user, null, 2));
}
run();
