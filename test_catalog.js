const fs = require('fs');
const html = fs.readFileSync('web/views/catalog.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  const code = match[1];
  try {
    new Function(code);
  } catch (e) {
    console.error("Syntax Error found!");
    console.error(e.message);
    const lines = code.split('\n');
    const errLineMatch = e.stack.match(/<anonymous>:(\d+):(\d+)/);
    if (errLineMatch) {
       const lineNum = parseInt(errLineMatch[1]) - 2;
       console.log("Around line:", lines[lineNum]);
    }
  }
}
console.log("Done checking syntax.");
