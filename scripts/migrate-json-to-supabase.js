// Optional migration for old local data/*.json deployments.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../utils/db');

const dir = path.join(__dirname, '..', 'data');
const map = { users: 'users.json', panels: 'panels.json', logs: 'logs.json' };

async function main() {
  const db = getClient();
  for (const [table, file] of Object.entries(map)) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) { console.log(`${file}: tidak ada, dilewati.`); continue; }
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    if (!rows.length) { console.log(`${file}: kosong, dilewati.`); continue; }
    const { error } = await db.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`${file}: ${rows.length} data berhasil dimigrasikan.`);
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
