# JogjaStay

JogjaStay adalah aplikasi pencarian dan pemesanan penginapan di Daerah Istimewa Yogyakarta. Proyek ini dikerjakan oleh tim Hotel Service untuk mata kuliah Interoperabilitas Lanjut. Selain menyediakan katalog hotel, JogjaStay terhubung dengan aplikasi Wisata Jogja dan menyiapkan API yang bisa dipakai tim Itinerary.

**Website:** https://jogjastay-hotel-service.jogjawisata.workers.dev  
**Dokumentasi API:** https://jogjastay-hotel-service.jogjawisata.workers.dev/api/docs

## Apa yang sudah bisa dilakukan?

**Untuk pengunjung**
- Melihat 50 penginapan yang tersebar di Kota Yogyakarta, Sleman, Bantul, Gunungkidul, dan Kulon Progo.
- Memilih dari 101 tipe kamar, menyaring berdasarkan wilayah, serta mengecek harga dan ketersediaan kamar sesuai tanggal menginap.
- Membuat pemesanan kamar dan melihat kembali detailnya menggunakan kode booking serta kode akses privat.
- Melihat rekomendasi tempat wisata berdasarkan wilayah hotel yang dipilih. Data destinasi diambil langsung dari API Wisata Jogja, bukan daftar yang disimpan di aplikasi Hotel.
- Membuka detail destinasi wisata serta mengecek harga dan kuota tiket untuk tanggal kunjungan tertentu melalui layanan Wisata.

**Untuk admin dan resepsionis**
- Masuk ke dashboard staf.
- Mengelola katalog hotel, kamar, dan reservasi.
- Mencatat check-in, check-out, serta status pembayaran pada data pemesanan.
- Mengelola akun staf dan akses API untuk mitra integrasi (sesuai hak akses).

**Untuk aplikasi lain**
- Membaca daftar hotel, kamar, wilayah, dan ketersediaan melalui REST API.
- Mengakses rekomendasi Wisata Jogja berdasarkan hotel.
- Menggunakan API partner untuk reservasi hotel dengan autentikasi Bearer token. Token disimpan di backend aplikasi mitra, bukan di browser.

## Integrasi dengan Wisata dan Itinerary

JogjaStay sudah terhubung langsung ke API [Wisata Jogja](https://wisata-jogja-ten.vercel.app). Ketika sebuah hotel dipilih, aplikasi meminta destinasi dari layanan Wisata sesuai wilayahnya. Pemetaan ini mencakup lima wilayah DIY, misalnya **Sleman** pada data Hotel dan **`kabupaten-sleman`** pada data Wisata.

Rekomendasi saat ini cocok **berdasarkan kabupaten/kota**, bukan perhitungan jarak hotel ke tempat wisata.

Arah **Hotel → Wisata** telah diuji melalui API. Untuk arah **Wisata → Hotel**, tim Wisata sedang menambahkan pengambilan katalog hotel dari JogjaStay ke aplikasi mereka. Tim Itinerary juga sudah menerima akses partner Hotel, tetapi pengujian reservasi dari aplikasi Itinerary masih perlu dikonfirmasi.

## Yang belum tersedia

- **Pembelian tiket wisata langsung dari JogjaStay** belum diaktifkan. Saat ini pengguna bisa melihat detail destinasi dan mengecek harga/kuota. Reservasi tiket baru dapat diaktifkan setelah kontrak pemesanan dan penyimpanan data di layanan Wisata memenuhi kebutuhan integrasi.
- Pembayaran dan pengembalian dana pada reservasi hotel adalah **pencatatan untuk demonstrasi**, bukan transaksi uang asli melalui payment gateway.
- Rekomendasi hotel terdekat berdasarkan jarak belum tersedia.
- Pengiriman email otomatis belum diaktifkan.

Katalog, harga, dan reservasi yang dipakai dalam proyek ini merupakan **data untuk keperluan pembelajaran**, bukan inventaris atau tarif resmi hotel. Jangan melakukan transfer uang atau memasukkan data pembayaran sungguhan.

## Teknologi

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Integrasi:** REST API, JSON, pemetaan istilah wilayah
- **Dokumentasi API:** OpenAPI / Swagger UI

Kode frontend dan backend berada dalam satu repository. Database JogjaStay tetap berada di D1; tidak ada kebutuhan untuk membuat database baru setiap kali kode diperbarui.

## Menjalankan kode di lokal

Gunakan Node.js versi 22 atau yang lebih baru.

```bash
npm install
npm test
npm run dev
```

`npm test` menjalankan pengujian otomatis. Pada pengujian terakhir, **35 dari 35 tes lulus**. Pengujian tersebut memeriksa logika dan kontrak API; hasilnya tidak otomatis menjamin semua alur antarmuka maupun integrasi mitra sudah lolos pengujian di browser.

`npm run dev` menjalankan Worker secara lokal. Database D1 lokal terpisah dari D1 yang digunakan website online, sehingga data lokal perlu disiapkan secara terpisah bila ingin mencoba alur yang membutuhkan data.

**Untuk proyek yang sudah online:** jangan menjalankan kembali skrip pembuatan database atau `db/seed.sql` ke D1 remote. Itu bukan langkah yang diperlukan untuk memperbarui kode.

## Beberapa endpoint yang bisa dicoba

| Endpoint | Kegunaan |
| --- | --- |
| `GET /health` | Status layanan dan jumlah hotel |
| `GET /api/v1/regions` | Daftar wilayah |
| `GET /api/v1/hotels` | Katalog hotel |
| `GET /api/v1/rooms` | Katalog dan ketersediaan kamar |
| `GET /api/v1/hotels/H11/recommendations` | Rekomendasi wisata untuk hotel di Sleman |
| `GET /api/v1/semantic/regions` | Pemetaan semantik wilayah |
| `GET /api/openapi.json` | Spesifikasi OpenAPI |

Endpoint partner yang mengubah atau membaca reservasi tertentu memerlukan autentikasi sesuai dokumentasi API.

## Catatan pengembangan

Detail pemetaan istilah ada di [SEMANTIK_HOTEL_WISATA.md](SEMANTIK_HOTEL_WISATA.md). Dokumen pendukung pengujian dan integrasi lainnya juga tersedia di repository ini.

Proyek ini masih dikembangkan bersama tim Wisata dan Itinerary untuk melengkapi pengujian interoperabilitas dua arah dan alur reservasi antar-aplikasi.
