const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf8');

const newCode = code.replace(
    "const { error } = await updateAppSettings(updates);",
    "const { error } = await updateAppSettings(updates);\n            if (error) fs.writeFileSync('last_supabase_error.json', JSON.stringify({error, updates}));"
);

fs.writeFileSync('server.js', newCode);
