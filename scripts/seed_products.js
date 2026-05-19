const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY");
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
        unit_value: "1"
    },
    {
        name: "Double Zero Resin",
        description: "Résine de CBD pressée à froid. Texture crémeuse et goût intense. Taux de CBD : 22%.",
        price: 15.00,
        image_url: JSON.stringify([{ url: "https://farmstegridybot-production.up.railway.app/public/img/double_zero.png", type: "photo" }]),
        category: "Resines",
        is_active: true,
        unit: "g",
        unit_value: "1"
    },
    {
        name: "Full Spectrum Oil 10%",
        description: "Huile de CBD à spectre complet pour un effet d'entourage optimal. 1500mg de CBD par flacon.",
        price: 45.00,
        image_url: JSON.stringify([{ url: "https://farmstegridybot-production.up.railway.app/public/img/cbd_oil.png", type: "photo" }]),
        category: "Huiles",
        is_active: true,
        unit: "flacon",
        unit_value: "1"
    }
];

async function seed() {
    console.log("Seeding products...");
    for (const prod of products) {
        const payload = { ...prod, id: Date.now().toString() + Math.random().toString(36).substring(7) };
        const { data, error } = await supabase.from('bot_products').insert(payload).select();
        if (error) {
            console.error(`Error inserting ${prod.name}:`, error.message);
        } else {
            console.log(`Successfully inserted: ${prod.name}`);
        }
    }
    console.log("Done!");
}

seed();
