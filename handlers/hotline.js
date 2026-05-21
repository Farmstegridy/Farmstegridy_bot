const { Markup } = require('telegraf');
const { safeEdit } = require('../services/utils');

const pendingTicketInfo = new Map();

function setupHotlineHandlers(bot) {

    bot.action('hotline_menu', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🎧 <b>ESPACE CLIENT & SUPPORT</b>\n\nBienvenue dans votre espace dédié. Que souhaitez-vous faire ?`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📂 FAQ & Infos Pratiques', 'view_my_project')],
            [Markup.button.callback('🆘 Signaler un problème', 'hotline_issues_list')],
            [Markup.button.callback('◀️ Retour', 'start_welcome')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('hotline_issues_list', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🎧 <b>SUPPORT TECHNIQUE</b>\n\nSélectionnez le type de problème rencontré :`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Ma commande n\'est pas arrivée', 'hotline_issue_order_delayed')],
            [Markup.button.callback('Problème avec le paiement', 'hotline_issue_payment')],
            [Markup.button.callback('Erreur dans ma commande', 'hotline_issue_order_error')],
            [Markup.button.callback('Mon problème n\'est pas listé', 'hotline_issue_other')],
            [Markup.button.callback('◀️ Retour', 'hotline_menu')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Handle issue selection
    bot.action(/^hotline_issue_(.+)$/, async (ctx) => {
        const issueKey = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});

        const issueMap = {
            'order_delayed': 'Ma commande n\'est pas arrivée',
            'payment': 'Problème avec le paiement',
            'order_error': 'Erreur dans ma commande',
            'other': 'Mon problème n\'est pas listé'
        };

        const reason = issueMap[issueKey] || 'Problème inconnu';
        pendingTicketInfo.set(ctx.from.id, { reason, type: 'hotline', priority: 'normal' });

        const text = `🎧 Vous avez sélectionné : <b>${reason}</b>\n\n` +
            `🔴 <b>Niveau d'urgence :</b>\n` +
            `Si votre problème bloque totalement votre expérience d'achat, choisissez <b>URGENT</b>.`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('⚡️ URGENT (Bloquant)', `hotline_priority_urgent`)],
            [Markup.button.callback('🟢 Normal (Demande standard)', `hotline_priority_normal`)],
            [Markup.button.callback('◀️ Annuler', 'hotline_menu')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Handle priority selection
    bot.action(/^hotline_priority_(.+)$/, async (ctx) => {
        const priority = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        
        const info = pendingTicketInfo.get(ctx.from.id);
        if (info) info.priority = priority;

        const text = `🎧 Demande : <b>${info?.reason}</b>\n` +
            `Urgence : <b>${priority === 'urgent' ? '⚡️ URGENT' : '🟢 Normal'}</b>\n\n` +
            `⚠️ <b>Obligatoire :</b> Veuillez envoyer votre <b>@username Telegram</b> ou un numéro de contact ci-dessous pour que l'assistance puisse vous recontacter :`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('◀️ Retour', 'hotline_menu')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Handle text input for username
    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;

        // Interception du contact/username pour les tickets
        if (pendingTicketInfo.has(userId)) {
            const ticketData = pendingTicketInfo.get(userId);
            const usernameInput = ctx.message.text.trim();
            pendingTicketInfo.delete(userId);

            const finalReason = `${ticketData.reason}\n\n👤 <b>Contact fourni par l'utilisateur :</b> ${usernameInput}`;

            // Save to bot_support_logs
            const { supabase } = require('../services/database');
            const payload = {
                user_id: String(userId),
                staff_id: null,
                message: JSON.stringify({ 
                    reason: finalReason, 
                    status: 'open', 
                    price: null, 
                    priority: ticketData.priority || 'normal',
                    category: ticketData.type 
                }),
                type: 'ticket',
                direction: 'in',
                created_at: new Date().toISOString()
            };
            await supabase.from('bot_support_logs').insert([payload]);

            const text = `✅ <b>Demande envoyée avec succès !</b>\n\nVotre demande a bien été transmise à notre équipe. Un membre du support va vous répondre très prochainement.`;
            
            // NOTIFICATION ADMIN
            const { notifyAdmins } = require('../services/notifications');
            const adminMsg = `🚨 <b>NOUVEAU TICKET SUPPORT</b>\n\n` +
                `👤 Client : ${ctx.from.first_name} (@${ctx.from.username || 'N/A'})\n` +
                `🆔 ID : <code>${userId}</code>\n` +
                `🔴 Problème : <b>${ticketData.reason}</b>\n` +
                `⚡️ Urgence : <b>${ticketData.priority === 'urgent' ? 'URGENT' : 'Normal'}</b>\n` +
                `📱 Contact : <b>${usernameInput}</b>`;
            
            await notifyAdmins(ctx.bot || bot, adminMsg, {
                reply_markup: {
                    inline_keyboard: [
                        [Markup.button.callback('📥 Voir les tickets', 'admin_tickets')],
                        [Markup.button.callback('💬 Répondre', `admin_chat_reply_${userId}`)]
                    ]
                }
            }).catch(err => console.error('[HOTLINE-NOTIF-ERR]', err));

            return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour à l\'accueil', 'start_welcome')]]) });
        }
        return next();
    });

    bot.action('view_my_project', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🌱 <b>FARMSTEGRIDY - INFOS PRATIQUES</b>\n\n` +
            `Notre équipe est disponible pour répondre à toutes vos questions concernant vos commandes de CBD.\n\n` +
            `📦 <b>Livraison :</b> Expédition sous 24/48h.\n` +
            `🌿 <b>Qualité :</b> Tous nos produits sont certifiés et analysés en laboratoire.\n\n` +
            `👉 <i>Utilisez le bouton "Signaler un problème" en cas de pépin avec votre livraison.</i>`;
        
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'hotline_menu')]]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });
}

// Ensure we still export what was expected (even if pendingCouponInput is no longer used, we just export an empty map to not break index.js if it imports it)
const pendingCouponInput = new Map();
module.exports = { setupHotlineHandlers, pendingTicketInfo, pendingCouponInput };
