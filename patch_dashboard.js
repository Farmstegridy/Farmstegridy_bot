const fs = require('fs');
let html = fs.readFileSync('web/views/dashboard.html', 'utf8');

// Replace addDiscountRow function
const oldAddDiscountRow = `        function addDiscountRow(qty = '', price = '', stock = '') {
            const div = document.createElement('div');
            div.className = 'discount-row';
            div.style = 'display:grid; grid-template-columns: 1fr 1fr 1fr 30px; gap:6px; align-items:end; background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;';
            
            let options = '';
            for (let i = 1; i <= 100; i++) {
                options += \`<option value="\${i}" \${parseInt(qty) === i ? 'selected' : ''}>\${i}</option>\`;
            }

            div.innerHTML = \`
                <div>
                    <label style="font-size:10px">Mult. (ex: 5 pour 5x)</label>
                    <select class="discount-qty" onchange="const basePrice = parseFloat(document.getElementById('prod_price').value) || 0; this.parentElement.nextElementSibling.querySelector('.discount-price').value = (this.value * basePrice).toFixed(2).replace(/\\.00$/, '');" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; font-size:12px; height:36px; padding:0 8px;">
                        <option value="" disabled \${!qty ? 'selected' : ''}>Sél.</option>
                        \${options}
                    </select>
                </div>
                <div>
                    <label style="font-size:10px">Prix (€)</label>
                    <input type="number" class="discount-price" value="\${price}" placeholder="Prix" min="0" style="height:36px; font-size:12px; margin:0; border-radius:8px;">
                </div>
                <div>
                    <label style="font-size:10px">Stock</label>
                    <input type="number" class="discount-stock" value="\${stock}" placeholder="Qté" min="0" style="height:36px; font-size:12px; margin:0; border-radius:8px;" oninput="if(typeof calculateTotalStock === 'function') calculateTotalStock()">
                </div>
                <button class="btn btn-sm btn-outline text-danger" onclick="this.parentElement.remove(); if(typeof calculateTotalStock === 'function') calculateTotalStock();" style="padding:8px; margin-bottom:0; height:36px; display:flex; align-items:center; justify-content:center;">🗑️</button>
            \`;
            document.getElementById('discounts_list').appendChild(div);
            if(typeof calculateTotalStock === 'function') calculateTotalStock();
        }`;

const newAddDiscountRow = `        function addDiscountRow(qty = '', price = '', stock = '', unit = '', is_absolute = true) {
            const div = document.createElement('div');
            div.className = 'discount-row';
            div.style = 'display:grid; grid-template-columns: 1fr 1fr 1fr 30px; gap:6px; align-items:end; background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;';
            
            // Si c'est un ancien produit, on le laisse en multiplicateur (is_absolute = false)
            // Sinon on utilise la nouvelle méthode
            const absoluteChecked = is_absolute !== false;
            
            const unitOptions = \`
                <option value="g" \${unit==='g'?'selected':''}>g</option>
                <option value="U" \${unit==='U'?'selected':''}>U</option>
                <option value="ml" \${unit==='ml'?'selected':''}>ml</option>
                <option value="L" \${unit==='L'?'selected':''}>L</option>
                <option value="kg" \${unit==='kg'?'selected':''}>kg</option>
                <option value="mg" \${unit==='mg'?'selected':''}>mg</option>
            \`;

            div.innerHTML = \`
                <div>
                    <label style="font-size:10px">Format / Unité</label>
                    <div style="display:flex; gap:4px;">
                        <input type="number" step="0.1" class="discount-qty" value="\${qty}" placeholder="Ex: 4.5" style="height:36px; font-size:12px; margin:0; border-radius:8px; flex:2; min-width:40px;">
                        <select class="discount-unit" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; font-size:12px; height:36px; padding:0 4px; flex:1;">
                            \${unitOptions}
                        </select>
                        <input type="hidden" class="discount-absolute" value="\${absoluteChecked ? 'true' : 'false'}">
                    </div>
                </div>
                <div>
                    <label style="font-size:10px">Prix (€)</label>
                    <input type="number" class="discount-price" value="\${price}" placeholder="Prix" min="0" step="0.01" style="height:36px; font-size:12px; margin:0; border-radius:8px;">
                </div>
                <div>
                    <label style="font-size:10px">Stock</label>
                    <input type="number" class="discount-stock" value="\${stock}" placeholder="Qté" min="0" style="height:36px; font-size:12px; margin:0; border-radius:8px;" oninput="if(typeof calculateTotalStock === 'function') calculateTotalStock()">
                </div>
                <button class="btn btn-sm btn-outline text-danger" onclick="this.parentElement.remove(); if(typeof calculateTotalStock === 'function') calculateTotalStock();" style="padding:8px; margin-bottom:0; height:36px; display:flex; align-items:center; justify-content:center;">🗑️</button>
            \`;
            document.getElementById('discounts_list').appendChild(div);
            if(typeof calculateTotalStock === 'function') calculateTotalStock();
        }`;

html = html.replace(oldAddDiscountRow, newAddDiscountRow);

// In editProduct(p), change the call to addDiscountRow
// Need to find: r.qty, r.total || r.total_price, r.stock
// wait, editProduct uses p.discounts_config.forEach
const oldEditDiscount = `                    p.discounts_config.forEach(r => addDiscountRow(r.qty, r.total || r.total_price, r.stock));`;
const newEditDiscount = `                    p.discounts_config.forEach(r => addDiscountRow(r.qty, r.total || r.total_price, r.stock, r.unit || p.unit || 'g', r.is_absolute));`;
html = html.replace(oldEditDiscount, newEditDiscount);

// In saveProduct, get unit and is_absolute
const oldSaveDiscount = `                    const qty = parseInt(r.querySelector('.discount-qty').value);
                    const totalVal = r.querySelector('.discount-price').value.replace(',', '.');
                    const total = parseFloat(totalVal);
                    const stockVal = parseInt(r.querySelector('.discount-stock').value) || 0;
                    if (!isNaN(qty) && !isNaN(total)) {
                        discounts_config.push({ qty, total, stock: stockVal });
                    }`;
const newSaveDiscount = `                    const qty = parseFloat(r.querySelector('.discount-qty').value.replace(',', '.'));
                    const totalVal = r.querySelector('.discount-price').value.replace(',', '.');
                    const total = parseFloat(totalVal);
                    const stockVal = parseInt(r.querySelector('.discount-stock').value) || 0;
                    const unit = r.querySelector('.discount-unit').value;
                    const is_abs = r.querySelector('.discount-absolute').value === 'true';
                    
                    if (!isNaN(qty) && !isNaN(total)) {
                        discounts_config.push({ qty, total, stock: stockVal, unit, is_absolute: is_abs });
                    }`;
html = html.replace(oldSaveDiscount, newSaveDiscount);

// Update headers in html
const oldHeader = `<span>Format (Multiplicateur)</span><span>Prix (€)</span><span>Stock</span><span></span>`;
const newHeader = `<span>Format / Unité</span><span>Prix (€)</span><span>Stock</span><span></span>`;
html = html.replace(oldHeader, newHeader);

fs.writeFileSync('web/views/dashboard.html', html);
console.log('Patched dashboard.html');
