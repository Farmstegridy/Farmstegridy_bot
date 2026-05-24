const db = require('./services/database.js'); async function run() { const p = await db.getProducts(); console.log(JSON.stringify(p.slice(0, 3), null, 2)); process.exit(); } run();
