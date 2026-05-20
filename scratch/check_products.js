const { getProducts } = require('../services/database');
(async () => {
    try {
        const products = await getProducts();
        console.log("--- PRODUCTS LIST ---");
        products.forEach(p => {
            console.log(`- ID: ${p.id}, Name: ${p.name}, Category: ${p.category}, Active: ${p.is_active}`);
        });
    } catch (e) {
        console.error(e);
    }
})();
