require("dotenv").config();
require("express-async-errors");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { v4: uuid } = require("uuid");
const SupabaseSessionStore = require("./utils/session-store");

const { readAll, writeAll } = require("./utils/db");
const { encrypt, decrypt, randomPassword, usernameFromName } = require("./utils/crypto");
const { requireAuth, requireRole } = require("./middleware/auth");
const pterodactyl = require("./services/pterodactyl");
const settingsStore = require("./utils/settings");

const app = express();
const VIEWS = path.join(__dirname, "views");

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // hanya css/js/gambar, TIDAK ada file .html di sini

app.use(
  session({
    name: "kairoo.sid",
    store: new SupabaseSessionStore(),
    secret: process.env.SESSION_SECRET || "dev_secret_ganti_ini",
    resave: false,
    saveUninitialized: false,
    // "auto" penting agar cookie sesi tetap bekerja baik di HTTP (localhost)
    // maupun HTTPS di production. Sebelumnya secure=true saat NODE_ENV=production
    // membuat browser tidak mengirim cookie ketika panel dibuka lewat HTTP,
    // sehingga setelah login user langsung dianggap logout lagi.
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8, // 8 jam
    },
  })
);

// ---------- Helper log aktivitas ----------
async function logActivity({ userId, username, role, action, metadata = {}, req }) {
  const logs = await readAll("logs");
  logs.push({
    id: uuid(),
    user_id: userId,
    username,
    role,
    action,
    metadata,
    ip_address: req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    created_at: new Date().toISOString(),
  });
  await writeAll("logs", logs);
}

// =====================================================================
// RATE LIMIT
// =====================================================================
const createPanelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MAX_CREATE_PER_MINUTE || 5),
  message: { error: "Terlalu banyak request. Silakan coba lagi nanti." },
  keyGenerator: (req) => req.session?.user?.id || req.ip,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MAX_LOGIN_PER_MINUTE || 10),
  message: { error: "Terlalu banyak percobaan login. Silakan coba lagi nanti." },
  standardHeaders: true,
  legacyHeaders: false,
});

// anti double-submit sederhana (in-memory lock per user)
const creatingLock = new Set();

// =====================================================================
// FIRST-DEPLOY ADMIN SETUP — VERCEL + SUPABASE
// POST /api/setup-admin creates the first admin_web account only when:
// 1) SETUP_ADMIN_SECRET matches the request header/body secret
// 2) no admin_web account exists yet
// This endpoint cannot create additional admin_web accounts after the first one.
// =====================================================================
app.get("/api/setup-admin", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kairoo Store — Initial Setup</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}main{width:min(460px,100%);background:#15151c;border:1px solid #2b2b36;border-radius:18px;padding:24px;box-sizing:border-box}h1{margin:0 0 8px}p{color:#aaa}label{display:block;margin:14px 0 6px}input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #363642;background:#0e0e14;color:#fff}button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;font-weight:700;cursor:pointer}pre{white-space:pre-wrap;word-break:break-word;color:#bbb}</style></head>
<body><main><h1>Initial Admin Setup</h1><p>Buat akun admin_web pertama untuk Kairoo Store. Endpoint ini otomatis terkunci setelah admin pertama dibuat.</p>
<form id="f"><label>Setup Secret</label><input name="setup_secret" type="password" required><label>Username Admin</label><input name="username" value="superadmin" required><label>Password Admin</label><input name="password" type="password" minlength="8" required><button>Buat Admin</button></form><pre id="out"></pre>
<script>f.onsubmit=async e=>{e.preventDefault();out.textContent='Memproses...';const body=Object.fromEntries(new FormData(f));try{const r=await fetch('/api/setup-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();out.textContent=j.message||j.error||JSON.stringify(j,null,2);if(j.ok)f.reset()}catch(e){out.textContent='Request gagal.'}}</script></main></body></html>`);
});

app.post("/api/setup-admin", async (req, res) => {
  const expected = process.env.SETUP_ADMIN_SECRET;
  if (!expected || expected.length < 16) {
    return res.status(503).json({ error: "SETUP_ADMIN_SECRET belum dikonfigurasi atau terlalu pendek." });
  }

  const supplied = req.get("x-setup-secret") || req.body?.setup_secret;
  if (!supplied || supplied !== expected) {
    return res.status(403).json({ error: "Setup secret tidak valid." });
  }

  const db = require("./utils/db");
  const existing = await db.getClient().from("users").select("id").eq("role", "admin_web").limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) {
    return res.status(409).json({ error: "Setup sudah dikunci karena akun admin_web sudah ada." });
  }

  const username = String(req.body?.username || "superadmin").trim();
  const password = String(req.body?.password || "");
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: "Username 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung." });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password harus 8–128 karakter." });
  }

  const duplicate = await db.getClient().from("users").select("id").eq("username", username).maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) return res.status(409).json({ error: "Username sudah digunakan." });

  const now = new Date().toISOString();
  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await db.getClient().from("users").insert({
    id: uuid(), username, password_hash, role: "admin_web", status: "active",
    created_at: now, updated_at: now, last_login: null,
  });
  if (error) throw error;
  await db.getClient().from("settings").upsert({ id: 1 }, { onConflict: "id" });

  res.status(201).json({ ok: true, message: "Admin pertama berhasil dibuat. Endpoint setup sekarang terkunci. Silakan login di /login.", username });
});

