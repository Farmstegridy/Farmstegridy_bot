import re

html_path = '/Users/dikenson/Desktop/Farmstegridy_bot/web/views/address_picker.html'
js_path = '/Users/dikenson/Desktop/Farmstegridy_bot/web/js/translations.js'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    '>📍 Ma Livraison<': '><span data-i18n="my_delivery">📍 Ma Livraison</span><',
    '>Saisissez votre adresse pour commander<': '><span data-i18n="enter_address">Saisissez votre adresse pour commander</span><',
    'placeholder="Ex: 11 rue de la Paix..."': 'placeholder="Ex: 11 rue de la Paix..." data-i18n-placeholder="address_ex"',
    '>Commencez à taper pour voir des suggestions...<': '><span data-i18n="start_typing">Commencez à taper pour voir des suggestions...</span><',
    "'Aucun résultat trouvé.'": "t('no_result_found', {default: 'Aucun résultat trouvé.'})",
    "'Erreur lors de la recherche.'": "t('search_error', {default: 'Erreur lors de la recherche.'})"
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

new_keys = {
    'my_delivery': {'fr': '📍 Ma Livraison', 'en': '📍 My Delivery', 'es': '📍 Mi Entrega', 'de': '📍 Meine Lieferung'},
    'enter_address': {'fr': 'Saisissez votre adresse pour commander', 'en': 'Enter your address to order', 'es': 'Ingresa tu dirección para pedir', 'de': 'Geben Sie Ihre Adresse ein'},
    'address_ex': {'fr': 'Ex: 11 rue de la Paix...', 'en': 'Ex: 11 Peace Street...', 'es': 'Ej: 11 Calle de la Paz...', 'de': 'Bsp: 11 Friedensstraße...'},
    'start_typing': {'fr': 'Commencez à taper pour voir des suggestions...', 'en': 'Start typing to see suggestions...', 'es': 'Empieza a escribir para ver sugerencias...', 'de': 'Beginnen Sie zu tippen für Vorschläge...'},
    'no_result_found': {'fr': 'Aucun résultat trouvé.', 'en': 'No result found.', 'es': 'Ningún resultado.', 'de': 'Kein Ergebnis gefunden.'},
    'search_error': {'fr': 'Erreur lors de la recherche.', 'en': 'Search error.', 'es': 'Error de búsqueda.', 'de': 'Suchfehler.'}
}

with open(js_path, 'r', encoding='utf-8') as f:
    trans_content = f.read()

for lang in ['fr', 'en', 'es', 'de']:
    pattern = re.compile(r'(' + lang + r':\s*\{)(.*?)(\n\s*\})', re.DOTALL)
    match = pattern.search(trans_content)
    if match:
        existing_keys_text = match.group(2)
        added_keys = []
        for key, vals in new_keys.items():
            if f"'{key}':" not in existing_keys_text and f'"{key}":' not in existing_keys_text:
                new_val = vals[lang].replace("'", "\\'")
                added_keys.append(f"        '{key}': '{new_val}'")
        
        if added_keys:
            replacement = match.group(1) + match.group(2) + ",\n" + ",\n".join(added_keys) + match.group(3)
            trans_content = trans_content[:match.start()] + replacement + trans_content[match.end():]

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(trans_content)

print("Address picker translations applied.")
