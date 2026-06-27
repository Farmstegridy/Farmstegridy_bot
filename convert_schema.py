import re

with open('schema.sql', 'r') as f:
    sql = f.read()

# 1. Remove DO $$ blocks
sql = re.sub(r'DO \$\$.*?END \$\$;', '', sql, flags=re.DOTALL)
sql = re.sub(r'CREATE OR REPLACE FUNCTION.*?\$\$ LANGUAGE plpgsql;', '', sql, flags=re.DOTALL)

# 2. Convert Data Types
sql = sql.replace('TIMESTAMPTZ', 'DATETIME')
sql = sql.replace('JSONB', 'TEXT')
sql = re.sub(r'NUMERIC\(\d+,\d+\)', 'REAL', sql)
sql = sql.replace('BIGSERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
sql = sql.replace('BOOLEAN', 'INTEGER')
sql = sql.replace('true', '1')
sql = sql.replace('false', '0')
sql = sql.replace('::jsonb', '')

# 3. Clean up
sql = re.sub(r'\n{3,}', '\n\n', sql)

with open('schema.sql', 'w') as f:
    f.write(sql)
print("Schema converted for SQLite")
