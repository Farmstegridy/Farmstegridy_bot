import re
import os

file_path = '/Users/dikenson/Desktop/Farmstegridy_bot/services/database.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

bot_products_js = """    const officialBotProducts = [
        {
            id: 'pack_standard', name: '🥉 Pack Standard (Telegram)', category: 'PACKS BOT', price: 450,
            description: 'Bot Telegram Professionnel complet avec catalogue multimédia, gestion de panier fluide et interface d\\'administration intégrée.',
            image_url: 'https://placehold.co/400x300/111/fff?text=Pack+Standard+Telegram', is_active: true, is_featured: true, priority: 1, promo: '-30€ par code parrain'
        },
        {
            id: 'pack_wa', name: '🥈 Pack WhatsApp Plus', category: 'PACKS BOT', price: 550,
            description: 'Bot WhatsApp Professionnel haute stabilité. Sessions persistantes, réponses instantanées et support technique VIP inclus pendant 1 an.',
            image_url: 'https://placehold.co/400x300/111/fff?text=Pack+WhatsApp+Plus', is_active: true, is_featured: true, priority: 2, promo: '-40€ par code promo'
        },
        {
            id: 'pack_premium', name: '🥇 Pack Premium (TG + WA Sync)', category: 'PACKS BOT', price: 650,
            description: 'L\\'offre de référence. Synchronisation multiplateforme en temps réel, alertes livreur automatisées et statistiques de croissance avancées.',
            image_url: 'https://placehold.co/400x300/111/fff?text=Pack+Premium+Sync', is_active: true, is_featured: true, priority: 3, promo: '-50€ de remise immédiate'
        },
        {
            id: 'pack_enterprise', name: '🚀 Pack Enterprise (Sur mesure)', category: 'PACKS BOT', price: 950,
            description: 'Solution sur mesure clé en main. Architecture dédiée haute performance, intégration API personnalisée et accompagnement stratégique dédié.',
            image_url: 'https://placehold.co/400x300/111/fff?text=Pack+Enterprise+VIP', is_active: true, is_featured: false, priority: 4, promo: '-50€ de remise immédiate'
        },
        {
            id: 'mod_payment', name: '💳 Paiement Stripe & Crypto Intégré', category: 'MODULES SUR MESURE', price: 150,
            description: 'Encaissement automatisé et sécurisé par carte bancaire via Stripe et portefeuilles cryptographiques (USDT/BTC/ETH).',
            image_url: 'https://placehold.co/400x300/222/00ff88?text=Module+Paiement', is_active: true, is_featured: false, priority: 5
        },
        {
            id: 'mod_livreur', name: '🚴 Système Console Livreur & Tracking', category: 'MODULES SUR MESURE', price: 200,
            description: 'Interface WebApp dédiée aux livreurs, suivi GPS en direct, calcul du temps estimé d\\'arrivée (ETA) et chat de coordination sécurisé.',
            image_url: 'https://placehold.co/400x300/222/ffaa00?text=Console+Livreur', is_active: true, is_featured: false, priority: 6
        },
        {
            id: 'mod_vip', name: '👑 Programme VIP & Cashback Fidélité', category: 'MODULES SUR MESURE', price: 120,
            description: 'Système de paliers clients évolutifs (Bronze/Silver/Gold), génération de liens de parrainage et attribution automatique de solde fidélité.',
            image_url: 'https://placehold.co/400x300/222/ff0050?text=Programme+VIP', is_active: true, is_featured: false, priority: 7
        }
    ];"""

new_get_products = """async function getProducts(onlyActive = false) {
    let query = supabase.from(COL_PRODUCTS).select('*');
    if (onlyActive) {
        query = query.eq('is_active', true);
    }
    const { data } = await query.order('created_at', { ascending: true });
    let prods = data || [];
""" + bot_products_js + """
    if (onlyActive) {
        prods = [...prods, ...officialBotProducts.filter(p => p.is_active)];
    } else {
        prods = [...prods, ...officialBotProducts];
    }
    return prods;
}"""

content = re.sub(
    r"async function getProducts\(onlyActive = false\) \{.*?(?=async function getProductsByCategory)",
    new_get_products + "\n\n",
    content,
    flags=re.DOTALL
)

new_get_product = """async function getProduct(id) {
""" + bot_products_js + """
    const botProd = officialBotProducts.find(p => p.id === id);
    if (botProd) return botProd;

    const { data } = await supabase.from(COL_PRODUCTS).select('*').eq('id', id).maybeSingle();
    return data;
}"""

content = re.sub(
    r"async function getProduct\(id\) \{.*?(?=async function saveProduct)",
    new_get_product + "\n\n",
    content,
    flags=re.DOTALL
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("database.js patched successfully.")
