/**
 * X-Engine : Advanced Recommendation & Notification System (Inspired by Twitter Algorithm)
 * Specialized for SaaS (Bot Selling) using Catalog as Demonstration.
 */

// 1. The Tracking Graph (Heuristic Analysis)
function analyzeUserTimePattern(views) {
    if (!views || views.length === 0) return { bestHour: 18, bestDay: null, confidence: 0 };
    
    const hourCounts = {};
    const dayCounts = {};
    
    views.forEach(v => {
        if (!v.timestamp) return;
        const d = new Date(v.timestamp);
        const hour = d.getHours();
        const day = d.getDay(); // 0 = Sunday, 1 = Monday
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    let bestHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);
    let bestDay = Object.keys(dayCounts).reduce((a, b) => dayCounts[a] > dayCounts[b] ? a : b);

    // Calculate confidence (0 to 1) based on frequency
    const maxHourFreq = hourCounts[bestHour];
    const confidence = Math.min(1, maxHourFreq / Math.max(1, views.length));

    return { 
        bestHour: parseInt(bestHour), 
        bestDay: parseInt(bestDay), 
        confidence 
    };
}

// 2. Heavy Ranker (SaaS Argument Scoring)
function heavyRanker(views, userIsNew) {
    // Categories to SaaS Sales Pitch mapping
    const saasArguments = {
        'default': { pitch: 'créer une boutique automatique', score: 1 },
        'vetements': { pitch: 'vendre ta collection de vêtements sur Telegram', score: 0 },
        'chaussures': { pitch: 'écouler ton stock de sneakers', score: 0 },
        'fastfood': { pitch: 'prendre les commandes de ton restaurant en automatique', score: 0 },
        'electronique': { pitch: 'vendre tes gadgets tech', score: 0 },
        'digital': { pitch: 'distribuer tes fichiers numériques ou formations', score: 0 }
    };

    if (!views || views.length === 0) {
        return userIsNew ? { argument: 'découvrir comment automatiser tes ventes', score: 10 } : { argument: saasArguments['default'].pitch, score: 1 };
    }

    views.forEach(v => {
        const cat = v.category ? v.category.toLowerCase() : 'default';
        // Basic mapping for demo products
        let mappedKey = 'default';
        if (cat.includes('vetement') || cat.includes('t-shirt') || cat.includes('pull')) mappedKey = 'vetements';
        else if (cat.includes('chaussure') || cat.includes('sneaker')) mappedKey = 'chaussures';
        else if (cat.includes('food') || cat.includes('burger') || cat.includes('pizza')) mappedKey = 'fastfood';
        else if (cat.includes('tech') || cat.includes('ordi') || cat.includes('phone')) mappedKey = 'electronique';
        else if (cat.includes('digital') || cat.includes('pdf')) mappedKey = 'digital';
        
        if (saasArguments[mappedKey]) {
            saasArguments[mappedKey].score += v.weight || 1; // Views add 1, Cart adds 5
        }
    });

    let bestKey = 'default';
    let maxScore = 0;
    for (const key in saasArguments) {
        if (saasArguments[key].score > maxScore) {
            maxScore = saasArguments[key].score;
            bestKey = key;
        }
    }

    return { argument: saasArguments[bestKey].pitch, score: maxScore, category: bestKey };
}

// 3. Dynamic Templating (Never repeat)
function generateDynamicMessage(user, rankResult, timePattern) {
    const greetings = ['👋 Salut', 'Hello', 'Salut', '👋 Bonjour'];
    const hooks = [
        "J'ai remarqué que tu regardais nos démos tout à l'heure.",
        "Toujours intéressé par l'automatisation ?",
        "Imagine tes clients utiliser ce système.",
        "Le commerce sur Telegram explose en ce moment."
    ];
    
    let timeHint = "";
    if (timePattern.confidence > 0.4 && timePattern.bestDay !== null) {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        timeHint = `Surtout le ${days[timePattern.bestDay]} vers ${timePattern.bestHour}h ! `;
    }

    const urgency = [
        "Tu veux qu'on configure ton bot aujourd'hui ?",
        "On peut lancer ça en moins de 24h.",
        "Passe commande maintenant pour réserver ta place.",
        "Clique sur la Mini-App pour choisir ton forfait !"
    ];

    // Randomize
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    const h = hooks[Math.floor(Math.random() * hooks.length)];
    const u = urgency[Math.floor(Math.random() * urgency.length)];
    const name = user.first_name || '';

    return `${g} ${name},\n\n${h} Imagine pouvoir ${rankResult.argument} directement depuis l'application. ${timeHint}\n\n🚀 ${u}`;
}

module.exports = {
    analyzeUserTimePattern,
    heavyRanker,
    generateDynamicMessage
};
