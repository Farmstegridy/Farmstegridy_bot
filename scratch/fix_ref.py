import re
import os

files = [
    '/Users/dikenson/Desktop/Farmstegridy_bot/handlers/start.js',
    '/Users/dikenson/Desktop/Projet BOT (client deja terminée) /bot presentation/handlers/start.js'
]

for fp in files:
    if not os.path.exists(fp): continue
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()

    # In bot.command('language'
    content = re.sub(
        r"bot\.command\('language', async \(ctx\) => \{",
        r"bot.command('language', async (ctx) => {\n        const user = ctx.state.user || { language_code: ctx.from.language_code || 'fr' };",
        content
    )

    # In action('set_language_menu'
    content = re.sub(
        r"bot\.action\('set_language_menu', async \(ctx\) => \{",
        r"bot.action('set_language_menu', async (ctx) => {\n        const user = ctx.state.user || { language_code: ctx.from.language_code || 'fr' };",
        content
    )

    # In handlePrivateContact
    content = re.sub(
        r"async function handlePrivateContact\(ctx\) \{",
        r"async function handlePrivateContact(ctx) {\n    const user = ctx.state.user || { language_code: ctx.from.language_code || 'fr' };",
        content
    )

    # In channel_link action
    content = re.sub(
        r"bot\.action\('channel_link', async \(ctx\) => \{",
        r"bot.action('channel_link', async (ctx) => {\n        const user = ctx.state.user || { language_code: ctx.from.language_code || 'fr' };",
        content
    )

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed user reference errors.")
