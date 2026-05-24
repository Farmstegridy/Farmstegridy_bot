import re

with open('web/views/catalog.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace category logic in renderBots
old_bot = "const botProducts = allProducts.filter(p => p.category && (p.category.includes('PACK') || p.category.includes('MODULE')));"
new_bot = "const botProducts = allProducts.filter(p => (p.raw_category || p.category) && ((p.raw_category || p.category).includes('PACK') || (p.raw_category || p.category).includes('MODULE')));"
content = content.replace(old_bot, new_bot)

# Also category logic in renderShop
old_shop = "const demoProducts = allProducts.filter(p => !p.category || (!p.category.includes('PACK') && !p.category.includes('MODULE')));"
new_shop = "const demoProducts = allProducts.filter(p => !(p.raw_category || p.category) || (!(p.raw_category || p.category).includes('PACK') && !(p.raw_category || p.category).includes('MODULE')));"
content = content.replace(old_shop, new_shop)

# In renderBots, for filter logic by category tab:
# Wait! p.category is used for display in the tab: cats = ['TOUT', ...new Set(botProducts.map(p => p.category).filter(c => c))];
# If we filter by p.category === c, it works because c is from p.category!

with open('web/views/catalog.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("catalog.html fixed!")
