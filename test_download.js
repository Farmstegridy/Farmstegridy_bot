const https = require('https');
const url = 'https://todfwctsutqmlhwctgnl.supabase.co/storage/v1/object/public/la%20fabrik%20paris%20bot/1779374402277-109193866.jpeg';
const req = https.get(url, (res) => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log('Response:', buffer.toString());
    });
});
req.on('error', e => console.error(e));