// =====================================================================
// AUTH API
// =====================================================================
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  const users = await readAll("users");
  const user = users.find((u) => u.username === username);
  if (!user || user.status !== "active") {
    return res.status(401).json({ error: "Username atau password salah." });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  user.last_login = new Date().toISOString();
  await writeAll("users", users);

  // Regenerasi session ID setelah kredensial valid untuk mencegah session fixation.
  // Simpan session terlebih dahulu sebelum mengirim response agar redirect tidak
  // terjadi sebelum cookie/session benar-benar tersimpan di browser.
  req.session.regenerate(async (sessionErr) => {
    if (sessionErr) {
      console.error("Gagal membuat session login:", sessionErr);
      return res.status(500).json({ error: "Login berhasil diverifikasi, tetapi sesi gagal dibuat. Silakan coba lagi." });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    await logActivity({ userId: user.id, username: user.username, role: user.role, action: "login", req });

    const redirectMap = { reseller: "/dashboard", admin_panel: "/dashboard", admin_web: "/web-admin" };

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("Gagal menyimpan session login:", saveErr);
        return res.status(500).json({ error: "Sesi login gagal disimpan. Silakan coba lagi." });
      }

      res.json({ ok: true, role: user.role, redirect: redirectMap[user.role] });
    });
  });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const u = req.session.user;
  await logActivity({ userId: u.id, username: u.username, role: u.role, action: "logout", req });
  req.session.destroy(() => {
    res.clearCookie("kairoo.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const users = await readAll("users");
  const user = users.find((u) => u.id === req.session.user.id);
  if (!user) return res.status(401).json({ error: "Sesi tidak valid." });
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    last_login: user.last_login,
  });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: "Password minimal 8 karakter." });
  }
  const users = await readAll("users");
  const user = users.find((u) => u.id === req.session.user.id);
  if (!user) return res.status(401).json({ error: "Sesi tidak valid." });

  user.password_hash = await bcrypt.hash(new_password, 12);
  user.updated_at = new Date().toISOString();
  await writeAll("users", users);

  await logActivity({ userId: user.id, username: user.username, role: user.role, action: "change_password", req });
  res.json({ ok: true });
});

// =====================================================================
// PANEL API (reseller & admin_panel)
// =====================================================================
const VALID_RAM = ["1gb", "2gb", "3gb", "4gb", "5gb", "6gb", "7gb", "8gb", "9gb", "10gb", "unlimited"];

