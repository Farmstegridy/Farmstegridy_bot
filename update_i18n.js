const fs = require('fs');

const foundKeysStr = fs.readFileSync('found_keys.json', 'utf8');
const foundKeys = JSON.parse(foundKeysStr);

// Load existing i18n
const i18nPath = './services/i18n.js';
let i18nContent = fs.readFileSync(i18nPath, 'utf8');

// We will use a regex to extract the translations object, but it's simpler to just require it, modify it, and rewrite it.
const { translations } = require('./services/i18n.js');

const dict = {
  fr: {}, en: {}, es: {}, de: {}
};

// Map default texts to other languages using a simple heuristic or we can just leave a placeholder and then I'll use sed/replace?
// I'll print the missing keys so I can generate a replace block.
for (const key of Object.keys(foundKeys)) {
  const def = foundKeys[key] || '';
  if (!translations.en[key]) dict.en[key] = def;
  if (!translations.es[key]) dict.es[key] = def;
  if (!translations.de[key]) dict.de[key] = def;
}

console.log(JSON.stringify(dict, null, 2));
