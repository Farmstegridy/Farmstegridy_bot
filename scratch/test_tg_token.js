const https = require('https');
const token = '8549299880:AAHO1Nj-xLj3SELZ4h9Uze1_NDDwaB2oVA4';
https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("getMe response:", data);
    });
}).on('error', (err) => {
    console.error("Error testing token:", err);
});
