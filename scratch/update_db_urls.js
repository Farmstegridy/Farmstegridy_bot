const { supabase } = require('../config/supabase');

const OLD_PART = '/bot_media/';
const NEW_PART = '/la%20fabrik%20paris%20bot/';

async function updateDB() {
    console.log('--- Mise à jour des URLs dans la base de données ---');

    // 1. Produits
    console.log('Traitement de "bot_products"...');
    const { data: products } = await supabase.from('bot_products').select('id, image_url');
    for (const p of (products || [])) {
        if (p.image_url && p.image_url.includes(OLD_PART)) {
            const newUrl = p.image_url.split(OLD_PART).join(NEW_PART);
            await supabase.from('bot_products').update({ image_url: newUrl }).eq('id', p.id);
            console.log(`Produit ${p.id} mis à jour.`);
        }
    }

    // 2. Broadcasts
    console.log('Traitement de "bot_broadcasts"...');
    const { data: bc } = await supabase.from('bot_broadcasts').select('id, message');
    for (const b of (bc || [])) {
        if (b.message && b.message.includes(OLD_PART)) {
            const newMsg = b.message.split(OLD_PART).join(NEW_PART);
            await supabase.from('bot_broadcasts').update({ message: newMsg }).eq('id', b.id);
            console.log(`Broadcast ${b.id} mis à jour.`);
        }
    }

    // 3. Avis
    console.log('Traitement de "bot_reviews"...');
    const { data: rv } = await supabase.from('bot_reviews').select('id, image_url');
    for (const r of (rv || [])) {
        if (r.image_url && r.image_url.includes(OLD_PART)) {
            const newUrl = r.image_url.split(OLD_PART).join(NEW_PART);
            await supabase.from('bot_reviews').update({ image_url: newUrl }).eq('id', r.id);
            console.log(`Review ${r.id} mis à jour.`);
        }
    }

    console.log('--- Terminé ---');
}

updateDB();
