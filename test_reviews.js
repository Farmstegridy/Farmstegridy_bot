require('dotenv').config();
const { getReviews } = require('./services/database');
getReviews(10).then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error);
