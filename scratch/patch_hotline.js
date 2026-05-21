const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../handlers/hotline.js');
let content = fs.readFileSync(file, 'utf8');

// Replace the view_my_project action entirely, and remove the subsequent BaaS actions
// We will replace them with a simple acknowledgement or just remove them.
const startIndex = content.indexOf(`bot.action('view_my_project'`);
const endIndex = content.indexOf(`module.exports = { setupHotlineHandlers, pendingTicketInfo, pendingCouponInput };`);

if (startIndex > -1 && endIndex > -1) {
    const newActions = `
    bot.action('view_my_project', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = \`🌱 <b>FARMSTEGRIDY - SUPPORT</b>\\n\\n\` +
            \`Notre équipe est disponible pour répondre à toutes vos questions concernant vos commandes de CBD.\\n\\n\` +
            \`👉 <i>Utilisez le bouton "Signaler un problème" si vous avez une question sur votre livraison.</i>\`;
        
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'hotline_menu')]]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });
}
`;
    // We will just slice out all the BaaS actions and replace them with a dummy or remove them.
    content = content.slice(0, startIndex) + newActions + "\n" + content.slice(endIndex);
    fs.writeFileSync(file, content);
    console.log('Patched hotline.js');
} else {
    console.log('Could not find boundaries in hotline.js');
}
