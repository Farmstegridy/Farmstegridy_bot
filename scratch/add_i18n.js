const fs = require('fs');
const file = 'services/i18n.js';
let content = fs.readFileSync(file, 'utf8');

const newEn = `
        'btn_catalog_miniapp': '✨ CATALOG MINI APP ✨',
        'btn_livreur_miniapp': '✨ DRIVER SPACE (MINI APP) ✨',
        'label_not_defined': 'NOT DEFINED',
        'btn_livreur_menu': 'Driver',
        'btn_supplier_menu': '🏪 Supplier',
`;

const newEs = `
        'btn_catalog_miniapp': '✨ CATÁLOGO MINI APP ✨',
        'btn_livreur_miniapp': '✨ ESPACIO REPARTIDOR (MINI APP) ✨',
        'label_not_defined': 'NO DEFINIDO',
        'btn_livreur_menu': 'Repartidor',
        'btn_supplier_menu': '🏪 Proveedor',
`;

const newDe = `
        'btn_catalog_miniapp': '✨ KATALOG MINI APP ✨',
        'btn_livreur_miniapp': '✨ KURIERBEREICH (MINI APP) ✨',
        'label_not_defined': 'NICHT DEFINIERT',
        'btn_livreur_menu': 'Kurier',
        'btn_supplier_menu': '🏪 Lieferant',
`;

content = content.replace(/'en': \{/, "'en': {\n" + newEn);
content = content.replace(/'es': \{/, "'es': {\n" + newEs);
content = content.replace(/'de': \{/, "'de': {\n" + newDe);

fs.writeFileSync(file, content);
console.log('Done!');
