import re

with open('services/translator.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """    // Create a copy
    const p = { ...product };
    if (p.name) p.name = await translate(p.name, targetLang);
    if (p.description) p.description = await translate(p.description, targetLang);
    if (p.category) p.category = await translate(p.category, targetLang);"""

new_code = """    // Create a copy
    const p = { ...product };
    if (p.category) p.raw_category = p.category; // Keep original for logic filtering
    if (p.name) p.name = await translate(p.name, targetLang);
    if (p.description) p.description = await translate(p.description, targetLang);
    if (p.category) p.category = await translate(p.category, targetLang);"""

content = content.replace(old_code, new_code)

with open('services/translator.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("translator.js fixed!")
