const { getAllUsersForBroadcast, getAppSettings, saveBroadcast, getGlobalStats } = require('./database');
const { broadcastMessage } = require('./broadcast');

/**
 * MarketingService : Gère les notifications automatiques "Uber-style"
 * Objectif : Re-engager les clients inactifs et convertir les curieux.
 */

async function getMarketingTemplates() {
    const settings = await getAppSettings();
    if (settings.marketing_templates && Array.isArray(settings.marketing_templates)) {
        return settings.marketing_templates;
    }
    return [
        // PROSPECTS (Curieux / Présentation Bot)
        {
            segment: "prospect",
            title: "🚀 CRÉEZ VOTRE BOT PROFESSIONNEL",
            message: "Bonjour {first_name}, sublimez votre activité avec un bot sur-mesure de présentation ou de vente automatisée sur Telegram et WhatsApp.\n\n✨ <b>De 10€ à 50€ de réduction immédiate</b> sur nos formules grâce à votre code parrainage ou code promo !\n\n👇 Découvrez nos solutions BaaS :",
            action: "DÉCOUVRIR LES SOLUTIONS",
            type: "catalog"
        },
        // CLIENTS (Déjà possesseurs d'un bot / Intéressés par les modules)
        {
            segment: "client",
            title: "⚙️ BOOSTEZ VOTRE BOT EXISTANT",
            message: "Bonjour {first_name}, optimisez la rentabilité et la fidélisation de votre bot avec nos nouvelles fonctionnalités avancées (Mini-App native, relances automatiques, multi-vendeurs, paiements intégrés).\n\n👇 Découvrir les modules additionnels :",
            action: "VOIR LES MODULES",
            type: "catalog"
        },
        {
            segment: "prospect",
            title: "🤝 PARRAINEZ ET GAGNEZ GROS",
            message: "Partagez votre excellence ! Recommandez nos bots à votre réseau et offrez-leur une réduction immédiate de <b>10€ à 50€</b> sur leur formule de lancement.\n\nEn retour, touchez des commissions élevées pour chaque bot activé !\n\n👇 Obtenir mon code parrainage :",
            action: "MON CODE PARRAIN",
            type: "referral"
        },
        {
            segment: "client",
            title: "🎁 VOS MODULES COMPLÉMENTAIRES",
            message: "Merci pour votre confiance {first_name}. En tant que client privilégié ayant acquis de nouvelles fonctionnalités, découvrez en avant-première nos intégrations exclusives pour piloter vos flux de commandes !\n\n👇 Consulter mon tableau de bord :",
            action: "MON PROFIL",
            type: "loyalty"
        }
    ];
}

/**
 * Strategic Hours (Paris Time)
 */
const { createPersistentMap } = require('./persistent_map');
const marketingState = createPersistentMap('marketing_state');

async function runAutomatedMarketing() {
    try {
        if (!marketingState.live) await marketingState.load();
        
        const settings = await getAppSettings();
        if (settings.maintenance_mode) return;

        const STRATEGIC_HOURS = [11, 14, 19, 22];
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        const currentHour = now.getHours();
        const todayKey = now.toISOString().split('T')[0];
        
        const lastSent = marketingState.get('lastSentHour'); 
        if (lastSent === `${todayKey}:${currentHour}`) return;

        if (!STRATEGIC_HOURS.includes(currentHour)) return;

        console.log(`[Marketing] Strategic hour detected (${currentHour}h). Preparing segmented campaigns...`);
        marketingState.set('lastSentHour', `${todayKey}:${currentHour}`);

        const templates = await getMarketingTemplates();
        const allUsers = await getAllUsersForBroadcast(null, 'user');
        
        const prospects = allUsers.filter(u => (u.order_count || 0) === 0);
        const clients = allUsers.filter(u => (u.order_count || 0) > 0);

        const startTime = now.toISOString();

        // 1. Send to PROSPECTS
        if (prospects.length > 0) {
            const template = templates.find(t => t.segment === 'prospect' && (currentHour < 15 ? t.type === 'catalog' : t.type === 'referral')) || templates.find(t => t.segment === 'prospect');
            if (template) {
                const payload = `${template.title}\n\n${template.message}|||MEDIA_URLS|||[]`;
                // On utilise un broadcast avec filtre (ici on simule en envoyant aux IDs spécifiques si besoin, 
                // mais pour rester performant on pourrait passer un filtre à broadcastMessage)
                // Pour l'instant on utilise le broadcast global mais on devrait idéalement filtrer
                // Note: broadcastMessage accepte 'users' (tous), on va adapter pour accepter une liste d'IDs
                await broadcastMessage(prospects.map(u => u.id), payload, {
                    start_at: startTime,
                    badge: "📣 PROSPECT-PROMO"
                });
            }
        }

        // 2. Send to CLIENTS
        if (clients.length > 0) {
            const template = templates.find(t => t.segment === 'client' && (currentHour < 15 ? t.type === 'catalog' : t.type === 'loyalty')) || templates.find(t => t.segment === 'client');
            if (template) {
                const payload = `${template.title}\n\n${template.message}|||MEDIA_URLS|||[]`;
                await broadcastMessage(clients.map(u => u.id), payload, {
                    start_at: startTime,
                    badge: "📣 CLIENT-UPDATE"
                });
            }
        }

        console.log(`[Marketing] Segmented campaigns launched (${prospects.length} prospects, ${clients.length} clients).`);
    } catch (e) {
        console.error('[Marketing-Error]', e.message);
    }
}

/**
 * Envoie une notification ciblée aux paniers abandonnés (Relance 1h après)
 */
async function triggerAbandonedCartRelance(user, cart) {
    const text = `🛒 <b>PANIER ABANDONNÉ</b>\n\nBonjour ${user.first_name || 'cher client'},\n\nVous avez laissé des articles dans votre panier. Ils sont réservés pour encore quelques minutes seulement !\n\n👇 Finaliser ma commande :`;
    
    // On utilise sendMessageToUser pour une notification directe
    const { sendMessageToUser } = require('./notifications');
    await sendMessageToUser(user.id, text, {
        buttons: [
            { id: 'view_cart', title: '🛒 VOIR MON PANIER' },
            { id: 'main_menu', title: '🏠 MENU PRINCIPAL' }
        ]
    });
}

module.exports = { runAutomatedMarketing, triggerAbandonedCartRelance };
