const fs = require('fs');
const html = fs.readFileSync('web/views/catalog.html', 'utf8');
try {
  eval(html.match(/<script>([\s\S]*?)<\/script>/i)[1]);
} catch (e) {
  console.log("Error:", e.message, "Line:", e.stack.split('\n')[1]);
}
