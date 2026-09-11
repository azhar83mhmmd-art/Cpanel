const crypto = require("crypto");

function getKey() {
  const secret = process.env.PANEL_SECRET || "";
  // Turunkan jadi 32 byte tetap agar aman dipakai walau secret user tidak persis 32 char
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(payloadB64) {
  const buf = Buffer.from(payloadB64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

function randomPassword(length = 12, prefix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const randomLength = Math.max(length - prefix.length, 6); // sisakan minimal 6 karakter acak walau prefix panjang
  let out = "";
  const bytes = crypto.randomBytes(randomLength);
  for (let i = 0; i < randomLength; i++) out += chars[bytes[i] % chars.length];
  return `${prefix}${out}`;
}

function randomUsername(prefix = "kai") {
  return `${prefix}${crypto.randomBytes(4).toString("hex")}`;
}

// Ubah nama panel yang diketik reseller menjadi username Pterodactyl yang valid:
// huruf kecil, angka, underscore/titik/strip saja, tanpa spasi, dibatasi panjang wajar.
function usernameFromName(name) {
  let clean = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
  clean = clean.replace(/^[_.-]+|[_.-]+$/g, "");
  if (clean.length > 32) clean = clean.slice(0, 32);
  if (!clean) clean = `user${crypto.randomBytes(3).toString("hex")}`;
  return clean;
}

module.exports = { encrypt, decrypt, randomPassword, randomUsername, usernameFromName };
