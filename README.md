# JogjaStay — Hotel Service DIY (Cloudflare Workers + D1)

**Versi migrasi dari Hotel Service yang dibuat oleh Ai untuk tim Hotel (Azis + Ai).** Frontend dari kode Ai tetap digunakan. Backend Express + `better-sqlite3` lokal **diadaptasi menjadi native Cloudflare Worker + D1** sehingga website serta API bisa diakses saat laptop dimatikan. Bukan sekadar ZIP Express yang diunggah ke Workers.

> **PROTOTIPE AKADEMIK, BUKAN LAYANAN PEMESANAN HOTEL KOMERSIAL.** Semua katalog, harga, stok kamar, reservasi, pembayaran, refund, dan invoice adalah contoh untuk penilaian kuliah; sebagian nama penginapan menyerupai hotel nyata, tetapi tidak menunjukkan kemitraan atau tarif resmi. Jangan melakukan transfer atau mengisi data kartu sebenarnya. Hindari penggunaan data pribadi pengunjung sungguhan dalam demonstrasi.

## Fitur dan hasil pengecekan

- 50 entri penginapan: masing-masing **10** Kota Yogyakarta, Sleman, Bantul, Gunungkidul, dan Kulon Progo.
- 101 tipe kamar, filter wilayah, ketersediaan berdasarkan tanggal, maksimum 30 malam.
- Booking tamu, kode akses privat berbasis token acak, riwayat tamu, pembayaran/refund **simulasi**.
- Login admin/resepsionis menggunakan session HttpOnly/Secure + PBKDF2, pembatasan percobaan login, CRUD hotel/kamar, check-in/out, log aktivitas.
- Bearer token partner, rotasi token dari dashboard, booking idempotent lewat `Idempotency-Key`, Swagger UI interaktif lokal + OpenAPI JSON.
- Endpoint Hotel → Wisata untuk interoperabilitas horizontal; baru berfungsi setelah URL dan kontrak API asli tim Wisata dikonfigurasi.
- Dukungan webhook HMAC opsional jika `WEBHOOKS_ENABLED=true`, tidak aktif otomatis.
- **Tidak ada SMTP/Nodemailer atau pengiriman email otomatis pada versi Cloudflare**. Cloudflare Workers bukan server SMTP biasa. Jika email dibutuhkan untuk demo akhir, gunakan provider API email dengan integrasi tersendiri setelah konfigurasi yang disetujui tim.
- Webhook dan HTTP Worker produksi harus diuji lagi setelah deployment; pengujian lokal di repo memakai emulator API D1 berbasis `node:sqlite`.

## Cara deploy — tanpa hosting berbayar

Persyaratan: macOS, Node.js 22, akun Cloudflare yang dapat memakai Workers Free + D1. Free tier memiliki batas kuota; gunakan untuk tugas kuliah, bukan traffic produksi. **Jangan gunakan Quick Tunnel** untuk deployment permanen.

### Opsi cepat: wizard deployment

Jalankan di **folder proyek hasil ekstrak** (bukan folder proyek Node.js lama):

```bash
npm install
node tools/deploy.mjs
```

Wizard akan menjalankan tes, membuka login Cloudflare, membuat D1, meminta kamu menempel **database_id** yang baru muncul, mengimpor 50 hotel demo, menyimpan password admin lewat prompt Wrangler, dan deploy Worker. Ini tidak mengharuskan menempel password dalam chat. Saat Wrangler menanyakan apakah menambahkan binding D1 otomatis, **pilih No**.

Gunakan opsi manual berikut kalau ingin melihat setiap langkahnya atau wizard terhenti.

### Langkah 1: Siapkan proyek

1. Ekstrak ZIP dan buka folder **JogjaStay_Cloudflare_Workers_D1** menggunakan VS Code.
2. Di terminal folder ini, jalankan:

   ```bash
   npm install
   npm test
   npx wrangler login
   ```

### Langkah 2: Buat database D1

Jalankan sekali saja:

```bash
npx wrangler d1 create jogjastay-db
```

Saat Wrangler menawarkan menambahkan database ke konfigurasi, pilih **No** (file sudah punya blok D1). Catat `database_id` berbentuk UUID yang muncul; ganti string `REPLACE_WITH_D1_DATABASE_ID` di `wrangler.jsonc` dengan UUID tersebut. **Binding harus tetap bernama `DB`**.

### Langkah 3: Isi database baru (hanya sekali)

Pastikan D1 **baru masih kosong**. Jangan menjalankan seed pada database yang sudah berisi booking:

```bash
npx wrangler d1 execute jogjastay-db --remote --file=./db/schema.sql
npx wrangler d1 execute jogjastay-db --remote --file=./db/seed.sql
npx wrangler d1 execute jogjastay-db --remote --command="SELECT city,COUNT(*) jumlah FROM hotels GROUP BY city;"
```

Hasil harus menampilkan lima baris, masing-masing `jumlah = 10`.

### Langkah 4: Simpan password sebagai secret

Jalankan:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Saat diminta nilainya, isi **password kuat minimal 12 karakter** dan simpan di password manager. Jangan ketik password dalam perintah, `.env` yang ikut di-commit, atau chat. Akun pertama ber-username **`admin`**; dibuat otomatis pada login pertama jika database masih belum memiliki akun.

