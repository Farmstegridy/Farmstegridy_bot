require('dotenv').config();
const { rankProducts, generateDynamicText } = require('./services/recommendation_engine');
const { getTemporalAffinity } = require('./services/recommendation_engine'); // wait, getTemporalAffinity is not exported. Let's just test rankProducts and generateDynamicText directly first.

async function runTests() {
    console.log("=== TESTS DU RANKER TWITTER-STYLE ===");
    
    // Mock Data
    const mockOrdersUser1 = [
        { cart: '[{"name": "Lemon Haze", "qty": 1}]', created_at: new Date('2026-05-20T18:00:00Z').toISOString() },
        { cart: '[{"name": "Amnesia", "qty": 1}]', created_at: new Date('2026-05-13T18:00:00Z').toISOString() }
    ];

    const mockViewsUser1 = [
        { productName: "Lemon Haze", viewed_at: Date.now() - 10000 }, // Il y a 10 secondes (très récent)
        { productName: "Gelato", viewed_at: Date.now() - 48*3600*1000 } // Il y a 48h (ancien)
    ];

    console.log("\n--- Profil User 1 (VIP) ---");
    const rankedUser1 = rankProducts(mockOrdersUser1, mockViewsUser1);
    console.log("Résultat du ranking :", rankedUser1);
    
    if (rankedUser1.length > 0) {
        console.log("Texte généré :", generateDynamicText("Jean", rankedUser1[0].product, true));
    }


    const mockOrdersUser2 = []; // Prospect (aucune commande)
    const mockViewsUser2 = [
        { productName: "Cali Weed", viewed_at: Date.now() - 20000 }
    ];

    console.log("\n--- Profil User 2 (Prospect) ---");
    const rankedUser2 = rankProducts(mockOrdersUser2, mockViewsUser2);
    console.log("Résultat du ranking :", rankedUser2);
    if (rankedUser2.length > 0) {
        console.log("Texte généré :", generateDynamicText("Marc", rankedUser2[0].product, false));
    }
}

runTests().then(() => {
    console.log("\n✅ Tests terminés avec succès.");
    process.exit(0);
});
