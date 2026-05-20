const { getProducts } = require('../services/database');

async function run() {
    const products = await getProducts();
    console.log("All products:", JSON.stringify(products, null, 2));
}

run().catch(console.error);
