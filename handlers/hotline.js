const { Markup } = require('telegraf');
const { safeEdit, cleanupUserChat } = require('../services/utils');

const pendingTicketInfo = new Map();
const pendingCouponInput = new Map();

function setupHotlineHandlers(bot) {

    bot.action('hotline_menu', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🎧 <b>ESPACE CLIENT & HOTLINE</b>\n\nBienvenue dans votre espace dédié. Que souhaitez-vous faire ?`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📂 Mon Projet & Abonnements', 'view_my_project')],
            [Markup.button.callback('🆘 Signaler un problème (Ticket)', 'hotline_issues_list')],
            [Markup.button.callback('◀️ Retour', 'start_welcome')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('hotline_issues_list', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🎧 <b>SUPPORT TECHNIQUE</b>\n\nSélectionnez le type de problème rencontré :`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Mon bot Telegram ne fonctionne plus', 'hotline_issue_tg_down')],
            [Markup.button.callback('Mon bot WhatsApp ne fonctionne plus', 'hotline_issue_wa_down')],
            [Markup.button.callback('Mes bots TG et WA ne fonctionnent plus', 'hotline_issue_both_down')],
            [Markup.button.callback('J\'ai un projet / Nouvelle fonctionnalité', 'hotline_issue_feature')],
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
            'tg_down': 'Mon bot Telegram ne fonctionne plus',
            'wa_down': 'Mon bot WhatsApp ne fonctionne plus',
            'both_down': 'Mes bots TG et WA ne fonctionnent plus',
            'feature': 'J\'ai un projet / Nouvelle fonctionnalité',
            'other': 'Mon problème n\'est pas listé'
        };

        const reason = issueMap[issueKey] || 'Problème inconnu';
        pendingTicketInfo.set(ctx.from.id, { reason, type: 'hotline', priority: 'normal' });

        if (issueKey === 'feature') {
            const text = `💡 Vous avez sélectionné : <b>${reason}</b>\n\n` +
                `Notre équipe commerciale est à votre disposition pour concevoir votre solution sur-mesure.\n\n` +
                `⚠️ <b>Pour être recontacté rapidement :</b> Veuillez envoyer votre <b>@username Telegram</b> ci-dessous :`;
                
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('◀️ Annuler', 'hotline_menu')]
            ]);
            return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
        } else {
            const text = `🎧 Vous avez sélectionné : <b>${reason}</b>\n\n` +
                `🔴 <b>Niveau d'urgence :</b>\n` +
                `Si votre problème bloque totalement vos ventes, choisissez <b>URGENT</b>.`;
                
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⚡️ URGENT (Blocage total)', `hotline_priority_urgent`)],
                [Markup.button.callback('🟢 Normal (Demande standard)', `hotline_priority_normal`)],
                [Markup.button.callback('◀️ Annuler', 'hotline_menu')]
            ]);
            return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
        }
    });

    // Handle priority selection
    bot.action(/^hotline_priority_(.+)$/, async (ctx) => {
        const priority = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        
        const info = pendingTicketInfo.get(ctx.from.id);
        if (info) info.priority = priority;

        const text = `🎧 Demande : <b>${info?.reason}</b>\n` +
            `Urgence : <b>${priority === 'urgent' ? '⚡️ URGENT' : '🟢 Normal'}</b>\n\n` +
            `⚠️ <b>Obligatoire :</b> Veuillez envoyer votre <b>@username Telegram</b> ci-dessous pour que l'assistance puisse vous contacter :`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('◀️ Retour', 'hotline_menu')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Sales menu start (after J'aimerais en savoir plus)
    bot.action('sales_menu_start', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        
        const text = `🚀 <b>VOTRE BOT SUR-MESURE</b>\n\n` +
            `Démarrez avec notre base ultra-performante **ShopTonBot** et ajoutez les modules nécessaires à votre croissance.\n\n` +
            `💰 <b>Tarification :</b>\n` +
            `• <b>Pack Base (Standard) : 450€</b>\n` +
            `• Supplément : 200€ / fonctionnalité\n` +
            `• <b>PACK PREMIUM (Tout inclus) : 650€</b> ✨\n\n` +
            `👇 <i>Personnalisez votre projet ci-dessous :</i>`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🥉 Pack Standard (450€)', 'pack_select_standard')],
            [Markup.button.callback('🥈 Pack WhatsApp Plus (550€)', 'pack_select_wa')],
            [Markup.button.callback('🥇 Pack Premium (650€)', 'pack_select_premium')],
            [Markup.button.callback('🚀 Pack Enterprise (950€)', 'pack_select_enterprise')],
            [Markup.button.callback('🏗 À la carte (Sur mesure)', 'config_start')],
            [Markup.button.callback('📊 Comparer les solutions', 'show_comparison')],
            [Markup.button.callback('◀️ Retour', 'start_welcome')]
        ]);
        
        const baseDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 'monshopbot-production.up.railway.app';
        return safeEdit(ctx, text, { 
            parse_mode: 'HTML', 
            photo: `https://${baseDomain}/public/bot_ventes_premium_fr.png` || null,
            ...keyboard 
        });
    });

    // Configurateur State Management
    const userSelections = new Map();

    const categories = [
        { id: 'cat_core', name: '🛒 Vente & Catalogue', icon: '🛒' },
        { id: 'cat_pay', name: '💳 Paiement & Finance', icon: '💳' },
        { id: 'cat_log', name: '🚴 Logistique', icon: '🚴' },
        { id: 'cat_mkt', name: '📣 Marketing', icon: '📣' },
        { id: 'cat_admin', name: '⚙️ Gestion Admin', icon: '⚙️' },
        { id: 'cat_growth', name: '📈 Croissance', icon: '📈' },
        { id: 'cat_support', name: '🎧 Support', icon: '🎧' }
    ];

