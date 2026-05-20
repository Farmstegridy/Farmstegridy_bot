const fs = require('fs');
const path = require('path');

const laFrappePath = '/Users/dikenson/Desktop/Projet BOT (client deja terminée) /La frappe IDF';
if (fs.existsSync(laFrappePath)) {
    const files = fs.readdirSync(laFrappePath);
    console.log("La Frappe files:", files);
    
    // Check if there's any file named update_db_token.js or seed or similar
    const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.sql'));
    console.log("JS and SQL files:", jsFiles);
    
    // Read update_db_token.js if exists
    const updateDbPath = path.join(laFrappePath, 'update_db_token.js');
    if (fs.existsSync(updateDbPath)) {
        console.log("update_db_token.js contents:");
        console.log(fs.readFileSync(updateDbPath, 'utf8'));
    }
}