app.post("/api/panels/create", requireAuth, requireRole("reseller", "admin_panel"), createPanelLimiter, async (req, res) => {
  const { name, ram } = req.body || {};
  const user = req.session.user;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Nama panel wajib diisi." });
  }
  if (!ram || !VALID_RAM.includes(ram)) {
    return res.status(400).json({ error: "Pilihan RAM tidak valid." });
  }

  if (creatingLock.has(user.id)) {
    return res.status(429).json({ error: "Masih ada proses pembuatan panel yang berjalan." });
  }
  creatingLock.add(user.id);

  const panels = await readAll("panels");
  const recordId = uuid();

  // Username Pterodactyl mengikuti Nama Panel yang diketik reseller (bukan acak).
  // Hanya password yang acak, diawali "kairo".
  let generatedUsername = usernameFromName(name);
  const existingUsernames = new Set(panels.map((p) => p.pterodactyl_username));
  if (existingUsernames.has(generatedUsername)) {
    const base = generatedUsername;
    let suffix = 2;
    while (existingUsernames.has(`${base}${suffix}`)) suffix++;
    generatedUsername = `${base}${suffix}`;
  }
  const generatedPassword = randomPassword(14, "kairo");

  const baseRecord = {
    id: recordId,
    created_by: user.id,
    created_by_username: user.username,
    created_by_role: user.role,
    panel_name: name.trim(),
    pterodactyl_username: generatedUsername,
    encrypted_password: encrypt(generatedPassword),
    ram,
    panel_url: null,
    pterodactyl_user_id: null,
    pterodactyl_server_id: null,
    status: "processing",
    error_message: null,
    created_at: new Date().toISOString(),
  };
  panels.push(baseRecord);
  await writeAll("panels", panels);

  try {
    const ptUser = await pterodactyl.createUser({
      username: generatedUsername,
      email: `${generatedUsername}@kairoo.local`,
      password: generatedPassword,
    });
    const ptServer = await pterodactyl.createServer({
      name: name.trim(),
      userId: ptUser.id,
      ram,
    });

    const panelsAfter = await readAll("panels");
    const rec = panelsAfter.find((p) => p.id === recordId);
    rec.status = "success";
    rec.pterodactyl_user_id = ptUser.id;
    rec.pterodactyl_server_id = ptServer.id;
    rec.panel_url = `${await pterodactyl.getDomain()}/server/${ptServer.identifier}`;
    await writeAll("panels", panelsAfter);

    await logActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      action: "create_panel",
      metadata: { panel_name: name.trim(), ram, status: "success" },
      req,
    });

    res.json({
      ok: true,
      status: "success",
      panel: {
        name: rec.panel_name,
        username: generatedUsername,
        password: generatedPassword, // hanya ditampilkan SEKALI saat berhasil dibuat
        ram,
        panel_url: rec.panel_url,
      },
    });
  } catch (err) {
    const panelsAfter = await readAll("panels");
    const rec = panelsAfter.find((p) => p.id === recordId);
    rec.status = "failed";

    let message = "Gagal membuat server Pterodactyl.";
    if (err.code === "PTERODACTYL_NOT_CONFIGURED") {
      message = "Domain / PTLA Pterodactyl belum diatur. Atur dulu di menu Pengaturan.";
    } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      message = "Server Pterodactyl tidak dapat dihubungi. Periksa domain panel dan koneksi server.";
    } else if (err.code === "INVALID_ENVIRONMENT_JSON" || err.code === "PTERODACTYL_EGG_CONFIG_INVALID") {
      message = err.message;
    } else if (err.config && err.config.url && err.config.url.includes("/users")) {
      message = "Gagal membuat akun Pterodactyl.";
    } else if (err.response?.status === 401 || err.response?.status === 403) {
      message = "PTLA ditolak Pterodactyl. Pastikan Application API Key benar dan memiliki permission yang diperlukan.";
    } else if (err.response?.status === 422) {
      const detail = Array.isArray(err.response?.data?.errors)
        ? err.response.data.errors.map((e) => e.detail || e.code).filter(Boolean).join(" | ")
        : "Data server ditolak Pterodactyl.";
      message = `Pterodactyl menolak pembuatan server: ${detail}`;
    }
    rec.error_message = message;
    await writeAll("panels", panelsAfter);

    await logActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      action: "create_panel",
      metadata: { panel_name: name.trim(), ram, status: "failed" },
      req,
    });

    res.status(502).json({ ok: false, status: "failed", error: message });
  } finally {
    creatingLock.delete(user.id);
  }
});

app.get("/api/panels", requireAuth, requireRole("reseller", "admin_panel"), async (req, res) => {
  const panels = (await readAll("panels")).filter((p) => p.created_by === req.session.user.id);
  res.json(
    panels
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((p) => ({
        id: p.id,
        panel_name: p.panel_name,
        ram: p.ram,
        status: p.status,
        panel_url: p.panel_url,
        created_at: p.created_at,
        error_message: p.error_message,
      }))
  );
});

app.get("/api/panels/:id", requireAuth, requireRole("reseller", "admin_panel"), async (req, res) => {
  const panel = (await readAll("panels")).find((p) => p.id === req.params.id && p.created_by === req.session.user.id);
  if (!panel) return res.status(404).json({ error: "Panel tidak ditemukan." });
  res.json({
    id: panel.id,
    panel_name: panel.panel_name,
    ram: panel.ram,
    status: panel.status,
    panel_url: panel.panel_url,
    created_at: panel.created_at,
  });
});

