const { Jimp } = require('jimp');

async function makeCircle() {
    try {
        const image = await Jimp.read('/Users/dikenson/.gemini/antigravity/brain/5da4db53-c2fb-40d5-8699-4a90950387d3/media__1782594432852.jpg');
        const size = Math.min(image.bitmap.width, image.bitmap.height);
        
        // Crop to square
        image.crop({
            x: (image.bitmap.width - size) / 2,
            y: (image.bitmap.height - size) / 2,
            w: size,
            h: size
        });
        
        // Assuming circle() works in Jimp 1.6
        image.circle();
        await image.write('web/public/logo.png');
        console.log('Logo successfully cropped to circle and saved to web/public/logo.png');
    } catch (e) {
        console.error('Error cropping image:', e);
    }
}

makeCircle();
