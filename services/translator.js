const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Simple persistent cache
const cachePath = path.join(__dirname, '..', '.translation_cache.json');
let cache = new Map();

try {
    if (fs.existsSync(cachePath)) {
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
            cache.set(k, v);
        }
    }
} catch (e) {
    console.error('[Translator] Failed to load cache', e.message);
}

function saveCache() {
    try {
        const obj = Object.fromEntries(cache);
        fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

// Save cache every 5 minutes if there are changes
setInterval(saveCache, 5 * 60 * 1000);

let inFlight = new Map();

async function translate(text, targetLang, sourceLang = 'fr') {
    if (!text || typeof text !== 'string') return text;
    if (targetLang === sourceLang || targetLang === 'fr') return text; 

    const cacheKey = `${sourceLang}_${targetLang}_${text}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    if (inFlight.has(cacheKey)) {
        return inFlight.get(cacheKey);
    }

    const reqPromise = (async () => {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
            const res = await axios.get(url, { timeout: 3000 });
            
            if (res.data && res.data[0]) {
                let translated = res.data[0].map(x => x[0]).join('');
                translated = translated.replace(/ % s /g, ' %s ').replace(/ { /g, ' {').replace(/ } /g, '} ');
                cache.set(cacheKey, translated);
                saveCache();
                return translated;
            }
        } catch (e) {
            console.error(`[Translator] Error translating "${text.substring(0, 20)}..." to ${targetLang}:`, e.message);
        }
        return text;
    })();
    
    inFlight.set(cacheKey, reqPromise);
    const result = await reqPromise;
    inFlight.delete(cacheKey);
    return result;
}

async function translateProduct(product, targetLang) {
    if (targetLang === 'fr') return product;
    
    // Create a copy
    const p = { ...product };
    if (p.category) p.raw_category = p.category; // Keep original for logic filtering
    if (p.name) p.name = await translate(p.name, targetLang);
    if (p.description) p.description = await translate(p.description, targetLang);
    if (p.category) p.category = await translate(p.category, targetLang);
    
    // Translate variants if any
    if (p.options) {
        let isString = false;
        let opts = p.options;
        if (typeof p.options === 'string') {
            try {
                opts = JSON.parse(p.options);
                isString = true;
            } catch(e) { opts = []; }
        }
        
        if (Array.isArray(opts)) {
            for (let i = 0; i < opts.length; i++) {
                if (opts[i].name) opts[i].name = await translate(opts[i].name, targetLang);
            }
            p.options = isString ? JSON.stringify(opts) : opts;
        }
    }
    return p;
}

async function translateProducts(products, targetLang) {
    if (targetLang === 'fr') return products;
    return await Promise.all(products.map(p => translateProduct(p, targetLang)));
}

module.exports = {
    translate,
    translateProduct,
    translateProducts
};
