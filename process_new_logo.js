const Jimp = require('jimp');

async function processLogo() {
    try {
        const image = await Jimp.read('/Users/dikenson/.gemini/antigravity/brain/5da4db53-c2fb-40d5-8699-4a90950387d3/media__1782594432852.jpg');
        
        // Ensure square aspect ratio
        const size = Math.min(image.bitmap.width, image.bitmap.height);
        
        // Crop to square from center
        const x = (image.bitmap.width - size) / 2;
        const y = (image.bitmap.height - size) / 2;
        image.crop(x, y, size, size);
        
        // Resize to a standard size (e.g. 512x512)
        image.resize(512, 512);
        
        // Apply circular mask
        const mask = await new Jimp(512, 512, 0x00000000);
        mask.scan(0, 0, 512, 512, function(x, y, idx) {
            const distance = Math.sqrt(Math.pow(x - 256, 2) + Math.pow(y - 256, 2));
            if (distance <= 256) {
                this.bitmap.data[idx + 3] = 255; // Alpha channel
            }
        });
        
        image.mask(mask, 0, 0);
        
        await image.writeAsync('web/public/logo.png');
        console.log('New logo processed and saved successfully.');
    } catch (err) {
        console.error('Error processing logo:', err);
    }
}
processLogo();
