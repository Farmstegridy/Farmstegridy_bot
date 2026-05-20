const { getProducts } = require('../services/database');

(async () => {
    try {
        const products = await getProducts();
        console.log("Products in database:");
        console.log(JSON.stringify(products, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
