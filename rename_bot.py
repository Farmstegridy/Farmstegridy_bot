import os
import re

directory = '.'

replacements = [
    ("Farmstegridy_bot", "Thegreenvalley_BOT"),
    ("Farmstegridy bot", "Thegreenvalley BOT"),
    ("Farmstegridy_Bot", "Thegreenvalley_BOT"),
    ("FARMSTEGRIDY BOT", "Thegreenvalley BOT"),
    ("FARMSTEGRIDY_BOT", "Thegreenvalley_BOT"),
    ("Farmstegridy", "Thegreenvalley"),
    ("farmstegridy", "thegreenvalley")
]

for root, dirs, files in os.walk(directory):
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    if '.git' in dirs:
        dirs.remove('.git')
    if '.gemini' in dirs:
        dirs.remove('.gemini')
    if 'scratch' in dirs:
        dirs.remove('scratch')

    for file in files:
        if file.endswith('.js') or file.endswith('.html') or file.endswith('.json') or file.endswith('.md'):
            if file == 'package-lock.json':
                continue
                
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception:
                continue

            new_content = content
            for old, new in replacements:
                new_content = new_content.replace(old, new)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {path}")
