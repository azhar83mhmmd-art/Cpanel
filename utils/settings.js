// Persistent Pterodactyl settings stored in Supabase.
const { getClient } = require('./db');
const { encrypt, decrypt } = require('./crypto');

const ID = 1;

async function readRow() {
  const { data, error } = await getClient().from('settings').select('*').eq('id', ID).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getConfig() {
  const raw = await readRow();
  const initialized = !!raw?.updated_at;
  return {
    domain: (initialized ? raw.domain || '' : process.env.PTERODACTYL_URL || '').replace(/\/+$/, ''),
    ptla: raw?.ptla_encrypted ? decrypt(raw.ptla_encrypted) : initialized ? '' : process.env.PTERODACTYL_PTLA || '',
    ptlc: raw?.ptlc_encrypted ? decrypt(raw.ptlc_encrypted) : initialized ? '' : process.env.PTERODACTYL_PTLC || '',
    updated_at: raw?.updated_at || null,
    updated_by: raw?.updated_by || null,
  };
}

async function getConfigForEdit() {
  return getConfig();
}

async function updateConfig({ domain, ptla, ptlc, updatedBy }) {
  const raw = (await readRow()) || { id: ID };
  if (domain !== undefined) raw.domain = String(domain).trim().replace(/\/+$/, '');
  if (ptla !== undefined) {
    const v = String(ptla).trim();
    if (v) raw.ptla_encrypted = encrypt(v); else delete raw.ptla_encrypted;
  }
  if (ptlc !== undefined) {
    const v = String(ptlc).trim();
    if (v) raw.ptlc_encrypted = encrypt(v); else delete raw.ptlc_encrypted;
  }
  raw.updated_at = new Date().toISOString();
  raw.updated_by = updatedBy || null;
  const { error } = await getClient().from('settings').upsert(raw, { onConflict: 'id' });
  if (error) throw error;
  return getConfigForEdit();
}

module.exports = { getConfig, getConfigForEdit, updateConfig };
