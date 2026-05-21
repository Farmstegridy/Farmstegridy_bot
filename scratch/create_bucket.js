// Script pour créer le bucket 'bot_media' dans Supabase Storage
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://todfwctsutqmlhwctgnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZGZ3Y3RzdXRxbWxod2N0Z25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIxMTQ3OCwiZXhwIjoyMDk0Nzg3NDc4fQ.hb_b_N7c89ayBwK9bEIORN6ORQuzRkz7NNepsYkLxOs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // 1. List existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    console.log('Existing buckets:', buckets?.map(b => b.name) || [], listError?.message || '');

    // 2. Create bot_media bucket (public, 50MB max)
    const { data, error } = await supabase.storage.createBucket('bot_media', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska']
    });

    if (error) {
        console.error('Create bucket error:', error.message);
        if (error.message.includes('already exists')) {
            console.log('Bucket already exists, updating...');
            const { error: updateError } = await supabase.storage.updateBucket('bot_media', {
                public: true,
                fileSizeLimit: 52428800,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska']
            });
            if (updateError) console.error('Update bucket error:', updateError.message);
            else console.log('Bucket updated successfully!');
        }
    } else {
        console.log('Bucket created successfully!', data);
    }

    // 3. Verify
    const { data: buckets2 } = await supabase.storage.listBuckets();
    console.log('Final buckets:', buckets2?.map(b => ({ name: b.name, public: b.public, fileSizeLimit: b.file_size_limit })));
}

main().catch(console.error);
