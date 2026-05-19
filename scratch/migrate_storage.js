const { supabase } = require('../config/supabase');
const fs = require('fs');

async function migrate() {
    console.log('--- Démarrage de la migration du stockage ---');
    const SOURCE_BUCKET = 'bot_media';
    const TARGET_BUCKET = 'la fabrik paris bot';

    try {
        // 1. Lister les fichiers dans le bucket source
        console.log(`Linsting des fichiers dans "${SOURCE_BUCKET}"...`);
        const { data: files, error: listError } = await supabase.storage
            .from(SOURCE_BUCKET)
            .list('', { limit: 1000 });

        if (listError) throw listError;
        if (!files || files.length === 0) {
            console.log('Aucun fichier à migrer.');
            return;
        }

        console.log(`${files.length} fichiers trouvés.`);

        for (const file of files) {
            if (file.name === '.emptyFolderPlaceholder') continue;

            console.log(`Migration de ${file.name}...`);
            
            // 2. Télécharger le fichier
            const { data: blob, error: downloadError } = await supabase.storage
                .from(SOURCE_BUCKET)
                .download(file.name);

            if (downloadError) {
                console.error(`❌ Erreur téléchargement ${file.name}:`, downloadError.message);
                continue;
            }

            // 3. Convertir Blob en Buffer (requis par node-fetch/supabase-js dans Node)
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 4. Uploader vers le nouveau bucket
            const { error: uploadError } = await supabase.storage
                .from(TARGET_BUCKET)
                .upload(file.name, buffer, {
                    contentType: blob.type,
                    upsert: true
                });

            if (uploadError) {
                console.error(`❌ Erreur upload ${file.name}:`, uploadError.message);
            } else {
                console.log(`✅ ${file.name} migré avec succès.`);
            }
        }

        console.log('--- Migration terminée ---');
    } catch (err) {
        console.error('❌ Erreur critique pendant la migration:', err.message);
    }
}

migrate();
