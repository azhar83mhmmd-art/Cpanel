const session = require('express-session');
const { getClient } = require('./db');

class SupabaseSessionStore extends session.Store {
  async get(sid, callback) {
    try {
      const { data, error } = await getClient().from('sessions').select('sess, expire').eq('sid', sid).maybeSingle();
      if (error) return callback(error);
      if (!data || new Date(data.expire).getTime() <= Date.now()) return callback(null, null);
      callback(null, data.sess);
    } catch (e) { callback(e); }
  }

  async set(sid, sess, callback) {
    try {
      const maxAge = Number(sess?.cookie?.maxAge || 1000 * 60 * 60 * 8);
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await getClient().from('sessions').upsert({ sid, sess, expire }, { onConflict: 'sid' });
      callback(error || undefined);
    } catch (e) { callback(e); }
  }

  async destroy(sid, callback) {
    try {
      const { error } = await getClient().from('sessions').delete().eq('sid', sid);
      callback(error || undefined);
    } catch (e) { callback(e); }
  }

  async touch(sid, sess, callback) {
    try {
      const maxAge = Number(sess?.cookie?.maxAge || 1000 * 60 * 60 * 8);
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await getClient().from('sessions').update({ sess, expire }).eq('sid', sid);
      callback(error || undefined);
    } catch (e) { callback(e); }
  }
}

module.exports = SupabaseSessionStore;
