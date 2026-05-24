import re

with open('handlers/start.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the direct supabase update with updateUser to fix caching
old_code = """        const { supabase, COL_USERS } = require('../services/database');
        const docId = `${ctx.platform}_${ctx.from.id}`;
        
        // 1. Mettre à jour l'état immédiatement pour que le menu s'affiche dans la nouvelle langue
        if (!ctx.state.user) ctx.state.user = {};
        if (!ctx.state.user.data) ctx.state.user.data = {};
        ctx.state.user.data.language = lang;
        ctx.state.user.language_code = lang;

        // 2. Persister en base de données
        await supabase.from(COL_USERS).update({ 
            language_code: lang, 
            data: { ...(ctx.state.user.data), language: lang } 
        }).eq('id', docId);"""

new_code = """        const { updateUser } = require('../services/database');
        const docId = `${ctx.platform}_${ctx.from.id}`;
        
        // 1. Mettre à jour l'état immédiatement pour que le menu s'affiche dans la nouvelle langue
        if (!ctx.state.user) ctx.state.user = {};
        if (!ctx.state.user.data) ctx.state.user.data = {};
        ctx.state.user.data.language = lang;
        ctx.state.user.language_code = lang;

        // 2. Persister en base de données avec updateUser pour mettre à jour le cache !
        await updateUser(docId, { 
            language_code: lang, 
            data: { ...(ctx.state.user.data), language: lang } 
        });"""

content = content.replace(old_code, new_code)

with open('handlers/start.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("start.js fixed!")
