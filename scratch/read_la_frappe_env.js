const fs = require('fs');
const path = require('path');

const desktop = '/Users/dikenson/Desktop';
const dirs = fs.readdirSync(desktop);
console.log("Desktop dirs:", dirs);

const botProjDir = dirs.find(d => d.includes('Projet BOT'));
if (botProjDir) {
    const fullPath = path.join(desktop, botProjDir);
    console.log("Found Bot Project Dir:", fullPath);
    const subdirs = fs.readdirSync(fullPath);
    console.log("Subdirs inside:", subdirs);
    
    // Find La Frappe directory
    const laFrappeDir = subdirs.find(s => s.toLowerCase().includes('frappe'));
    if (laFrappeDir) {
        const laFrappePath = path.join(fullPath, laFrappeDir);
        console.log("Found La Frappe Path:", laFrappePath);
        
        // Read .env if it exists
        const envPath = path.join(laFrappePath, '.env');
        if (fs.existsSync(envPath)) {
            console.log(".env contents of La Frappe:");
            console.log(fs.readFileSync(envPath, 'utf8'));
        } else {
            console.log(".env not found in", laFrappePath);
        }
    }
}
