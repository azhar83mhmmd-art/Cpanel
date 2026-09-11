// Jalankan setelah schema Supabase diterapkan: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getClient } = require('./utils/db');
const { v4: uuid } = require('uuid');

async function main() {
  const supabase = getClient();
  const { data: existing, error: findError } = await supabase.from('users').select('id').eq('role', 'admin_web').limit(1);
  if (findError) throw findError;
  if (existing?.length) {
    console.log('Akun admin_web sudah ada, seed dilewati.');
    return;
  }

  const username = process.env.SEED_ADMIN_USERNAME || 'superadmin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const now = new Date().toISOString();
  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await supabase.from('users').insert({
    id: uuid(), username, password_hash, role: 'admin_web', status: 'active',
    created_at: now, updated_at: now, last_login: null,
  });
  if (error) throw error;

  await supabase.from('settings').upsert({ id: 1 }, { onConflict: 'id' });
  console.log('=== ACCOUNT CREATED ===');
  console.log('Username :', username);
  console.log('Password :', password);
  console.log('Role     : ADMIN_WEB');
  console.log('WAJIB ganti password setelah login pertama kali.');
}

main().catch((err) => { console.error(err); process.exit(1); });
