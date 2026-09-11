// Supabase-backed persistent database adapter for Vercel/serverless.
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur.');
    err.code = 'SUPABASE_NOT_CONFIGURED';
    throw err;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const TABLES = { users: 'users', panels: 'panels', logs: 'logs' };

async function readAll(name) {
  const table = TABLES[name];
  if (!table) throw new Error(`Database table tidak dikenal: ${name}`);
  const { data, error } = await getClient().from(table).select('*');
  if (error) throw error;
  return data || [];
}

// Compatibility helper for the existing code. The SQL RPC replaces a table's
// rows atomically, so two concurrent Vercel instances do not leave half-written data.
async function writeAll(name, rows) {
  const table = TABLES[name];
  if (!table) throw new Error(`Database table tidak dikenal: ${name}`);
  const { error } = await getClient().rpc('replace_kairoo_rows', {
    p_table: table,
    p_rows: rows || [],
  });
  if (error) throw error;
}

async function findOne(name, column, value) {
  const table = TABLES[name];
  if (!table) throw new Error(`Database table tidak dikenal: ${name}`);
  const { data, error } = await getClient().from(table).select('*').eq(column, value).maybeSingle();
  if (error) throw error;
  return data || null;
}

module.exports = { getClient, readAll, writeAll, findOne };
