const fs = require('fs');
const path = require('path');
const { translations } = require('./services/i18n.js');

const jsFiles = [];
function findJsFiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git')) {
            findJsFiles(fullPath);
        } else if (fullPath.endsWith('.js')) {
            jsFiles.push(fullPath);
        }
    }
}
findJsFiles(__dirname);

const keysFound = new Set();
const regex = /t\([^,]+,\s*'([^']+)'/g;

for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = regex.exec(content)) !== null) {
        keysFound.add(match[1]);
    }
}

const missingByLang = {};
const langs = ['fr', 'en', 'es', 'de'];

for (const lang of langs) {
    missingByLang[lang] = [];
    const langDict = translations[lang] || {};
    for (const key of keysFound) {
        if (!langDict[key]) {
            missingByLang[lang].push(key);
        }
    }
}

console.log(JSON.stringify(missingByLang, null, 2));
