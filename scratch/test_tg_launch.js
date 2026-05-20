const { Telegraf } = require('telegraf');
const token = '8549299880:AAHO1Nj-xLj3SELZ4h9Uze1_NDDwaB2oVA4';
const bot = new Telegraf(token);

console.log('Starting local test launch...');
bot.launch().then(() => {
    console.log('✅ Local test: Bot launched successfully!');
    bot.stop('SIGINT');
    process.exit(0);
}).catch(err => {
    console.error('❌ Local test failed:', err);
    process.exit(1);
});
