# Instalasi konektor Hotel ↔ Wisata Vercel (19 November 2026)

## Yang sudah disesuaikan

- `wrangler.jsonc` menggunakan **Worker yang sama**: `jogjastay-hotel-service`.
- Binding D1 `DB` menggunakan database yang **sudah dibuat**: `jogjastay-db` (ID diambil dari log pemilik akun).
- `WISATA_API_BASE_URL=https://wisata-jogja-ten.vercel.app`.
- `WISATA_DESTINATIONS_PATH=/api/v1/destinations`.
- Source Hotel menyediakan `GET /api/v1/hotels/:id/recommendations` dan pemetaan semantik `Sleman` ↔ `kabupaten-sleman` untuk seluruh 5 wilayah DIY.
- Foto URL relatif dari Wisata diterjemahkan dengan origin Vercel, tanpa mengopi data ke D1.

## Penting sebelum memulai

Kode ini dibuat dari revisi semantik Hotel, *bukan* ZIP lama yang belum ada pemetaan istilah.
Ini bukan aplikasi Wisata milik Andi, melainkan konektor untuk Hotel. Data katalog dan booking D1 **tidak diubah** oleh langkah berikut.
Tidak ada bukti jaringan langsung karena lingkungan penyusun tidak bisa mengakses URL eksternal; uji di Mac untuk membuktikannya.
Pastikan menjalankan dari folder paket yang ada `package.json`, `wrangler.jsonc`, dan `src/worker.mjs`.

## Prosedur teraman

1. Sebelum mengubah produksi, uji API Wisata **tanpa deploy**:

   ```bash
   npm install
   npm test
   npm run check:wisata
   ```

   Jika pemeriksaan Vercel gagal, **jangan deploy** sebelum tim Wisata memeriksa server/route.

2. Jika lulus, deploy ulang Worker dengan **nama yang sama** dan database D1 yang sama:

   ```bash
   npx wrangler whoami
   npx wrangler deploy
   ```

   **Jangan menjalankan** `node tools/deploy.mjs`, `wrangler d1 create`, `schema.sql`, atau `seed.sql` lagi. 
   Jangan menimpa `ADMIN_PASSWORD` atau token partner. Periksa bahwa output binding adalah `env.DB (jogjastay-db)`.

3. Uji API Hotel yang sudah diperbarui:

   ```bash
   npm run check:interop
   ```

   Cara manual untuk contoh Sleman:

   - Wisata: `https://wisata-jogja-ten.vercel.app/api/v1/destinations?region=kabupaten-sleman`
   - Hotel: `https://jogjastay-hotel-service.faridazis0150.workers.dev/api/v1/hotels/H11/recommendations`

4. Buka halaman utama JogjaStay. Pilih hotel di Sleman dan lihat panel rekomendasi wisata. Ulangi dengan wilayah lainnya.

## Setelah Hotel ↔ Wisata berjalan

Untuk **Wisata → Hotel** (arah sebaliknya), Hanif–Andi harus meninjau dan memasang patch dari proyek Wisata pada deployment Vercel mereka, lalu mengisi environment variable berikut di Vercel:

```text
HOTEL_API_URL=https://jogjastay-hotel-service.faridazis0150.workers.dev
HOTEL_SEARCH_PATH=/api/v1/hotels
```

Endpoint yang dipersiapkan pada patch Wisata: `/api/v1/integrations/hotels?region=kabupaten-sleman`.
Endpoint itu **belum otomatis aktif di Vercel** karena kode mereka harus dideploy oleh tim Wisata.

## Batas interoperabilitas

- Ini melakukan *semantic mapping* menggunakan kosakata JSON dan SKOS/RDF sebagai dokumentasi, **bukan** reasoning OWL.
- Lokasi dipetakan **per kota/kabupaten**, bukan jarak kilometer atau kedekatan geografis.
- Harga tiket adalah harga katalog, bukan penawaran final untuk tanggal tertentu.
- Rekomendasi via API **bukan** otomatis pemesanan silang. Booking langsung di aplikasi asal memerlukan endpoint partner terautentikasi, pengujian tambahan, dan persetujuan tim.
- Itinerary Yogyakarta tetap hanya aggregator bundling, tidak dilibatkan pada komunikasi Hotel–Wisata.
