const { Markup } = require('telegraf');
const { t } = require('./services/i18n');
const { safeEdit } = require('./services/utils');

const user = { language_code: 'fr' };
console.log("t(user, 'btn_back_menu', '◀️ Menu'):", t(user, 'btn_back_menu', '◀️ Menu'));

const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Langue / Language', 'set_language_menu')],
    [Markup.button.callback(t(user, 'btn_back_menu', '◀️ Menu'), 'main_menu')]
]);
console.log("Keyboard:", JSON.stringify(keyboard));
