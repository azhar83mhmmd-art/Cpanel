# Kairoo Panel Manager — Panel Create Fix

Perbaikan utama pada versi ini:

- Create panel tidak lagi memakai `readAll + writeAll` untuk tabel `panels` pada alur kritis. Setiap panel diinsert/update satu row langsung ke Supabase.
- Log aktivitas memakai insert langsung sehingga request Vercel yang bersamaan tidak saling menimpa snapshot database.
- Pencarian Nest/Egg/Location Pterodactyl dipercepat dengan request paralel dan cache 5 menit.
- Egg terpilih diambil ulang dengan `include=variables` agar environment Egg tidak kosong pada panel Pterodactyl tertentu.
- Timeout Pterodactyl dibuat jelas dan dapat diatur lewat `PTERODACTYL_TIMEOUT_MS`.
- ID user Pterodactyl disimpan segera setelah user berhasil dibuat.
- Timeout setelah create server tidak otomatis di-retry untuk mencegah server ganda.
- Ditambahkan endpoint rekonsiliasi untuk menemukan server yang sebenarnya sudah dibuat tetapi response-nya hilang/timeout.
- Frontend mencoba rekonsiliasi otomatis saat koneksi Vercel terputus atau backend mengembalikan status `processing`.
- Vercel Function diberi `maxDuration: 60`.
- Error Pterodactyl 401/403/409/422 dan network timeout diterjemahkan menjadi pesan yang lebih jelas.

## Deploy

1. Upload/deploy project ini ke Vercel.
2. Pastikan environment variables Supabase dan `PANEL_SECRET` sudah benar.
3. Pastikan `PTERODACTYL_URL`/pengaturan Domain dan PTLA benar.
4. Di halaman Admin → Pengaturan, gunakan tombol test koneksi.
5. Buat satu panel percobaan.
6. Jika request timeout, **jangan klik Buat Panel berulang kali**. Buka Riwayat Panel dan tunggu proses rekonsiliasi.

`PTLC` tidak dipakai untuk create server Application API. Simpan PTLC tetap aman untuk fitur panel/client API yang memang membutuhkannya.
