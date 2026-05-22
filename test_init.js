const fs = require('fs');
const html = fs.readFileSync('web/views/catalog.html', 'utf8');
const initRegex = /async function init\(\) \{([\s\S]*?)\}/;
const match = initRegex.exec(html);
if (match) {
  console.log(match[0]);
}
