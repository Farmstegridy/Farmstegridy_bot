const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function test() {
    fs.writeFileSync('test_image.jpg', 'fake image data');
    const form = new FormData();
    form.append('file', fs.createReadStream('test_image.jpg'));
    
    // Bypassing auth is hard if we don't have a token. 
    // Is there a way to call the endpoint without auth?
}
