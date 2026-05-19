
const { getProducts } = require('../services/database');
const { init } = require('../services/database');

async function run() {
    try {
        // Mock process.env if needed or just let it load from .env if present
        require('dotenv').config();
        
        // Wait a bit for db init
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const products = await getProducts();
        
        console.log('--- ALL PRODUCTS ---');
        products.forEach(p => {
            console.log(`ID: ${p.id} | Name: ${p.name} | Price: ${p.price} (${typeof p.price}) | Unit Val: ${p.unit_value} | HasDisc: ${p.has_discounts}`);
        });
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
