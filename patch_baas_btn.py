import re

with open("handlers/order_system.js", "r") as f:
    content = f.read()

# Remplacer la condition hasBaas par toujours afficher
old_str = """        if (!isBaas) {
            const hasBaas = Object.keys(productsByCategory).some(cat => baasKeywords.some(kw => cat.toUpperCase().includes(kw)));
            if (hasBaas) {
                buttons.push([Markup.button.callback(t(user, 'btn_view_baas', '🤖 Packs Bot & Modules'), 'view_catalog_baas')]);
            }
        } else {"""

new_str = """        if (!isBaas) {
            buttons.push([Markup.button.callback(t(user, 'btn_view_baas', '🤖 Packs Bot & Modules'), 'view_catalog_baas')]);
        } else {"""

if old_str in content:
    content = content.replace(old_str, new_str)
    with open("handlers/order_system.js", "w") as f:
        f.write(content)
    print("Patched hasBaas condition!")
else:
    print("Could not find the string to replace.")
