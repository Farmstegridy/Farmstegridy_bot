import re

with open('services/i18n.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("'btn_settings': 'Réglages',", "'btn_settings': 'Langues',")

with open('services/i18n.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("i18n.js fixed!")
