'use strict';

// Optional service-contact preference. Not consent to marketing or permission to
// circumvent Telegram restrictions. Enabled only after database security review.
const { Markup } = require('telegraf');
const POLICY = 'service-contact-v1';
const ACCEPT = 'privacy_service_allow_v1';
const REJECT = 'privacy_service_deny_v1';

function identity(ctx) {
    if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return null;
    const userId = String(ctx.from.id);
    const botId = String(ctx.botInfo?.id || '');
    if (!/^\d+$/.test(userId) || !/^\d+$/.test(botId) || String(ctx.chat.id) !== userId) return null;
    return { telegram_user_id: userId, telegram_bot_id: botId };
}

function installContactPrivacy(bot, db, enabled = process.env.CONTACT_PRIVACY_ENABLED === 'true') {
    if (!enabled) return;
    bot.command('privacy', async ctx => {
        const ids = identity(ctx);
        if (!ids) return;
        try {
            const { data, error } = await db.from('bot_contact_preferences')
                .select('service_contact_allowed,policy_version').match(ids).maybeSingle();
            if (error) throw error;
            const current = data?.policy_version === POLICY && data.service_contact_allowed === true;
            await ctx.reply(
                'Confidentialité — contact facultatif lié au service.\n' +
                'Autorisez-vous le support à vous contacter en privé via ce bot pour une question de service ? ' +
                'Aucune publicité. Votre choix est facultatif et révocable avec /privacy.\n' +
                'Statut actuel : ' + (current ? 'autorisé' : 'non autorisé'),
                Markup.inlineKeyboard([
                    [Markup.button.callback('Autoriser', ACCEPT)],
                    [Markup.button.callback('Refuser / retirer mon accord', REJECT)]
                ])
            );
        } catch (err) {
            console.error('[Privacy] Read failed:', err?.code || 'unknown');
            await ctx.reply('Préférences momentanément indisponibles.');
        }
    });
    bot.action([ACCEPT, REJECT], async ctx => {
        const ids = identity(ctx);
        if (!ids) return ctx.answerCbQuery('Action non disponible.', { show_alert: true });
        const allowed = ctx.callbackQuery.data === ACCEPT;
        try {
            const { error } = await db.from('bot_contact_preferences').upsert({
                ...ids, service_contact_allowed: allowed, policy_version: POLICY,
                decided_at: new Date().toISOString()
            }, { onConflict: 'telegram_user_id,telegram_bot_id' });
            if (error) throw error;
            await ctx.answerCbQuery('Choix enregistré.');
            await ctx.reply(allowed ? 'Contact facultatif autorisé pour ce bot.' : 'Contact facultatif refusé. Votre accord est retiré.');
        } catch (err) {
            console.error('[Privacy] Write failed:', err?.code || 'unknown');
            await ctx.answerCbQuery('Choix non enregistré. Réessayez.', { show_alert: true });
        }
    });
    // Blocking the bot revokes the optional preference for that bot.
    bot.on('my_chat_member', async (ctx, next) => {
        const ids = identity(ctx);
        const status = ctx.myChatMember?.new_chat_member?.status;
        if (ids && ['kicked', 'left'].includes(status)) {
            try {
                const { error } = await db.from('bot_contact_preferences').update({
                    service_contact_allowed: false, decided_at: new Date().toISOString()
                }).match(ids);
                if (error) throw error;
            } catch (err) { console.error('[Privacy] Revocation failed:', err?.code || 'unknown'); }
        }
        return next();
    });
}
async function hasServiceContactConsent(db, botId, userId) {
    if (!/^\d+$/.test(String(botId)) || !/^\d+$/.test(String(userId))) return false;
    if (process.env.CONTACT_PRIVACY_ENABLED !== 'true') return false;
    try {
        const { data, error } = await db.from('bot_contact_preferences')
            .select('service_contact_allowed,policy_version')
            .match({telegram_user_id: String(userId), telegram_bot_id: String(botId)})
            .maybeSingle();
        return !error && data?.policy_version === POLICY && data.service_contact_allowed === true;
    } catch (_) { return false; }
}
module.exports = { installContactPrivacy, identity, POLICY, hasServiceContactConsent };
