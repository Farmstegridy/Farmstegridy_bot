const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

let dbPromise = null;

async function getDb() {
    if (!dbPromise) {
        dbPromise = open({
            filename: path.join(__dirname, '../database.sqlite'),
            driver: sqlite3.Database
        }).then(async (db) => {
            const hasTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_users'");
            if (!hasTable) {
                console.log('[System] Initializing SQLite schema...');
                const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
                await db.exec(schema);
            }
            return db;
        });
    }
    return dbPromise;
}

class QueryBuilder {
    constructor(table) {
        this.table = table;
        this.operation = null;
        this._select = '*';
        this._count = false;
        this.conditions = [];
        this.values = [];
        this.data = null;
        this._limit = null;
        this._order = null;
        this._or = null;
        this._single = false;
        this._maybeSingle = false;
    }
    
    select(cols = '*', options = {}) {
        if (!this.operation) this.operation = 'select';
        this._select = cols;
        if (options.count === 'exact') this._count = true;
        return this;
    }
    
    insert(data) {
        this.operation = 'insert';
        this.data = data;
        return this;
    }
    
    update(data) {
        this.operation = 'update';
        this.data = data;
        return this;
    }
    
    upsert(data) {
        this.operation = 'upsert';
        this.data = data;
        return this;
    }
    
    delete() {
        this.operation = 'delete';
        return this;
    }
    
    eq(col, val) {
        this.conditions.push(`${col} = ?`);
        this.values.push(val);
        return this;
    }
    
    like(col, val) {
        this.conditions.push(`${col} LIKE ?`);
        this.values.push(val);
        return this;
    }
    
    or(str) {
        this._or = str;
        return this;
    }
    
    order(col, options = { ascending: true }) {
        this._order = `ORDER BY ${col} ${options.ascending ? 'ASC' : 'DESC'}`;
        return this;
    }
    
    limit(n) {
        this._limit = n;
        return this;
    }
    
    single() {
        this._single = true;
        return this;
    }
    
    maybeSingle() {
        this._maybeSingle = true;
        return this;
    }
    
    async then(resolve, reject) {
        try {
            const db = await getDb();
            let query = '';
            let params = [...this.values];
            
            if (this.operation === 'select') {
                if (this._count) {
                    query = `SELECT COUNT(*) as count FROM ${this.table}`;
                } else {
                    query = `SELECT ${this._select} FROM ${this.table}`;
                }
            } else if (this.operation === 'insert') {
                const items = Array.isArray(this.data) ? this.data : [this.data];
                const item = items[0];
                const keys = Object.keys(item);
                const placeholders = keys.map(() => '?').join(',');
                query = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${placeholders})`;
                params = Object.values(item).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
            } else if (this.operation === 'update') {
                const keys = Object.keys(this.data);
                const setStr = keys.map(k => `${k} = ?`).join(', ');
                query = `UPDATE ${this.table} SET ${setStr}`;
                params = Object.values(this.data).map(v => typeof v === 'object' ? JSON.stringify(v) : v).concat(params);
            } else if (this.operation === 'delete') {
                query = `DELETE FROM ${this.table}`;
            } else if (this.operation === 'upsert') {
                const items = Array.isArray(this.data) ? this.data : [this.data];
                const item = items[0];
                const keys = Object.keys(item);
                const placeholders = keys.map(() => '?').join(',');
                query = `INSERT OR REPLACE INTO ${this.table} (${keys.join(',')}) VALUES (${placeholders})`;
                params = Object.values(item).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
            }
            
            if (this.conditions.length > 0) {
                query += ` WHERE ${this.conditions.join(' AND ')}`;
            }
            
            if (this._or) {
                if (this._or.includes('tg_lock_owner.is.null')) {
                    const orClause = `(tg_lock_owner IS NULL OR tg_lock_expires < CURRENT_TIMESTAMP OR tg_lock_owner = ?)`;
                    if (this.conditions.length > 0) query += ` AND ${orClause}`;
                    else query += ` WHERE ${orClause}`;
                    const match = this._or.match(/owner\.eq\.(.*)$/);
                    if (match) params.push(match[1]);
                }
            }
            
            if (this._order) query += ` ${this._order}`;
            if (this._limit) query += ` LIMIT ${this._limit}`;
            
            if (this.operation === 'select') {
                if (this._count) {
                    const res = await db.get(query, params);
                    resolve({ data: null, count: res ? res.count : 0, error: null });
                } else if (this._single || this._maybeSingle) {
                    const row = await db.get(query, params);
                    if (row) {
                        for (const k in row) {
                            if (typeof row[k] === 'string' && (row[k].startsWith('{') || row[k].startsWith('['))) {
                                try { row[k] = JSON.parse(row[k]); } catch(e){}
                            }
                        }
                    }
                    if (this._single && !row) resolve({ data: null, error: { message: 'Row not found' }});
                    else resolve({ data: row, error: null });
                } else {
                    const rows = await db.all(query, params);
                    if (rows) {
                        rows.forEach(row => {
                            for (const k in row) {
                                if (typeof row[k] === 'string' && (row[k].startsWith('{') || row[k].startsWith('['))) {
                                    try { row[k] = JSON.parse(row[k]); } catch(e){}
                                }
                            }
                        });
                    }
                    resolve({ data: rows, error: null });
                }
            } else {
                await db.run(query, params);
                if (this.operation === 'insert' || this.operation === 'upsert' || this.operation === 'update') {
                    if (this._single) {
                         resolve({ data: this.data, error: null });
                    } else {
                         resolve({ data: [this.data], error: null });
                    }
                } else {
                    resolve({ data: null, error: null });
                }
            }
            
        } catch (err) {
            console.error('Supabase Mock Error:', err);
            resolve({ data: null, error: err });
        }
    }
}

const supabase = {
    from: (table) => new QueryBuilder(table),
    storage: {
        from: (bucket) => ({
            upload: async (filename, buffer, opts) => {
                const p = path.join(__dirname, '../web/public/uploads', filename);
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, buffer);
                return { data: { path: filename }, error: null };
            },
            getPublicUrl: (filename) => {
                return { data: { publicUrl: `/public/uploads/${filename}` } };
            }
        })
    }
};

module.exports = { supabase, getDb };
