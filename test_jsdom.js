const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('web/views/catalog.html', 'utf8');

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  resources: "usable"
});

dom.window.fetch = async (url) => {
  if (url.includes('/api/products')) return { ok: true, json: async () => ([ { id: '1', name: 'Test', price: 10, category: 'Fleurs', stock: 5 } ]) };
  if (url.includes('/api/news')) return { ok: true, json: async () => ([]) };
  if (url.includes('/api/user-info')) return { ok: true, json: async () => ({ id: '123', balance: 0 }) };
  return { ok: true, json: async () => ({}) };
};

dom.window.Telegram = { WebApp: { initDataUnsafe: { user: { id: 123 } }, expand: () => {}, enableClosingConfirmation: () => {}, setHeaderColor: () => {}, HapticFeedback: { impactOccurred: () => {} } } };

dom.window.addEventListener('error', (e) => {
  console.log('JSDOM ERROR:', e.message);
});

setTimeout(() => {
  console.log('DOM loaded. Checking if loading screen is hidden...');
  const ls = dom.window.document.getElementById('loading-screen');
  console.log('Loading screen display:', ls.style.display);
}, 2000);
