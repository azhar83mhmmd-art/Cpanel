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

function table(name) {
  const value = TABLES[name];
  if (!value) throw new Error(`Database table tidak dikenal: ${name}`);
  return value;
}

async function readAll(name) {
  const { data, error } = await getClient().from(table(name)).select('*');
  if (error) throw error;
  return data || [];
}

// Compatibility helper for older endpoints. New critical flows should prefer
// direct insert/update helpers below so one request cannot overwrite another
// Vercel instance's rows with an old snapshot.
async function writeAll(name, rows) {
  const { error } = await getClient().rpc('replace_kairoo_rows', {
    p_table: table(name),
    p_rows: rows || [],
  });
  if (error) throw error;
}

async function findOne(name, column, value) {
  const { data, error } = await getClient().from(table(name)).select('*').eq(column, value).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertOne(name, row) {
  const { data, error } = await getClient().from(table(name)).insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function updateOne(name, column, value, patch) {
  const { data, error } = await getClient().from(table(name)).update(patch).eq(column, value).select('*').single();
  if (error) throw error;
  return data;
}

async function deleteOne(name, column, value) {
  const { error } = await getClient().from(table(name)).delete().eq(column, value);
  if (error) throw error;
}

module.exports = { getClient, readAll, writeAll, findOne, insertOne, updateOne, deleteOne };
