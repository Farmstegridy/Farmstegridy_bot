require('dotenv').config();
const server = require('./server');
const Dispatcher = require('./services/dispatcher');
const { database, getAppSettings } = require('./services/database');
const fs = require('fs');
const path = require('path');

// Détection d'environnement strict
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;

async function bootstrap() {
    try {
        // Chargement dynamique de .env.railway si présent (en priorité)
        if (IS_RAILWAY && fs.existsSync('.env.railway')) {
            console.log("[System] Loading environment from: .env.railway");
            const envContent = fs.readFileSync('.env.railway', 'utf-8');
            const envConfig = require('dotenv').parse(envContent);
            for (const k in envConfig) {
                process.env[k] = envConfig[k];
            }
        } else {
            console.log("[System] Loading environment from: .env");
        }

        // Logique de Port : 8080 par défaut pour Railway
        const portToUse = process.env.PORT || 8080;
        
        console.log(`[System] Final PORT determined: ${portToUse}`);
        console.log('🚀 DÉMARRAGE VERSION RAILWAY STABLE FARMSTEGRIDY BOT...');
        
        // 1. Initialisation de la BDD
        if (database && database.init) {
            await database.init();
        }

        // 2. Initialisation du Dispatcher (Service central)
        console.log('📦 Initialisation du Dispatcher...');
        const dispatcher = new Dispatcher();
        await dispatcher.init();
        
        // --- CHARGEMENT DES HANDLERS ---
        const { setupStartHandler } = require('./handlers/start');
        const { setupAdminHandlers } = require('./handlers/admin');
        const { setupOrderSystem } = require('./handlers/order_system');
        const { setupSupplierMarketplaceHandlers } = require('./handlers/supplier_marketplace');

        if (typeof setupStartHandler === 'function') setupStartHandler(dispatcher);
        if (typeof setupAdminHandlers === 'function') setupAdminHandlers(dispatcher);
        if (typeof setupOrderSystem === 'function') setupOrderSystem(dispatcher);
        if (typeof setupSupplierMarketplaceHandlers === 'function') setupSupplierMarketplaceHandlers(dispatcher);
        
        console.log(`[Dispatcher] Dispatcher initialisé avec ses handlers.`);

        // 3. Initialisation du Serveur Web (Dashboard)
        console.log(`[System] Initializing server on port: ${portToUse}`);
        const app = server.createServer(portToUse);
        
        // --- IMPORTANT: Enregistrement du bot dans le serveur pour les notifs admin ---
        const { TelegramChannel } = require('./channels/TelegramChannel');
        let tgToken = process.env.BOT_TOKEN;
        
        try {
            const settings = await getAppSettings();
            if (settings && settings.telegram_token) {
                tgToken = settings.telegram_token;
                console.log('[System] Using Telegram token from Database configuration');
            }
        } catch (e) {
            console.warn('[System] Failed to load telegram token from Database, using env fallback:', e.message);
        }
        
        let telegramChannel = null;
        if (tgToken) {
            telegramChannel = new TelegramChannel(tgToken);
            dispatcher.registerChannel('telegram', telegramChannel);
            server.setBotInstance(telegramChannel.bot); // Permet au dashboard d'envoyer des messages
        }

        const staticUrl = process.env.RAILWAY_STATIC_URL || 'localhost';
        console.log(`🔗 TEST HEALTH : https://${staticUrl}/_health`);

        // 4. Initialisation des canaux de communication
        console.log('📦 Initialisation des canaux...');
        
        // Initialisation des canaux enregistrés dans le dispatcher
        const channels = await dispatcher.initChannels();
        
        const replicaIndex = process.env.RAILWAY_REPLICA_INDEX || 0;
        console.log(`[System] Replica ${replicaIndex}: Starting Telegram channel...`);
        
        // Lancement du canal telegram
        if (telegramChannel && replicaIndex == 0) {
            telegramChannel.start().then(() => {
                // Sync bot descriptions on startup
                getAppSettings().then(settings => {
                    if (!telegramChannel.bot) return;
                    if (settings.bot_description) telegramChannel.bot.telegram.setMyDescription(settings.bot_description).catch(() => { });
                    if (settings.bot_short_description) telegramChannel.bot.telegram.setMyShortDescription(settings.bot_short_description).catch(() => { });
                    
                    // Set default commands
                    telegramChannel.bot.telegram.setMyCommands([
                        { command: 'start', description: '🏠 Lancer le bot / Accueil' },
                        { command: 'menu', description: '🛒 Voir le catalogue' },
                        { command: 'orders', description: '📦 Mes commandes' },
                        { command: 'help', description: '❓ Aide et support' }
                    ]).catch(() => { });
                }).catch(() => { });
            }).catch(err => {
                console.error('❌ Error launching Telegram:', err.message);
            });
        } else if (telegramChannel) {
            console.log(`[System] Replica ${replicaIndex}: Bot instance idle (Replica 0 handles bot)`);
        }

        if (replicaIndex == 0) {
            try {
                const { startBroadcastWorker } = require('./services/broadcast');
                if (telegramChannel) {
                    startBroadcastWorker(telegramChannel).catch(err => {
                        console.error('[System] Failed to start broadcast worker:', err.message);
                    });
                    console.log('👷 Broadcast Worker active (Replica 0)');
                }
            } catch (e) {
                console.warn('[System] Broadcast worker failed to start:', e.message);
            }

            // Start expired reservations cleanup interval
            try {
                const { cleanupExpiredReservations } = require('./services/inventory_manager');
                setInterval(async () => {
                    try {
                        await cleanupExpiredReservations();
                    } catch (err) {
                        console.error('[System] Error in cleanupExpiredReservations:', err.message);
                    }
                }, 60000); // run every 1 minute
                console.log('⏰ Reservation Cleanup Worker active (every 1m, Replica 0)');
            } catch (e) {
                console.warn('[System] Reservation Cleanup Worker failed to start:', e.message);
            }
        }

    } catch (error) {
        console.error('❌ ERREUR FATALE AU DÉMARRAGE:', error);
        process.exit(1);
    }
}

bootstrap();

// Shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    process.exit(0);
});

module.exports = {};
// Version 1.0.1 Stable
