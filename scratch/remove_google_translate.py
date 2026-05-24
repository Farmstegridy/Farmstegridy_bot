import re
import glob

def clean_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove Google Translate injection
    content = re.sub(r'<!-- Google Translate Injection -->.*?<!-- End Google Translate -->', '', content, flags=re.DOTALL)
    
    # Insert translations.js before </body>
    if '<script src="/js/translations.js"></script>' not in content:
        content = content.replace('</body>', '<script src="/js/translations.js"></script>\n</body>')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for filepath in glob.glob('web/views/*.html'):
    clean_html(filepath)
    print(f"Cleaned {filepath}")

