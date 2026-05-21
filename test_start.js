require('dotenv').config();
const Dispatcher = require('./services/dispatcher');
const { setupStartHandler } = require('./handlers/start');
const db = require('./services/database'); // required to init db cache

async function test() {
    const dispatcher = new Dispatcher();
    await dispatcher.init();
    setupStartHandler(dispatcher);
    
    // Simulate a context
    const ctx = {
        platform: 'telegram',
        from: { id: process.env.ADMIN_TELEGRAM_ID || '1183134641', first_name: 'Dikenson', username: 'Gazolina94' },
        chat: { id: process.env.ADMIN_TELEGRAM_ID || '1183134641', type: 'private' },
        message: { text: '/start', state: {}, message_id: 9999 },
        updateType: 'message',
        text: '/start', state: {},
        telegram: {
            deleteMessage: async () => {},
            editMessageText: async () => console.log('editMessageText called'),
            sendMessage: async (id, msg, opts) => console.log('sendMessage called:', id, msg.substring(0, 50), opts),
            sendPhoto: async (id, photo, opts) => console.log('sendPhoto called:', id, opts),
        },
        deleteMessage: async () => {},
        reply: async (t, o) => console.log('ctx.reply', t.substring(0, 50), o),
        replyWithHTML: async (t, o) => console.log('ctx.replyWithHTML', t.substring(0, 50), o),
    };
    
    // Use dispatcher manually
    try {
        await dispatcher.commands.get('start')(ctx);
        console.log("Done command start.");
    } catch(e) {
        console.error(e);
    }
}
test();
