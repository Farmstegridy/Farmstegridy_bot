require('dotenv').config();
const { uploadMediaBuffer } = require('../services/database');

async function runTest() {
    if (!process.env.CLOUDINARY_URL) {
        console.error("❌ CLOUDINARY_URL n'est pas définie dans votre fichier .env.");
        console.log("Veuillez rajouter : CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name>");
        process.exit(1);
    }

    console.log("🚀 Lancement du test d'upload vers Cloudinary...");
    const fakeBuffer = Buffer.from("test image content " + Date.now());
    const resultUrl = await uploadMediaBuffer(fakeBuffer, `test_image_${Date.now()}.png`, "image/png");

    if (resultUrl) {
        console.log("✅ Test réussi ! URL de l'image :");
        console.log(resultUrl);
    } else {
        console.error("❌ Échec de l'upload. Veuillez vérifier les logs et vos clés de configuration.");
    }
    process.exit(0);
}

runTest();
