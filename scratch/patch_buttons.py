import re
import os

files_to_patch = [
    '/Users/dikenson/Desktop/Farmstegridy_bot/handlers/start.js',
    '/Users/dikenson/Desktop/Projet BOT (client deja terminée) /bot presentation/handlers/start.js',
    '/Users/dikenson/Desktop/Farmstegridy_bot/handlers/whatsapp.js',
    '/Users/dikenson/Desktop/Projet BOT (client deja terminée) /bot presentation/handlers/whatsapp.js'
]

for file_path in files_to_patch:
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Patch start.js
    if 'start.js' in file_path:
        content = content.replace("Markup.button.callback('◀️ Menu', 'main_menu')", "Markup.button.callback(t(user, 'btn_back_menu', '◀️ Menu'), 'main_menu')")
        content = content.replace("Markup.button.callback('◀️ Retour Menu', 'main_menu')", "Markup.button.callback(t(user, 'btn_back_menu', '◀️ Menu'), 'main_menu')")
        content = content.replace("Markup.button.callback('◀️ Retour', 'main_menu')", "Markup.button.callback(t(user, 'btn_back_menu', '◀️ Menu'), 'main_menu')")
        
        # Ensure t is imported if missing in the local scope, but wait, 't' is already defined globally in start.js?
        # Let's check if 't' is defined.
        if "const { t } = require('../services/i18n');" not in content:
            content = "const { t } = require('../services/i18n');\n" + content

    # Patch whatsapp.js
    if 'whatsapp.js' in file_path:
        # It's harder to translate without 'user' object, but we can assume settings.language or default to 'fr'
        # Actually, let's just make it robust.
        pass

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Patched start.js successfully.")
