const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkStorage() {
    const bucketName = 'bot_media';
    console.log(`🔍 Checking bucket: ${bucketName}...`);
    
    // Test list buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error('❌ Error listing buckets:', listError.message);
        return;
    }
    
    const exists = buckets.find(b => b.name === bucketName);
    if (!exists) {
        console.log(`🏗 Creating bucket: ${bucketName}...`);
        const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['image/png', 'image/jpeg', 'video/mp4', 'image/webp']
        });
        
        if (createError) {
            console.error('❌ Error creating bucket:', createError.message);
        } else {
            console.log('✅ Bucket created successfully.');
        }
    } else {
        console.log('✅ Bucket already exists.');
    }
}

checkStorage();
