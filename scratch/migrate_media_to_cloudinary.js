require('dotenv').config();
const { supabase } = require('../config/supabase');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const path = require('path');

if (!process.env.CLOUDINARY_URL) {
    console.error("❌ CLOUDINARY_URL n'est pas définie dans votre fichier .env.");
    console.log("Veuillez rajouter : CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name> dans votre .env");
    process.exit(1);
}

// Mappings mime-types simples
function getMimeType(url, responseHeaders) {
    const contentType = responseHeaders['content-type'];
    if (contentType) return contentType;

    const ext = path.extname(url.split('?')[0]).toLowerCase();
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.mov') return 'video/mp4'; // Normalisé
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
}

// Fonction d'upload vers Cloudinary
async function uploadToCloudinary(buffer, filename, mimetype) {
    const isVideo = mimetype.startsWith('video/') || filename.toLowerCase().endsWith('.mov') || filename.toLowerCase().endsWith('.mp4');
    const resourceType = isVideo ? 'video' : 'image';
    
    let publicId = filename;
    const lastDot = filename.lastIndexOf('.');
    if (lastDot !== -1) {
        publicId = filename.substring(0, lastDot);
    }
    publicId = publicId.replace(/[^a-zA-Z0-9_\-]/g, '_');

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: resourceType,
                public_id: publicId,
                overwrite: true
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        uploadStream.end(buffer);
    });
}

// Traiter et migrer une URL unique
async function processMediaUrl(url) {
    if (!url || typeof url !== 'string' || !url.includes('supabase.co/storage')) {
        return url; // Déjà externe ou vide
    }

    try {
        console.log(`📥 Téléchargement de : ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const buffer = Buffer.from(response.data);
        
        // Extraire le nom de fichier propre
        const parts = url.split('/');
        let filename = parts[parts.length - 1].split('?')[0];
        if (!filename) filename = `file_${Date.now()}`;
        
        const mimetype = getMimeType(url, response.headers);
        console.log(`📤 Upload vers Cloudinary: ${filename} (type: ${mimetype})`);
        
        const newUrl = await uploadToCloudinary(buffer, filename, mimetype);
        console.log(`✅ Réussi : ${newUrl}`);
        return newUrl;
    } catch (err) {
        console.error(`❌ Échec de la migration pour ${url} : ${err.message}`);
        return url; // Conserver l'URL d'origine en cas d'erreur
    }
}

// Migrer les chaînes ou les objets complexes (ex: tableaux JSON)
async function migrateValue(value) {
    if (!value) return value;
    
    // Si c'est une chaîne de caractères simple
    if (typeof value === 'string' && !value.trim().startsWith('[') && !value.trim().startsWith('{')) {
        return await processMediaUrl(value);
    }

    // Tenter de parser comme du JSON (catalogues avec images multiples)
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            const migratedArray = [];
            for (const item of parsed) {
                if (typeof item === 'string') {
                    migratedArray.push(await processMediaUrl(item));
                } else if (item && typeof item === 'object' && item.url) {
                    const newUrl = await processMediaUrl(item.url);
                    migratedArray.push({ ...item, url: newUrl });
                } else {
                    migratedArray.push(item);
                }
            }
            return JSON.stringify(migratedArray);
        } else if (parsed && typeof parsed === 'object') {
            if (parsed.url) {
                parsed.url = await processMediaUrl(parsed.url);
            }
            return JSON.stringify(parsed);
        }
    } catch (e) {
        // Ce n'était pas du JSON, on migre comme chaîne brute
        return await processMediaUrl(value);
    }

    return value;
}

async function startMigration() {
    console.log("🏁 Début de la migration des médias de Supabase vers Cloudinary...");

    // 1. MIGRATION DES PRODUITS (bot_products)
    console.log("\n--- Étape 1 : Migration des produits (bot_products) ---");
    const { data: products, error: prodErr } = await supabase.from('bot_products').select('*');
    if (prodErr) {
        console.error("❌ Impossible de lire la table bot_products :", prodErr.message);
        if (prodErr.message.includes("restricted")) {
            console.error("⚠️ Votre projet Supabase est encore restreint. Vous devez d'abord l'activer en passant au plan Pro.");
        }
        process.exit(1);
    }

    console.log(`Trouvé ${products.length} produits.`);
    for (const prod of products) {
        if (prod.image_url && prod.image_url.includes('supabase.co/storage')) {
            console.log(`\nProduit #${prod.id} : ${prod.name}`);
            const newImgUrl = await migrateValue(prod.image_url);
            if (newImgUrl !== prod.image_url) {
                const { error: updErr } = await supabase
                    .from('bot_products')
                    .update({ image_url: newImgUrl })
                    .eq('id', prod.id);
                if (updErr) console.error(`❌ Échec de la mise à jour en base pour le produit #${prod.id} : ${updErr.message}`);
                else console.log(`💾 Base de données mise à jour pour le produit #${prod.id}`);
            }
        }
    }

    // 2. MIGRATION DES PARAMÈTRES (bot_settings)
    console.log("\n--- Étape 2 : Migration des paramètres globaux (bot_settings) ---");
    const { data: settings, error: settErr } = await supabase.from('bot_settings').select('*').eq('id', 'default').maybeSingle();
    if (settErr) {
        console.error("❌ Impossible de lire la table bot_settings :", settErr.message);
    } else if (settings) {
        const fieldsToMigrate = ['welcome_photo', 'mini_app_logo'];
        const updates = {};
        
        for (const field of fieldsToMigrate) {
            const currentVal = settings[field];
            if (currentVal && currentVal.includes('supabase.co/storage')) {
                console.log(`\nChamp de paramètre "${field}" détecté.`);
                const newVal = await processMediaUrl(currentVal);
                if (newVal !== currentVal) {
                    updates[field] = newVal;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            const { error: updErr } = await supabase
                .from('bot_settings')
                .update(updates)
                .eq('id', 'default');
            if (updErr) console.error(`❌ Échec de la mise à jour des paramètres : ${updErr.message}`);
            else console.log(`💾 Paramètres globaux mis à jour.`);
        } else {
            console.log("Aucun média Supabase trouvé dans les paramètres.");
        }
    }

    // 3. MIGRATION DES FOURNISSEURS (bot_suppliers)
    console.log("\n--- Étape 3 : Migration des logos de fournisseurs (bot_suppliers) ---");
    const { data: suppliers, error: supErr } = await supabase.from('bot_suppliers').select('*');
    if (supErr) {
        console.error("❌ Impossible de lire la table bot_suppliers :", supErr.message);
    } else if (suppliers) {
        console.log(`Trouvé ${suppliers.length} fournisseurs.`);
        for (const sup of suppliers) {
            if (sup.logo_url && sup.logo_url.includes('supabase.co/storage')) {
                console.log(`\nFournisseur #${sup.id} : ${sup.name}`);
                const newLogoUrl = await processMediaUrl(sup.logo_url);
                if (newLogoUrl !== sup.logo_url) {
                    const { error: updErr } = await supabase
                        .from('bot_suppliers')
                        .update({ logo_url: newLogoUrl })
                        .eq('id', sup.id);
                    if (updErr) console.error(`❌ Échec de la mise à jour en base pour le fournisseur #${sup.id} : ${updErr.message}`);
                    else console.log(`💾 Base de données mise à jour pour le fournisseur #${sup.id}`);
                }
            }
        }
    }

    console.log("\n🎉 Migration terminée !");
    process.exit(0);
}

startMigration();
