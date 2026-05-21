const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../web/views/catalog.html');
let content = fs.readFileSync(file, 'utf8');

// Add getAvailableQuantity and updateStockBadges
const injection = `
        function getAvailableQuantity(p) {
            if (!p) return 0;
            const inCart = cart.filter(i => i.id === p.id).reduce((s, i) => s + i.n, 0);
            return Math.max(0, p.stock - inCart);
        }

        function updateStockBadges() {
            allProducts.forEach(p => {
                const avail = getAvailableQuantity(p);
                const qtyBadge = document.getElementById('stock-badge-' + p.id);
                if (qtyBadge) {
                    qtyBadge.innerHTML = '<span class="stock-indicator" style="background:' + (avail>0?'#2ecc71':'#e74c3c') + '; width:6px; height:6px; border-radius:50%; display:inline-block;"></span>' + (avail>0 ? avail + ' en stock' : 'Épuisé');
                }
            });
        }
`;

content = content.replace('function updateCartUI() {', injection + '\n        function updateCartUI() {');
content = content.replace('else bar.classList.remove(\'visible\');', 'else bar.classList.remove(\'visible\');\n            updateStockBadges();');

// Also update renderGrid to use getAvailableQuantity for initial render
content = content.replace(/p\.stock > 0 && p\.stock < 10/g, 'getAvailableQuantity(p) > 0 && getAvailableQuantity(p) < 10');
content = content.replace(/\$\{p\.stock\}/g, '${getAvailableQuantity(p)}');
content = content.replace(/p\.stock>0/g, 'getAvailableQuantity(p)>0');

// Also update the interval poll
content = content.replace('if (idx > -1 && allProducts[idx].stock !== np.stock) {', 'if (idx > -1 && allProducts[idx].stock !== np.stock) {'); // Keep
content = content.replace('qtyBadge.innerHTML = `<span class="stock-indicator" style="background:${np.stock>0?\'#2ecc71\':\'#e74c3c\'}"></span>${np.stock>0 ? np.stock+\' en stock\' : \'Épuisé\'}`;', 'updateStockBadges();');

fs.writeFileSync(file, content);
console.log('Patched catalog.html');
