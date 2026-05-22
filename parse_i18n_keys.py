import os
import re
import json

directory = '/Users/dikenson/Desktop/Farmstegridy_bot'
keys_found = {}

# regex for t(context, 'key', 'default')
pattern = re.compile(r"t\([^,]+,\s*'([A-Za-z0-9_]+)'(?:,\s*`([^`]+)`|,\s*'([^']+)')?")

for root, _, files in os.walk(directory):
    if 'node_modules' in root or '.git' in root:
        continue
    for file in files:
        if file.endswith('.js'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                matches = pattern.findall(content)
                for match in matches:
                    key = match[0]
                    default_text = match[1] if match[1] else match[2]
                    if key not in keys_found and key != 'id':
                        keys_found[key] = default_text

with open('found_keys.json', 'w', encoding='utf-8') as f:
    json.dump(keys_found, f, indent=2, ensure_ascii=False)
