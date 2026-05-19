const { registry } = require('../channels/ChannelRegistry');
const { TelegramChannel } = require('../channels/TelegramChannel');

async function initChannels() {
    console.log('📦 Initialisation des canaux...');

    // 1. Telegram
    const tgToken = process.env.BOT_TOKEN;
    if (tgToken) {
        const tg = new TelegramChannel(tgToken);
        await tg.initialize();
        registry.register(tg);
    }

    // Démarrage de tous les canaux
    await registry.startAll();
    console.log('✅ Canaux opérationnels !');
}

module.exports = { initChannels };