Opsional untuk akun resepsionis (username `receptionist`):

```bash
npx wrangler secret put STAFF_PASSWORD
```

*Rahasia hanya disimpan di dashboard Cloudflare, tidak dalam ZIP.* Jika sistem menampilkan peringatan Worker belum ada ketika memasang secret, lakukan `npx wrangler deploy` sekali dulu, lalu pasang secret dan deploy ulang.

### Langkah 5: Deployment

```bash
npx wrangler deploy
```

Catat URL `https://jogjastay-hotel-service.<subdomain>.workers.dev` yang **betul-betul muncul di terminal**. Jangan mengarang subdomain.

Buka URL ini dan tes:

- `/` — website katalog.
- `/health` — API dan jumlah data.
- `/api/v1/regions` — jumlah hotel per wilayah.
- `/api/docs` dan `/api/openapi.json` — API untuk tim Itinerary.
- `/login` — admin pertama.

Setelah login, buka dashboard → Integrasi API → Rotate Token partner; simpan token yang muncul sekali. **Berikan hanya kepada backend Itinerary Yogyakarta**, bukan menaruhnya dalam frontend atau repository.

### Langkah 6: Uji booking sungguhan dalam database demo

Buat booking dengan nama tamu fiktif pada website, salin kode booking dan kode akses privat. Tes pengecekan booking, catatan pembayaran demo, pembatalan demo, dan akses admin untuk melihat statusnya. Buka URL tersebut dari iPhone ketika laptop mati untuk memastikan persistensi.

### Integrasi langsung Hotel → Wisata

Saat endpoint asli tim Wisata siap, isi di `wrangler.jsonc`:

```json
"vars": {
  "WISATA_API_BASE_URL": "https://URL-WISATA-ASLI.vercel.app",
  "WISATA_DESTINATIONS_PATH": "/api/destinations"
}
```

Gunakan URL HTTPS dan path yang benar-benar disepakati. Kemudian `npx wrangler deploy`. Jika API memerlukan token privat, jalankan `npx wrangler secret put WISATA_API_TOKEN`. GET `/api/v1/hotels/H01/recommendations` harus menampilkan data dari Wisata Service, bukan fallback statis. Sebelum konfigurasi, server sengaja membalas `503 WISATA_UNCONFIGURED` — ini **bukan kerusakan booking**.

### Kontrak API untuk bundling Itinerary

- GET `/api/v1/regions` — kode wilayah/label.
- GET `/api/v1/hotels?city=Gunungkidul` — daftar hotel.
- GET `/api/v1/rooms?city=Gunungkidul&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` — kamar, harga, unit tersedia.
- GET `/api/v1/hotels/H01/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`.
- POST `/api/v1/hotel-bookings` — buat booking; kirim `Authorization: Bearer TOKEN_PARTNER` **dari backend aggregator** dan `Idempotency-Key` unik untuk retry.
- GET `/api/v1/partner/bookings` — daftar booking partner itu saja.
- GET/POST/DELETE `/api/v1/hotel-bookings/{id}` — baca/bayar/cancel booking milik partner.

Status dan total biaya paket di Itinerary harus mengikuti hasil API tiap subsistem, bukan menjadikan satu klik sukses bila salah satu API gagal.

## Keamanan dan pengelolaan data

- **Tidak pernah upload** database lama dari laptop, folder `node_modules`, kredensial `.env`, cookie sesi, ataupun data booking 6 pelanggan dari ZIP lama. Seed yang disertakan berisi **katalog demo saja**.
- Pembayaran/refund **tidak mengirim uang sungguhan**. API mempertahankan riwayat demo di D1 antar deploy.
- Gunakan password kuat yang berbeda dari akun lain, putar token partner bila terungkap, dan jangan bagikan hasil request yang menampilkan `accessToken` booking.
- Untuk integrasi lintas-origin di browser, gunakan backend aggregator sebagai perantara API dan simpan token partner di secrets. Pengaturan `CORS_ALLOWED_ORIGINS` default tidak membuka akses lintas situs.
- Hindari mengganti D1 `database_id` saat redeploy; itu akan memindahkan aplikasi ke database yang berbeda.
- Jika sudah ada data demo penting, ekspor backup D1 sebelum melakukan migrasi skema.

## Keterbatasan dan status QA

Lihat `HASIL_QA.md`. Tes `npm test` menjalankan Node built-in test runner dengan emulator D1 berbasis SQLite bawaan Node v22. **Tes tersebut tidak menggantikan pengujian dengan `wrangler dev` dan deployment sungguhan**. Di lingkungan pembuatan paket ini, npm registry eksternal tidak dapat diakses, sehingga `wrangler` tidak dapat dipasang/dijalankan dan Cloudflare akun milik pengguna tidak dapat diakses. Status deployment produksi: **menunggu pengguna menjalankan perintah di atas**.


## Integrasi Semantik Hotel–Wisata

Baca `SEMANTIK_HOTEL_WISATA.md` untuk kamus alias wilayah, transformasi antar-API, status bisnis yang tidak boleh disamakan, dan langkah deploy aman ke Worker yang sudah ada. Sumber terminologi `ontology/semantic-vocabulary.json` dan SKOS/RDF `ontology/diy-semantic.ttl`.
