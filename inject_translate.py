import re

html_files = ['web/views/catalog.html', 'web/views/livreur.html']

inject_code = """
    <!-- Google Translate Injection -->
    <style>
        .goog-te-banner-frame.skiptranslate { display: none !important; }
        body { top: 0px !important; }
        #google_translate_element { display: none !important; }
    </style>
    <div id="google_translate_element"></div>
    <script type="text/javascript">
        function googleTranslateElementInit() {
            new google.translate.TranslateElement({pageLanguage: 'fr', autoDisplay: false}, 'google_translate_element');
        }
    </script>
    <script type="text/javascript" src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const urlParams = new URLSearchParams(window.location.search);
            let lang = urlParams.get('lang') || 'fr';
            
            // Map Telegram language codes to Google Translate codes
            const langMap = { 'en': 'en', 'es': 'es', 'de': 'de', 'it': 'it', 'pt': 'pt', 'ru': 'ru', 'ar': 'ar' };
            lang = langMap[lang] || lang;

            if (lang !== 'fr') {
                const interval = setInterval(() => {
                    const select = document.querySelector('.goog-te-combo');
                    if (select && select.options.length > 0) {
                        select.value = lang;
                        select.dispatchEvent(new Event('change'));
                        clearInterval(interval);
                    }
                }, 300);
                setTimeout(() => clearInterval(interval), 5000);
            }
        });
    </script>
    <!-- End Google Translate -->
"""

for f in html_files:
    with open(f, 'r') as file:
        content = file.read()
    if "google_translate_element" not in content:
        content = content.replace("</body>", f"{inject_code}\n</body>")
        with open(f, 'w') as file:
            file.write(content)
        print(f"Injected into {f}")
    else:
        print(f"Already injected in {f}")

