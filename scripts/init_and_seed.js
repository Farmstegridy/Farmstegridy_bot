const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Erreur : SUPABASE_URL ou SUPABASE_KEY manquante dans le fichier .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const products = [
    {
        name: "Premium OG Kush",
        description: "Fleurs de CBD Indoor de qualité supérieure. Arômes terreux et citronnés. Taux de CBD : 18%.",
        price: 12.00,
        image_url: JSON.stringify([{ url: "https://farmstegridybot-production.up.railway.app/public/img/og_kush.png", type: "photo" }]),
        category: "Fleurs",
        is_active: true,
        unit: "g",
        unit_value: "1",
        stock: 10
    },
    {
        name: "Double Zero Resin",
        description: "Résine de CBD pressée à froid. Texture crémeuse et goût intense. Taux de CBD : 22%.",
        price: 15.00,
        image_url: JSON.stringify([{ url: "https://farmstegridybot-production.up.railway.app/public/img/double_zero.png", type: "photo" }]),
        category: "Resines",
        is_active: true,
        unit: "g",
        unit_value: "1",
        stock: 10
    },
    {
        name: "Full Spectrum Oil 10%",
        description: "Huile de CBD à spectre complet pour un effet d'entourage optimal. 1500mg de CBD par flacon.",
        price: 45.00,
        image_url: JSON.stringify([{ url: "https://farmstegridybot-production.up.railway.app/public/img/cbd_oil.png", type: "photo" }]),
        category: "Huiles",
        is_active: true,
        unit: "flacon",
        unit_value: "1",
        stock: 10
    }
];

async function run() {
    console.log("🚀 Initialisation de bot_settings...");
    
    // On met à jour le singleton 'default' dans bot_settings et settings
    const settingsPayload = {
        telegram_token: '8549299880:AAHO1Nj-xLj3SELZ4h9Uze1_NDDwaB2oVA4',
        bot_name: 'Farmstegridy_bot',
        dashboard_title: 'Farmstegridy Bot',
        admin_telegram_id: '8945099501',
        auto_approve_new: false,
        private_mode: false,
        force_subscribe: false
    };

    const { error: settingsError } = await supabase.from('bot_settings').upsert({
        id: 'default',
        ...settingsPayload
    });

    if (settingsError) {
        console.error("❌ Erreur lors de l'initialisation de bot_settings :", settingsError.message);
    } else {
        console.log("✅ Table bot_settings initialisée avec succès !");
    }

    const { error: settingsLegacyError } = await supabase.from('settings').upsert({
        id: 'default',
        ...settingsPayload
    });

    if (settingsLegacyError) {
        console.warn("⚠️ Attention : La table settings (legacy) n'a pas pu être mise à jour (ignorez si non configurée).");
    } else {
        console.log("✅ Table settings (legacy) initialisée avec succès !");
    }

    console.log("\n📦 Insertion des produits par défaut...");
    for (const prod of products) {
        const payload = { ...prod, id: Date.now().toString() + Math.random().toString(36).substring(7) };
        const { data, error } = await supabase.from('bot_products').insert(payload).select();
        if (error) {
            console.error(`❌ Erreur lors de l'insertion du produit ${prod.name} :`, error.message);
        } else {
            console.log(`✅ Produit inséré avec succès : ${prod.name}`);
        }
    }

    console.log("\n🎉 Opération terminée avec succès !");
}

run();