const BASE_FEATURES = ['catalogue_pro', 'stock_mgmt', 'dashboard_pro', 'hotline_support', 'price_tiers'];

    const featureCatalog = {
        'cat_core': [
            { id: 'catalogue_pro', name: 'Catalogue Multi-Médias (Photo/Vidéo)' },
            { id: 'stock_mgmt', name: 'Gestion des Stocks Intelligente' },
            { id: 'bundle_system', name: 'Système de Bundles (Ex: 1 acheté = 1 offert)' },
            { id: 'price_tiers', name: 'Grilles de Tarifs Dégressifs' },
            { id: 'express_reorder', name: 'Bouton Achat Express (One-Click)' }
        ],
        'cat_admin': [
            { id: 'dashboard_pro', name: 'Dashboard Admin (Stats & Analytics)' },
            { id: 'chat_admin_client', name: 'Chat Direct Admin/Client' },
            { id: 'broadcast_system', name: 'Système de Diffusion (Broadcast)' },
            { id: 'supplier_mp', name: 'Espace Marketplace (Fournisseurs)' },
            { id: 'low_stock_alerts', name: 'Alertes Stocks Critiques (Push)' },
            { id: 'data_export_csv', name: 'Exports Comptables (CSV/Excel)' },
            { id: 'multi_admin_roles', name: 'Gestion Rôles Multi-Admin' }
        ],
        'cat_pay': [
            { id: 'crypto_pay_manual', name: 'Paiements Crypto (Wallet)' },
            { id: 'transfer_manual', name: 'Virement Bancaire (RIB)' },
            { id: 'payment_proof_system', name: 'Validation par Preuve (Screenshot)' },
            { id: 'fidelity_wallet', name: 'Portefeuille Client & Points' }
        ],
        'cat_log': [
            { id: 'livreur_system', name: 'Console Livreur Web/Bot' },
            { id: 'geo_tracking', name: 'Géolocalisation & ETA Livraison' },
            { id: 'assign_auto', name: 'Assignation Auto des Commandes' }
        ],
        'cat_growth': [
            { id: 'referral_system', name: 'Système de Parrainage (Bonus)' },
            { id: 'promo_codes', name: 'Gestion des Codes Promos' },
            { id: 'force_join', name: 'Force Join (Gating Canal)' },
            { id: 'auto_approve', name: 'Auto-Approve (Nouveaux Membres)' },
            { id: 'abandoned_cart_recovery', name: 'Relance Paniers Abandonnés' },
            { id: 'vip_tier_system', name: 'Programme VIP Évolutif (Bronze/Gold)' }
        ],
        'cat_support': [
            { id: 'hotline_support', name: 'Hotline & Système de Tickets' },
            { id: 'review_system', name: 'Système d\'Avis & Notes Clients' },
            { id: 'multi_lang', name: 'Interface Multi-Langues' }
        ]
    };

    bot.action('config_start', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const userId = ctx.from.id;
        if (!userSelections.has(userId)) userSelections.set(userId, new Set());

        const text = `🏗 <b>CONFIGURATEUR DE BOT</b>\n\n` +
            `Choisissez une catégorie pour ajouter des fonctionnalités à votre futur bot :`;
        
        const buttons = categories.map(cat => [Markup.button.callback(`${cat.icon} ${cat.name}`, `config_cat_${cat.id}`)]);
        buttons.push([Markup.button.callback('🛒 Voir mon Panier / Résumé', 'config_summary')]);
        buttons.push([Markup.button.callback('🗣 Projet spécifique / Sur mesure', 'hotline_issue_feature')]);
        buttons.push([Markup.button.callback('◀️ Retour', 'sales_menu_start')]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    });

    bot.action(/^config_cat_(.+)$/, async (ctx) => {
        const catId = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        const userId = ctx.from.id;
        const selections = userSelections.get(userId) || new Set();
        const cat = categories.find(c => c.id === catId);
        const features = featureCatalog[catId] || [];

        let text = `${cat.icon} <b>CATÉGORIE : ${cat.name}</b>\n\nCliquez sur une option pour l'ajouter ou la retirer :`;
        
        const buttons = features
            .filter(f => !BASE_FEATURES.includes(f.id)) // Masquer les fonctions de base
            .map(f => {
                const isSelected = selections.has(f.id);
                return [Markup.button.callback(`${isSelected ? '✅' : '➕'} ${f.name}`, `config_toggle_${catId}_${f.id}`)];
            });
        
        if (buttons.length === 0) {
            text = `${cat.icon} <b>CATÉGORIE : ${cat.name}</b>\n\nToutes les fonctionnalités de cette catégorie sont déjà incluses dans votre pack de base !`;
        }

        buttons.push([Markup.button.callback('◀️ Retour aux catégories', 'config_start')]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    });

    bot.action(/^config_toggle_(.+)_(.+)$/, async (ctx) => {
        const catId = ctx.match[1];
        const featureId = ctx.match[2];
        const userId = ctx.from.id;
        const selections = userSelections.get(userId);
        
        if (selections.has(featureId)) selections.delete(featureId);
        else selections.add(featureId);

        await ctx.answerCbQuery(`${selections.has(featureId) ? 'Ajouté' : 'Retiré'}`);
        
        const cat = categories.find(c => c.id === catId);
        const features = featureCatalog[catId] || [];

        return ctx.callbackQuery.message.reply_markup ? ctx.editMessageReplyMarkup(
            Markup.inlineKeyboard([
                ...features.filter(f => !BASE_FEATURES.includes(f.id)).map(f => {
                    const isSelected = selections.has(f.id);
                    return [Markup.button.callback(`${isSelected ? '✅' : '➕'} ${f.name}`, `config_toggle_${catId}_${f.id}`)];
                }),
                [Markup.button.callback('◀️ Retour aux catégories', 'config_start')]
            ]).reply_markup
        ).catch(() => {}) : null;
    });

    bot.action('config_summary', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const userId = ctx.from.id;
        const selections = userSelections.get(userId) || new Set();
        
        // On ne compte que les suppléments (hors base)
        const supplements = Array.from(selections).filter(id => !BASE_FEATURES.includes(id));
        
        let basePrice = 450;
        let totalPrice = basePrice + (supplements.length * 200);
        let finalPrice = totalPrice;
        let isBundle = false;
        let bundleName = '';

        if (supplements.length >= 4 || finalPrice >= 950) {
            finalPrice = 950;
            isBundle = true;
            bundleName = 'Pack Enterprise 🚀';
        } else if (supplements.length >= 2 || finalPrice >= 650) {
            finalPrice = 650;
            isBundle = true;
            bundleName = 'Pack Premium ✨';
        }

        let text = `🛒 <b>RÉSUMÉ DE VOTRE CONFIGURATION</b>\n\n`;
        const allFeatures = Object.values(featureCatalog).flat();
        
        text += `🟢 <b>Base Incluse (Standard) :</b>\n`;
        BASE_FEATURES.forEach(id => {
            const f = allFeatures.find(item => item.id === id);
            text += `• ${f?.name || id}\n`;
        });

        if (supplements.length > 0) {
            text += `\n➕ <b>Suppléments sélectionnés :</b>\n`;
            supplements.forEach(id => {
                const f = allFeatures.find(item => item.id === id);
                text += `• ${f?.name || id}\n`;
            });
        }

        text += `\n💰 Estimation : <b>${finalPrice}€</b>` + (isBundle ? ` (${bundleName})` : ` (Pack Base + Suppléments 🍽)`);
        
        if (!isBundle) {
            text += `\n\n💡 <b>CONSEIL :</b> Ajoutez 2 suppléments pour débloquer le <b>Pack Premium (650€)</b>, ou optez pour le <b>Pack Enterprise (950€)</b> pour avoir TOUTES les nouveautés SaaS !`;
        } else if (finalPrice === 650) {
            text += `\n\n💡 <b>UPGRADE :</b> Passez au <b>Pack Enterprise (950€)</b> pour débloquer les WebApps de suivi, l'auto-retargeting et l'export comptable !`;
        }

        const buttons = [];
        if (supplements.length > 0 || isBundle) {
            buttons.push([Markup.button.callback('✅ Valider ma configuration', 'config_confirm')]);
        }
        buttons.push([Markup.button.callback('➕ Continuer mes achats', 'config_start')]);
        buttons.push([Markup.button.callback('🗣 Projet spécifique / Sur mesure', 'hotline_issue_feature')]);
        buttons.push([Markup.button.callback('🗑 Vider le panier', 'config_clear')]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    });

    bot.action('config_clear', async (ctx) => {
        userSelections.delete(ctx.from.id);
        await ctx.answerCbQuery('Panier vidé');
        return ctx.editMessageText('🗑 Votre panier a été vidé.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'config_start')]]));
    });

    bot.action('config_confirm', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `📋 <b>PROCESSUS DE MISE EN PLACE (Obligatoire)</b>\n\n` +
            `Pour finaliser votre commande, vous devez nous fournir les éléments décrits dans le document "Process mise en place bot .pdf" :\n\n` +
            `1️⃣ <b>Votre User ID</b> (via @userinfobot)\n` +
            `2️⃣ <b>Votre Clé API</b> (via @BotFather)\n` +
            `3️⃣ <b>Identifiants Gmail dédiés</b>\n\n` +
            `⚠️ <i>Sans ces informations, nous ne pourrons pas démarrer l'installation.</i>\n\n` +
            `Souhaitez-vous envoyer ces informations maintenant ?`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Oui, j\'ai tout préparé', 'hotline_issue_feature')],
            [Markup.button.callback('◀️ Retour au panier', 'config_summary')]
        ]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Features Showcase
    bot.action('show_features', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `🚀 <b>FONCTIONNALITÉS INCLUSES</b>\n\n` +
            `Nos bots sont conçus pour offrir la meilleure expérience utilisateur possible :\n\n` +
            `🛒 <b>Catalogue Dynamique</b> : Gestion illimitée de produits avec photos et vidéos.\n` +
            `💳 <b>Paiements Sécurisés</b> : Crypto, Virement, Cash (Validation par preuve).\n` +
            `🎁 <b>Fidélisation</b> : Système de parrainage et codes promos intégrés.\n` +
            `🚴 <b>Système Livreur</b> : Console dédiée pour vos livreurs avec géolocalisation.\n` +
            `📊 <b>Dashboard Admin</b> : Statistiques de ventes en temps réel et gestion totale.\n` +
            `🎧 <b>Support Hotline</b> : Système de tickets intégré pour aider vos clients.\n` +
            `📱 <b>Sync Cloud</b> : Vos données sont sauvegardées et synchronisées partout.\n\n` +
            `🔥 <i>Et bien plus encore pour dominer votre marché !</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💎 Voir les Tarifs', 'show_pricing')],
            [Markup.button.callback('◀️ Retour', 'sales_menu_start')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action(/^pack_select_(.+)$/, async (ctx) => {
        const packId = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        
        const packs = {
            'standard': { name: 'Standard (Telegram)', price: 450 },
            'wa': { name: 'WhatsApp Plus', price: 550 },
            'premium': { name: 'Premium (Fonctions Avancées)', price: 650 },
            'enterprise': { name: 'Enterprise (SaaS Intégral)', price: 950 }
        };
        
        const pack = packs[packId];
        const text = `💎 <b>PACK SÉLECTIONNÉ : ${pack.name}</b>\n\n` +
            `Excellent choix ! Ce pack inclut toutes les fonctionnalités nécessaires pour votre business au tarif de <b>${pack.price}€</b>.\n\n` +
            `Souhaitez-vous passer à l'étape suivante pour finaliser l'installation ?`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Oui, continuer', 'config_confirm')],
            [Markup.button.callback('◀️ Retour aux packs', 'sales_menu_start')]
        ]);
        
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('show_comparison', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `📊 <b>COMPARATIF DES SOLUTIONS</b>\n\n` +
            `🔹 <b>PACK STANDARD (450€)</b>\n` +
            `• Base ultra-stable (Telegram)\n` +
            `• Catalogue & Gestion des stocks\n` +
            `• Paiements Cash & Preuves\n\n` +
            `🔸 <b>PACK PREMIUM (650€)</b>\n` +
            `• WhatsApp + Telegram synchronisés\n` +
            `• Marketplace Fournisseurs & Livreur Pro\n` +
            `• Fidélité & Parrainage\n\n` +
            `🚀 <b>PACK ENTERPRISE (950€)</b>\n` +
            `• <b>TOUTES</b> les nouveautés SaaS incluses\n` +
            `• Relance de paniers abandonnés (Auto-Retargeting)\n` +
            `• Programme VIP Évolutif (Fidélité)\n` +
            `• Exports comptables CSV & Alertes Stock\n\n` +
            `💡 <i>Le Pack Enterprise maximise votre rentabilité et automatise votre comptabilité.</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏗 Lancer le Configurateur', 'config_start')],
            [Markup.button.callback('◀️ Retour', 'sales_menu_start')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Pricing menu
    bot.action('show_pricing', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `💎 <b>CHOISISSEZ VOTRE FORMULE</b>\n\n` +
            `Investissez dans l'outil qui va faire passer votre business au niveau supérieur :\n\n` +
            `🥉 <b>PACK BRONZE - 450€</b>\n` +
            `• Bot Telegram Complet\n` +
            `• Support technique 1 an\n` +
            `• Hébergement inclus\n\n` +
            `🟧 <b>PACK WHATSAPP - 550€</b>\n` +
            `• Bot WhatsApp Professionnel\n` +
            `• Gestion stable des sessions\n` +
            `• Support technique 1 an\n\n` +
            `🥈 <b>PACK STANDARD - 650€</b>\n` +
            `• <b>Telegram + WhatsApp Sync</b>\n` +
            `• Système Livreur Premium\n` +
            `• Dashboard Admin Avancé\n\n` +
            `🥇 <b>PACK PREMIUM - 750€</b>\n` +
            `• <b>L'offre ULTIME : Tout inclus</b>\n` +
            `• Installation prioritaire\n` +
            `• Personnalisation complète du design\n` +
            `• Accès aux futures mises à jour\n\n` +
            `👇 <i>Sélectionnez votre formule pour démarrer :</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🥉 Bronze (TG)', 'select_plan_bronze'), Markup.button.callback('🟧 WhatsApp', 'select_plan_wa')],
            [Markup.button.callback('🥈 Standard (TG+WA)', 'select_plan_standard')],
            [Markup.button.callback('🥇 PREMIUM (Recommandé)', 'select_plan_premium')],
            [Markup.button.callback('◀️ Retour', 'sales_menu_start')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Handle plan selection
    bot.action(/^select_plan_(.+)$/, async (ctx) => {
        const planKey = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});

        const planMap = {
            'bronze': { name: '🥉 Bronze 350€ (TG)', discount: 10 },
            'wa': { name: '🟧 WhatsApp 450€', discount: 20 },
            'standard': { name: '🥈 Standard 550€ (TG+WA)', discount: 30 },
            'premium': { name: '🥇 Premium 650€', discount: 50 }
        };

        const planObj = planMap[planKey] || { name: 'Plan inconnu', discount: 0 };
        pendingTicketInfo.set(ctx.from.id, { planKey, reason: `Intéressé par : ${planObj.name}`, type: 'sales', discount: planObj.discount });

        const text = `💎 Vous avez choisi la formule : <b>${planObj.name}</b>\n\n` +
                     `🎁 <b>Avantage Parrainage / Promo :</b>\n` +
                     `En saisissant le code d'un parrain ou un code promo, vous bénéficiez instantanément d'une réduction de <b>${planObj.discount}€</b> sur ce pack !\n\n` +
                     `👇 <i>Souhaitez-vous appliquer un code de réduction ?</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🎟️ Saisir un code de réduction', `enter_coupon_${planKey}`)],
            [Markup.button.callback('➡️ Continuer sans code', `confirm_plan_${planKey}`)],
            [Markup.button.callback('◀️ Annuler', 'show_pricing')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action(/^enter_coupon_(.+)$/, async (ctx) => {
        const planKey = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        pendingCouponInput.set(ctx.from.id, planKey);

        const text = `🎟️ <b>SAISIE DU CODE PROMO / PARRAINAGE</b>\n\n` +
                     `Veuillez écrire votre <b>Code Promo</b> ou <b>Code Parrain</b> dans le chat ci-dessous :`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('➡️ Continuer sans code', `confirm_plan_${planKey}`)],
            [Markup.button.callback('◀️ Retour', `select_plan_${planKey}`)]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action(/^confirm_plan_(.+)$/, async (ctx) => {
        const planKey = ctx.match[1];
        await ctx.answerCbQuery().catch(() => {});
        pendingCouponInput.delete(ctx.from.id);

        const ticketData = pendingTicketInfo.get(ctx.from.id);
        if (!ticketData) return safeEdit(ctx, "❌ Session expirée.", Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'show_pricing')]]));

        const text = `💎 Formule choisie : <b>${ticketData.applied_discount ? ticketData.reason_with_discount : ticketData.reason}</b>\n\n` +
                     `⚠️ <b>Obligatoire :</b> Afin que notre équipe puisse finaliser votre commande et vous contacter, veuillez envoyer votre <b>@username Telegram</b> ou numéro WhatsApp ci-dessous :`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('◀️ Annuler', 'show_pricing')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    // Handle text input for username and coupon codes
    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;

        // 1. Interception de saisie du code promo
        if (pendingCouponInput.has(userId)) {
            const planKey = pendingCouponInput.get(userId);
            pendingCouponInput.delete(userId);
            const codeInput = ctx.message.text.trim().toUpperCase();

            const ticketData = pendingTicketInfo.get(userId);
            if (!ticketData) return next();

            if (codeInput.length >= 3) {
                const discount = ticketData.discount || 10;
                ticketData.applied_discount = discount;
                ticketData.coupon_code = codeInput;
                ticketData.reason_with_discount = `${ticketData.reason}\n🏷️ Réduction appliquée : -${discount}€ (Code: ${codeInput})`;
                pendingTicketInfo.set(userId, ticketData);

                const text = `✅ <b>Félicitations ! Le code "${codeInput}" a été validé avec succès.</b>\n\n` +
                             `🏷️ Réduction immédiate de <b>${discount}€</b> appliquée sur votre formule !\n\n` +
                             `⚠️ <b>Obligatoire :</b> Afin que notre équipe finalise l'activation de votre bot, veuillez envoyer votre <b>@username Telegram</b> ou numéro de contact ci-dessous :`;
                
                await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler', 'show_pricing')]]) });
            } else {
                await ctx.reply(`❌ <b>Code invalide.</b>\n\nVeuillez réessayer ou continuer sans code.`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🎟️ Réessayer', `enter_coupon_${planKey}`)],
                        [Markup.button.callback('➡️ Continuer sans code', `confirm_plan_${planKey}`)]
                    ])
                });
            }
            return;
        }

        // 2. Interception du contact/username
        if (pendingTicketInfo.has(userId)) {
            const ticketData = pendingTicketInfo.get(userId);
            const usernameInput = ctx.message.text.trim();
            pendingTicketInfo.delete(userId);

            const finalReason = ticketData.applied_discount ? 
                `${ticketData.reason_with_discount}\n\n👤 <b>Contact fourni par l'utilisateur :</b> ${usernameInput}` :
                `${ticketData.reason}\n\n👤 <b>Contact fourni par l'utilisateur :</b> ${usernameInput}`;

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

            if (ticketData.type === 'hotline') {
                const text = `✅ <b>Ticket envoyé avec succès !</b>\n\nVotre demande a bien été transmise à notre équipe technique. Un administrateur va vous répondre très prochainement sur votre compte Telegram : <b>${usernameInput}</b>.`;
                
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
            } else {
                const text = `🎉 <b>Excellent choix !</b>\n\nUn ticket a été ouvert. Notre équipe vous contactera très vite sur votre compte de contact <b>${usernameInput}</b> pour finaliser l'activation de votre bot !`;
                
                // NOTIFICATION SALES
                const { notifyAdmins } = require('../services/notifications');
                const adminMsg = `💰 <b>NOUVEAU TICKET VENTE (BaaS)</b>\n\n` +
                    `👤 Client : ${ctx.from.first_name} (@${ctx.from.username || 'N/A'})\n` +
                    `🆔 ID : <code>${userId}</code>\n` +
                    `🏗 Intérêt : <b>${ticketData.applied_discount ? ticketData.reason_with_discount : ticketData.reason}</b>\n` +
                    `📱 Contact : <b>${usernameInput}</b>`;
                
                await notifyAdmins(ctx.bot || bot, adminMsg, {
                    reply_markup: {
                        inline_keyboard: [
                            [Markup.button.callback('💬 Contacter le client', `admin_chat_reply_${userId}`)]
                        ]
                    }
                }).catch(err => console.error('[SALES-NOTIF-ERR]', err));

                return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour à l\'accueil', 'start_welcome')]]) });
            }
        }
        return next();
    });
    // --- ESPACE PROJET & ABONNEMENTS ---
    bot.action('view_my_project', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const { supabase } = require('../services/database');
        const userId = String(ctx.from.id);
        
        // Récupérer le projet du client
        const { data: project } = await supabase.from('bot_client_projects').select('*').eq('id', `telegram_${userId}`).single();
        
        if (!project) {
            const text = `📂 <b>MON PROJET</b>\n\n` +
                `Vous n'avez pas encore de projet enregistré sur ce compte ou votre projet est en cours de déploiement.\n\n` +
                `👉 <i>Si vous êtes déjà client, contactez l'admin pour lier votre projet à cet ID Telegram.</i>`;
            const keyboard = Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'hotline_menu')]]);
            return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
        }

        const features = project.features || [];
        const plan = project.subscription_plan || 'none';
        const expires = project.subscription_expires_at ? new Date(project.subscription_expires_at).toLocaleDateString('fr-FR') : 'N/A';

        const planNames = {
            'none': '❌ Aucun (Paiement à l\'acte)',
            'maintenance': '🛠 Maintenance & Sécurité',
            'evolution': '🚀 Évolution & Croissance'
        };

        const text = `📂 <b>VOTRE PROJET : ${project.bot_name || 'Bot Client'}</b>\n\n` +
            `🤖 Type : <b>${project.bot_type?.toUpperCase() || 'TG'}</b>\n` +
            `💎 Abonnement : <b>${planNames[plan]}</b>\n` +
            `📅 Prochaine échéance : <code>${expires}</code>\n\n` +
            `✅ <b>Fonctionnalités actives :</b>\n` +
            (features.length > 0 ? features.map(f => `• ${f}`).join('\n') : '<i>Aucune option activée</i>') + '\n\n' +
            `🛠 <b>Actions :</b>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Voir les Abonnements', 'view_sub_plans')],
            [Markup.button.callback('✨ Recommandations pour vous', 'view_recommendations')],
            [Markup.button.callback('◀️ Retour', 'hotline_menu')]
        ]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('view_sub_plans', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const text = `💎 <b>NOS SOLUTIONS D'ACCOMPAGNEMENT</b>\n\n` +
            `Garantissez la pérennité et l'évolution constante de votre infrastructure :\n\n` +
            `🛠 <b>Pack Maintenance & Sécurité - 50€/mois</b>\n` +
            `• Remise en ligne prioritaire (SLA 99.9%)\n` +
            `• Mises à jour critiques de sécurité incluses\n` +
            `• Sauvegardes quotidiennes externalisées\n\n` +
            `🚀 <b>Pack Évolution Business - 100€/mois</b>\n` +
            `• <b>2 Nouvelles fonctionnalités / mois incluses</b> (Valeur 200€)\n` +
            `• Support VIP Prioritaire 24h/7j\n` +
            `• Maintenance & Sécurité complète incluse\n\n` +
            `💸 <i>Hors abonnement : 85€ par ajout de fonctionnalité.</i>`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('S\'abonner au Pack Maintenance', 'sub_request_maintenance')],
            [Markup.button.callback('S\'abonner au Pack Évolution', 'sub_request_evolution')],
            [Markup.button.callback('◀️ Retour', 'view_my_project')]
        ]);
        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('view_recommendations', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const { supabase } = require('../services/database');
        const userId = String(ctx.from.id);
        
        const [projectData, catalogData] = await Promise.all([
            supabase.from('bot_client_projects').select('features').eq('id', `telegram_${userId}`).single(),
            supabase.from('bot_features_catalog').select('*')
        ]);

        const myFeatures = projectData.data?.features || [];
        const allFeatures = catalogData.data || [];
        
        // Trouver ce que le client n'a pas
        const recommendations = allFeatures.filter(f => !myFeatures.includes(f.id));

        let text = `✨ <b>RECOMMANDATIONS POUR VOUTE BOT</b>\n\n` +
            `Voici les fonctionnalités que vous ne possédez pas encore et qui pourraient booster vos ventes :\n\n`;

        if (recommendations.length === 0) {
            text += `✅ <b>Félicitations !</b> Vous possédez déjà toutes les options disponibles. Votre bot est au maximum de ses capacités.`;
        } else {
            recommendations.slice(0, 3).forEach(f => {
                text += `<b>• ${f.name}</b> (${f.price}€)\n<i>${f.description}</i>\n\n`;
            });
            text += `👇 <i>Contactez l'admin pour ajouter l'une de ces options !</i>`;
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💬 Demander une installation', 'hotline_issue_feature')],
            [Markup.button.callback('◀️ Retour', 'view_my_project')]
        ]);

        return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action(/^sub_request_(.+)$/, async (ctx) => {
        const plan = ctx.match[1];
        await ctx.answerCbQuery('Demande envoyée !');
        
        const { notifyAdmins } = require('../services/notifications');
        const adminMsg = `💳 <b>NOUVELLE DEMANDE D'ABONNEMENT</b>\n\n` +
            `👤 Client : ${ctx.from.first_name} (@${ctx.from.username})\n` +
            `🆔 ID : <code>${ctx.from.id}</code>\n` +
            `💎 Formule : <b>${plan.toUpperCase()}</b>`;
        
        await notifyAdmins(ctx.bot || bot, adminMsg);
        
        return ctx.reply(`✅ <b>Votre demande a été transmise !</b>\n\nL'administrateur va vous contacter pour activer votre abonnement <b>${plan}</b>.`);
    });

    // Admin Broadcast Command for New Features
    if (bot.command) {
        bot.command('broadcast_nouveautes', async (ctx) => {
            const adminIds = [1183134641, 7628179403]; // Les IDs Admin
            if (!adminIds.includes(ctx.from.id)) return;

            await ctx.reply('🚀 Démarrage de la diffusion (Broadcast) en cours...');
            
            const { supabase } = require('../services/database');
            const { data: users } = await supabase.from('bot_users').select('id');
            
            if (!users) return ctx.reply('❌ Erreur: Aucun utilisateur trouvé.');

            const message = `🚀 <b>NOUVELLES FONCTIONNALITÉS DISPONIBLES !</b>\n\n` +
                `Améliorez votre bot avec nos derniers ajouts exclusifs pour augmenter vos ventes et fidéliser vos clients :\n\n` +
                `⚡️ <b>Bouton "Achat Express"</b> : Commande en 1 clic pour vos clients réguliers. Le bot mémorise leur commande et réduit le temps d'achat à 3 secondes.\n` +
                `🏆 <b>Programme VIP Évolutif</b> : Statuts Bronze/Silver/Gold. Passé un certain montant d'achat, le client débloque des remises automatiques (ex: -5% pour les membres Gold).\n` +
                `📈 <b>Relance de Paniers Abandonnés</b> : Le bot recontacte automatiquement les clients qui n'ont pas finalisé leur achat.\n` +
                `📊 <b>Exports & Alertes Admin</b> : Exportez vos ventes en Excel/CSV et recevez des alertes automatiques si vos stocks sont bas.\n\n` +
                `💎 <b>Tarif d'installation : 85€ net par fonctionnalité.</b>\n\n` +
                `👉 <i>Intéressé ? Rendez-vous dans votre menu "Espace Client & Hotline" pour demander l'installation immédiate !</i>`;

            let success = 0;
            for (const user of users) {
                try {
                    const tgId = user.id.replace('telegram_', '');
                    await ctx.telegram.sendMessage(tgId, message, { parse_mode: 'HTML' });
                    success++;
                    await new Promise(r => setTimeout(r, 50)); // Anti-spam
                } catch (e) {}
            }

            return ctx.reply(`✅ <b>Diffusion terminée !</b>\nMessage envoyé à ${success} clients potentiels.`, { parse_mode: 'HTML' });
        });
    }
}

module.exports = { setupHotlineHandlers, pendingTicketInfo, pendingCouponInput };
