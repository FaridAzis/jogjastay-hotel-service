# Hasil QA — Hotel Service Cloudflare (19 November 2026)

Sumber: migrasi UI dari Hotel Service Ai, backend baru Cloudflare Worker + D1, dataset demo SQL dari ZIP terakhir.

## Yang sudah diverifikasi di lingkungan lokal

- `node --check src/worker.mjs` dan `src/logic.mjs`: sintaks valid.
- `node --test test/hotel.test.mjs`: **18/18 test lulus** pada emulator binding D1 menggunakan Node.js built-in `node:sqlite`.
- SQL schema dan seed dapat dijalankan di SQLite lokal; jumlah 50 entri di 5 wilayah, masing-masing 10.
- Skenario yang diuji: validasi wilayah/tanggal; katalog dan kamar; ketersediaan; buat booking; perlindungan akses; pembayaran & refund demo; login staf dan session; dashboard; partner auth dan ownership; pengaturan token; CRUD; idempotency; cross-origin policy; pengembalian error saat Wisata belum dikonfigurasi.

## Belum diverifikasi

- **Deploy `wrangler` aktual ke Cloudflare Worker dan menjalankan query pada D1 remote** (akses ke akun Cloudflare pengguna belum tersedia).
- Rendering visual frontend menggunakan browser terhadap URL Worker aktual.
- Perilaku Workers Free CPU 10 ms, serta batas kuota D1 saat traffic nyata.
- Integrasi dengan API Wisata asli (belum ada URL/kontrak yang dikonfirmasi).
- Transport dan Itinerary Yogyakarta belum termasuk dalam paket Hotel.
- Gmail SMTP/email otomatis **tidak dibawa ke runtime Workers** dan tidak boleh diklaim aktif.
- Webhook end-to-end terhadap endpoint pihak lain belum diuji (opsional/nonaktif default).

## Kriteria finalisasi di Cloudflare

1. Deployment Workers sukses; `/health` mengembalikan `status: ok` dan 50 hotel.
2. 5 wilayah memiliki masing-masing >=10 hotel di `/api/v1/regions`.
3. Website dan `/api/docs` dapat dibuka di ponsel dan laptop.
4. Booking demo berhasil disimpan; reload dan restart/redeploy tidak menghilangkannya.
5. Header `X-Booking-Token` yang salah ditolak; token benar bisa membaca booking.
6. Login admin, CRUD, cek booking, dan status pembayaran demo berfungsi.
7. Rotasi token partner, booking partner, dan pembatasan booking berdasarkan source berfungsi.
8. Saat API Wisata tersedia, rekomendasi dikembalikan dari sumber aslinya.

**Catatan:** Hasil tes emulator tidak setara dengan pengujian production di Cloudflare. Jangan menyatakan semua fitur online telah lulus sebelum checklist di atas selesai.
