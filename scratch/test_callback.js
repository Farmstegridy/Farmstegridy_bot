const Dispatcher = require('../services/dispatcher');
const { getProducts } = require('../services/database');

async function test() {
    const dispatcher = new Dispatcher();
    
    // We register the order system handlers
    const { setupOrderSystem } = require('../handlers/order_system');
    setupOrderSystem(dispatcher);

    // Let's create a fake context
    const fakeCtx = {
        platform: 'telegram',
        from: { id: '6971274567', first_name: 'Gazolina', username: 'gazolina94' },
        chat: { id: '6971274567' },
        state: {},
        callbackQuery: { data: 'product_1779222593473dn6sut' },
        answerCbQuery: async () => console.log("Answered CB Query"),
        reply: async (text, extra) => console.log("Replied with text:", text, "extra:", extra),
        replyWithPhoto: async (photo, extra) => console.log("Replied with photo:", photo, "extra:", extra),
    };

    console.log("Routing action...");
    const routed = await dispatcher._routeAction(fakeCtx, 'product_1779222593473dn6sut');
    console.log("Routed?", routed);
}

test();
