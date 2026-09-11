# Kairoo Panel Manager — Vercel + Supabase

Project ini sudah diubah dari penyimpanan JSON lokal menjadi Supabase dan menggunakan session store Supabase sehingga cocok untuk environment serverless Vercel.

## 1. Buat database Supabase
1. Buat project di Supabase.
2. Buka SQL Editor.
3. Jalankan seluruh isi `supabase/schema.sql`.

## 2. Install & test lokal
```bash
npm install
cp .env.example .env
# isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, PANEL_SECRET
npm run seed
npm start
```

## 3. Deploy ke Vercel
Import repository/project ini ke Vercel. Root directory adalah folder yang berisi `package.json` dan `server.js`.

Tambahkan Environment Variables di Vercel:
- `NODE_ENV=production`
- `SESSION_SECRET`
- `PANEL_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- variable Pterodactyl sesuai kebutuhan
- `MAX_CREATE_PER_MINUTE`
- `MAX_LOGIN_PER_MINUTE`

Jangan expose `SUPABASE_SERVICE_ROLE_KEY` sebagai variable `NEXT_PUBLIC_*` atau mengirimnya ke browser.

## 4. Seed admin
Setelah schema dan environment siap:
```bash
npm run seed
```
Untuk production lebih aman jalankan seed dari lokal dengan environment Supabase yang sama, atau gunakan Supabase SQL/CLI sesuai workflow kamu.

## 5. Migrasi data lama
Jika sebelumnya ada `data/users.json`, `data/panels.json`, dan `data/logs.json`, letakkan file lama di folder `data/` lalu jalankan:
```bash
npm run migrate
```

## Catatan penting
- Pterodactyl tetap harus berjalan di server/node terpisah. Vercel hanya menjalankan Kairoo Store/manager.
- PTLA/PTLC disimpan terenkripsi di Supabase menggunakan `PANEL_SECRET`.
- `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai server-side.
- File JSON tidak lagi menjadi database production.


## Konfigurasi Pterodactyl minimal
Kairoo Store hanya membutuhkan tiga Environment Variables Pterodactyl:

```env
PTERODACTYL_URL=https://panel.domainanda.com
PTERODACTYL_PTLA=ptla_xxxxx
PTERODACTYL_PTLC=ptlc_xxxxx
```

Nest, Egg, Location, Docker image, startup, dan environment server dideteksi otomatis dari Pterodactyl API.
