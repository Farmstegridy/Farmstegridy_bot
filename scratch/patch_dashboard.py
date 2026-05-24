import re
with open('web/views/dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure google translate is gone
content = re.sub(r'<!-- Google Translate Injection -->.*?<!-- End Google Translate -->', '', content, flags=re.DOTALL)
if '<script src="/js/translations.js"></script>' not in content:
    content = content.replace('</body>', '<script src="/js/translations.js"></script>\n</body>')

with open('web/views/dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Dashboard HTML patched!")
