# CPANEL KAIROO STORE — Panel Manager

Website manajemen reseller panel Pterodactyl. Stack: **Node.js + Express** (backend) dan **HTML/CSS/JS murni** (frontend, tanpa framework). Penyimpanan data pakai file JSON (`/data`) — tidak perlu install database.

## Fitur
- 3 role: **Reseller**, **Admin Panel**, **Admin Web**
- Reseller & Admin Panel: buat panel Pterodactyl otomatis (pilih nama + RAM 1–10GB/unlimited), lihat riwayat panel
- Admin Web: kelola akun (buat/nonaktifkan/hapus), dashboard statistik, monitoring log aktivitas, log semua panel (dengan kredensial terenkripsi)
- **Menu Pengaturan (Admin Web): ubah Domain, PTLA, PTLC langsung dari dashboard** — field-nya sama persis seperti kolom biasa (nilai asli tampil, bisa dikosongkan/dihapus langsung), tersimpan terenkripsi, langsung aktif tanpa edit `.env` / restart server, ada tombol Test Koneksi
- **Halaman login: "Tidak mempunyai akses login? Klik di sini"** — buka modal, isi Nama/Username/Role, otomatis buka WhatsApp ke nomor admin dengan pesan permintaan akses yang sudah terformat
- **Saat Admin Web membuat akun**, pesan siap-kirim bergaya WhatsApp (kredensial + info keamanan) otomatis dibuatkan dan tinggal disalin
- Login session-based, password di-hash (bcrypt)
- Session login dibuat ulang dan disimpan sebelum redirect agar tidak terjadi relog setelah klik MASUK
- Cookie session menggunakan `secure: "auto"` sehingga aman untuk HTTPS production dan tetap berfungsi saat testing lewat HTTP/localhost
- **URL bersih tanpa `.html`** — contoh `/login`, `/dashboard`, `/web-admin/accounts`
- Tampilan modern: dark theme dengan aksen biru-cyan (senada logo), font Space Grotesk + Inter, **ikon SVG** di seluruh sidebar/tombol (tanpa emoji)
- Logo "Kairoo Store" tampil di halaman login (branding utama) dan di sidebar semua halaman internal

## Cara menjalankan
```bash
npm install
cp .env.example .env
# edit .env: isi PTERODACTYL_URL, PTERODACTYL_PTLA, NEST_ID, EGG_ID, dst.
node seed.js      # membuat akun admin_web pertama (superadmin / ChangeMe123!)
npm start
```
Buka `http://localhost:3000` — otomatis diarahkan ke `/login`.

⚠️ **Segera ganti password default `superadmin` setelah login pertama kali**, lewat menu Profil.

## Kenapa link tidak ada `.html`-nya?
Semua file `.html` disimpan di folder `/views`, **bukan** di folder `/public` yang di-serve sebagai static. Setiap halaman didaftarkan manual lewat route Express, misalnya:
```js
app.get("/login", ...)          // -> mengirim views/login.html
app.get("/dashboard", ...)      // -> mengirim views/dashboard.html
app.get("/web-admin/accounts", ...)
```
Jadi URL yang muncul di browser selalu bersih (`/login`, bukan `/login.html`), dan mengetik `sesuatu.html` langsung akan di-redirect otomatis ke versi tanpa `.html`.

## Struktur folder
```
kairoo-panel/
├── server.js                 # semua route halaman + API
├── seed.js                   # buat akun admin_web pertama
├── middleware/auth.js        # cek login & role
├── services/pterodactyl.js   # semua panggilan ke Pterodactyl Application API
├── utils/db.js               # baca/tulis data/*.json
├── utils/crypto.js           # enkripsi password panel + generator username/password
├── views/                    # semua halaman .html (TIDAK bisa diakses langsung)
├── public/
│   ├── css/style.css
│   ├── js/*.js
│   └── assets/logo.png       # logo Kairoo Store
└── data/                     # users.json, panels.json, logs.json (dibuat otomatis)
```

## Catatan Pterodactyl
- **Domain, PTLA, PTLC**: atur lewat dashboard Admin Web → menu **Pengaturan**. Field-nya berperilaku sama seperti field form biasa — isi baru langsung dipakai, dikosongkan lalu disimpan berarti benar-benar dihapus. Tersimpan terenkripsi di `data/settings.json` (bukan di `.env`), dan langsung dipakai backend request berikutnya — tidak perlu restart server. Nilai di `.env` hanya fallback awal sebelum pernah diisi lewat dashboard.
- `PTERODACTYL_NEST_ID` / `PTERODACTYL_EGG_ID` / `PTERODACTYL_DOCKER_IMAGE` / `PTERODACTYL_STARTUP` masih lewat `.env` (belum ada di dashboard) — wajib disesuaikan dengan egg yang dipakai (lihat di Admin Area Pterodactyl kamu, menu Nests).

## Nomor WhatsApp admin (permintaan akses)
Nomor tujuan tombol "Tidak mempunyai akses login? Klik di sini" di halaman login diatur di:
`public/js/wa-request.js` → konstanta `WA_ADMIN_NUMBER` (format internasional tanpa `+`, contoh `6282357961890`).
- `PTERODACTYL_LOCATION_ID` dipakai untuk auto-deploy alokasi (server otomatis ambil IP:Port yang tersedia di lokasi tersebut).
- Mapping RAM → limit ada di `services/pterodactyl.js` fungsi `ramToLimits()` — silakan sesuaikan disk/cpu per GB sesuai kebutuhan bisnismu.

## Upgrade ke database sungguhan
Implementasi saat ini pakai file JSON supaya mudah dijalankan tanpa setup tambahan. Kalau traffic sudah besar, ganti `utils/db.js` dengan koneksi PostgreSQL/MySQL (atau Prisma) — struktur data (`users`, `panels`, `logs`) sudah dirancang supaya gampang dipetakan ke tabel SQL.