// =====================================================================
// ADMIN WEB — ACCOUNTS
// =====================================================================
app.post("/api/admin/accounts", requireAuth, requireRole("admin_web"), async (req, res) => {
  const { username, role, password, mode } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: "Username wajib diisi." });
  }
  if (!["reseller", "admin_panel"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid." });
  }
  const users = await readAll("users");
  if (users.some((u) => u.username === username)) {
    return res.status(400).json({ error: "Username sudah digunakan." });
  }

  const finalPassword = mode === "manual" && password ? password : randomPassword(12);
  const hash = await bcrypt.hash(finalPassword, 12);

  const newUser = {
    id: uuid(),
    username: username.trim(),
    password_hash: hash,
    role,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_login: null,
  };
  users.push(newUser);
  await writeAll("users", users);

  await logActivity({
    userId: req.session.user.id,
    username: req.session.user.username,
    role: "admin_web",
    action: "create_account",
    metadata: { target: username, role },
    req,
  });

  res.json({
    ok: true,
    username: newUser.username,
    password: finalPassword,
    role: newUser.role.toUpperCase(),
  });
});

app.get("/api/admin/accounts", requireAuth, requireRole("admin_web"), async (req, res) => {
  const users = (await readAll("users")).filter((u) => u.role !== "admin_web");
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
      last_login: u.last_login,
    }))
  );
});

app.patch("/api/admin/accounts/:id", requireAuth, requireRole("admin_web"), async (req, res) => {
  const users = await readAll("users");
  const target = users.find((u) => u.id === req.params.id);
  if (!target || target.role === "admin_web") {
    return res.status(404).json({ error: "Akun tidak ditemukan." });
  }
  const { status, role, new_password } = req.body || {};

  if (status && ["active", "disabled"].includes(status)) target.status = status;
  if (role && ["reseller", "admin_panel"].includes(role)) target.role = role;
  if (new_password) target.password_hash = await bcrypt.hash(new_password, 12);
  target.updated_at = new Date().toISOString();

  await writeAll("users", users);
  await logActivity({
    userId: req.session.user.id,
    username: req.session.user.username,
    role: "admin_web",
    action: "update_account",
    metadata: { target: target.username, changes: req.body },
    req,
  });
  res.json({ ok: true });
});

app.delete("/api/admin/accounts/:id", requireAuth, requireRole("admin_web"), async (req, res) => {
  const users = await readAll("users");
  const target = users.find((u) => u.id === req.params.id);
  if (!target || target.role === "admin_web") {
    return res.status(404).json({ error: "Akun tidak ditemukan." });
  }
  const remaining = users.filter((u) => u.id !== req.params.id);
  await writeAll("users", remaining);
  await logActivity({
    userId: req.session.user.id,
    username: req.session.user.username,
    role: "admin_web",
    action: "delete_account",
    metadata: { target: target.username },
    req,
  });
  res.json({ ok: true });
});

// =====================================================================
// ADMIN WEB — STATS / MONITORING / PANEL LOGS
// =====================================================================
app.get("/api/admin/stats", requireAuth, requireRole("admin_web"), async (req, res) => {
  const users = await readAll("users");
  const panels = await readAll("panels");
  const today = new Date().toISOString().slice(0, 10);

  const perDay = {};
  const perRam = {};
  const perRole = {};
  panels.forEach((p) => {
    const day = p.created_at.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
    perRam[p.ram] = (perRam[p.ram] || 0) + 1;
    perRole[p.created_by_role] = (perRole[p.created_by_role] || 0) + 1;
  });

  res.json({
    total_reseller: users.filter((u) => u.role === "reseller").length,
    total_admin_panel: users.filter((u) => u.role === "admin_panel").length,
    total_panel: panels.length,
    panel_hari_ini: panels.filter((p) => p.created_at.slice(0, 10) === today).length,
    panel_berhasil: panels.filter((p) => p.status === "success").length,
    panel_gagal: panels.filter((p) => p.status === "failed").length,
    user_aktif: users.filter((u) => u.status === "active" && u.role !== "admin_web").length,
    chart_per_hari: perDay,
    chart_per_ram: perRam,
    chart_per_role: perRole,
  });
});

app.get("/api/admin/monitoring", requireAuth, requireRole("admin_web"), async (req, res) => {
  const { user, role, action, date } = req.query;
  let logs = (await readAll("logs")).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (user) logs = logs.filter((l) => l.username?.toLowerCase().includes(String(user).toLowerCase()));
  if (role) logs = logs.filter((l) => l.role === role);
  if (action) logs = logs.filter((l) => l.action === action);
  if (date) logs = logs.filter((l) => l.created_at.slice(0, 10) === date);

  res.json(logs.slice(0, 300));
});

app.get("/api/admin/panel-logs", requireAuth, requireRole("admin_web"), async (req, res) => {
  const panels = (await readAll("panels")).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(
    panels.map((p) => ({
      id: p.id,
      user: p.created_by_username,
      role: p.created_by_role,
      panel_name: p.panel_name,
      ram: p.ram,
      pterodactyl_username: p.pterodactyl_username,
      panel_password: p.status === "success" ? decrypt(p.encrypted_password) : null,
      panel_url: p.panel_url,
      server_id: p.pterodactyl_server_id,
      status: p.status,
      error_message: p.error_message,
      created_at: p.created_at,
    }))
  );
});

// =====================================================================
// ADMIN WEB — PENGATURAN PTERODACTYL (domain, PTLA, PTLC) — REAL-TIME
// Tersimpan terenkripsi di data/settings.json, langsung dipakai backend
// saat request berikutnya, TANPA perlu edit .env / restart server.
// =====================================================================
app.get("/api/admin/settings", requireAuth, requireRole("admin_web"), async (req, res) => {
  res.json(await settingsStore.getConfigForEdit());
});

app.post("/api/admin/settings", requireAuth, requireRole("admin_web"), async (req, res) => {
  const { domain, ptla, ptlc } = req.body || {};

  if (domain) {
    try {
      const u = new URL(domain);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol");
    } catch {
      return res.status(400).json({ error: "Domain tidak valid. Contoh: https://panel.domainanda.com" });
    }
  }

  const updated = await settingsStore.updateConfig({ domain, ptla, ptlc, updatedBy: req.session.user.username });

  await logActivity({
    userId: req.session.user.id,
    username: req.session.user.username,
    role: "admin_web",
    action: "update_settings",
    metadata: { domain: updated.domain, ptla_changed: !!ptla, ptlc_changed: !!ptlc },
    req,
  });

  res.json({ ok: true, settings: updated });
});

app.post("/api/admin/settings/test", requireAuth, requireRole("admin_web"), async (req, res) => {
  try {
    await pterodactyl.testConnection();
    res.json({ ok: true, message: "Koneksi ke Pterodactyl berhasil." });
  } catch (err) {
    let message = "Koneksi gagal.";
    if (err.code === "PTERODACTYL_NOT_CONFIGURED") message = "Domain / PTLA belum diatur.";
    else if (err.response?.status === 401 || err.response?.status === 403) message = "PTLA ditolak (key salah / tidak punya akses).";
    else if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") message = "Domain tidak dapat dihubungi.";
    res.status(400).json({ ok: false, error: message });
  }
});

// =====================================================================
// HALAMAN (CLEAN URL — TIDAK ADA .html DI LINK)
// File .html disimpan di /views (di luar folder static /public) sehingga
// TIDAK PERNAH bisa diakses langsung via /login.html dst.
// =====================================================================
function page(file) {
  return (req, res) => res.sendFile(path.join(VIEWS, file));
}

app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const map = { reseller: "/dashboard", admin_panel: "/dashboard", admin_web: "/web-admin" };
  res.redirect(map[req.session.user.role] || "/login");
});

app.get("/login", (req, res) => {
  if (req.session.user) {
    const map = { reseller: "/dashboard", admin_panel: "/dashboard", admin_web: "/web-admin" };
    return res.redirect(map[req.session.user.role]);
  }
  page("login.html")(req, res);
});

app.get("/dashboard", requireRole("reseller", "admin_panel"), page("dashboard.html"));
app.get("/panel-admin", requireRole("admin_panel"), page("panel-admin.html"));
app.get("/profile", requireAuth, page("profile.html"));

app.get("/web-admin", requireRole("admin_web"), page("web-admin.html"));
app.get("/web-admin/accounts", requireRole("admin_web"), page("web-admin-accounts.html"));
app.get("/web-admin/monitoring", requireRole("admin_web"), page("web-admin-monitoring.html"));
app.get("/web-admin/panel-logs", requireRole("admin_web"), page("web-admin-panel-logs.html"));
app.get("/web-admin/settings", requireRole("admin_web"), page("web-admin-settings.html"));

// Redirect setiap percobaan akses *.html langsung ke versi bersihnya
app.get(/^(.*)\.html$/, (req, res) => {
  res.redirect(301, req.params[0]);
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(VIEWS, "404.html"));
});

// jangan bocorkan stack trace
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Kairoo Panel Manager jalan di http://localhost:${PORT}`));
}
