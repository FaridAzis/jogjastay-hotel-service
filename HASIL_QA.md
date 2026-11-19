# Catatan Pengujian JogjaStay

**Pembaruan: 19 November 2026**

Dokumen ini mencatat apa yang sudah diuji dan apa yang masih perlu dicek. Pengujian otomatis, pengujian API antar-layanan, dan pengujian tampilan browser dibedakan agar hasilnya tidak tertukar.

## Pengujian otomatis

Perintah: `npm test`

**Hasil terakhir dari terminal pengembang: 35 tes lulus, 0 gagal.**

Pengujian mencakup:
- Katalog 50 hotel di lima wilayah DIY, data kamar, validasi tanggal dan ketersediaan.
- Reservasi tamu, pembatasan akses menggunakan token privat, pembayaran/pembatalan pada data demo, dan pencegahan pemesanan melebihi stok.
- Login staf, sesi, dashboard, pengelolaan hotel/kamar/akun staf, dan pembatasan percobaan login.
- Autentikasi partner, kepemilikan reservasi, penggantian token, serta `Idempotency-Key`.
- Penanganan kesalahan dari API Wisata, normalisasi lima wilayah, dan kontrak 21 konsep atribut semantik.
- Pengambilan rekomendasi destinasi serta pengecekan ketersediaan tiket melalui stub API yang terkontrol.
- Batasan pemesanan tiket Wisata: fitur tidak diaktifkan tanpa konfirmasi kontrak yang aman.

**Catatan:** tes berjalan dengan emulator D1 berbasis SQLite di Node.js. Lulusnya tes lokal tidak otomatis membuktikan semua tindakan di website produksi sudah berhasil.

## Deployment dan API lintas layanan

- **Cloudflare Workers:** aplikasi Hotel sudah berhasil dideploy menggunakan Worker `jogjastay-hotel-service`.
- **Database:** menggunakan D1 `jogjastay-db` yang sudah ada. Tidak perlu membuat atau mengisi ulang database untuk pembaruan dokumentasi.
- **Alamat website:** https://jogjastay-hotel-service.jogjawisata.workers.dev
- **API Wisata:** https://wisata-jogja-ten.vercel.app
- **Hotel → Wisata:** pemeriksaan `npm run check:interop` sebelumnya berhasil untuk contoh hotel di kelima wilayah. Endpoint `GET /api/v1/hotels/:id/recommendations` mengambil data dari API Wisata, bukan membuat daftar statis.
- **Login admin:** berhasil digunakan setelah perbaikan PBKDF2 dan reset password pada 19 November 2026.
- **Token partner Hotel:** sudah diberikan ke tim Itinerary. Pengiriman token tidak sama dengan bukti bahwa pemesanan dari aplikasi Itinerary telah sukses.

Hasil di bagian ini merujuk pada log pengujian dan konfirmasi yang sudah dilaporkan tim Hotel, bukan pengujian ulang seluruh alur produksi pada saat dokumen ini diperbarui.

## Yang masih perlu dicek bersama

| Skenario | Status |
| --- | --- |
| API Hotel memberikan rekomendasi Wisata untuk lima wilayah | Sudah diuji |
| Halaman rekomendasi Wisata pada browser, termasuk detail destinasi | Perlu uji browser akhir |
| Pengecekan harga dan kuota tiket Wisata dari browser | Perlu uji browser akhir |
| Wisata → Hotel, rekomendasi penginapan di aplikasi Wisata | Menunggu implementasi dan pengujian tim Wisata |
| Itinerary → Hotel, membaca katalog dan membuat reservasi partner | Menunggu konfirmasi uji end-to-end tim Itinerary |
| Pemesanan tiket wisata lintas aplikasi | Belum diaktifkan |
| Pengiriman email dan webhook pihak ketiga | Belum dikonfirmasi end-to-end |

## Cara mengulang pengujian

Dari folder repository:

```bash
npm test
npm run check:wisata
npm run check:interop
```

`check:wisata` dan `check:interop` membutuhkan akses internet. Keduanya melakukan pemeriksaan GET publik dan tidak membuat reservasi atau mengubah data D1.

Untuk pengujian manual, buka website, pilih hotel pada tiap wilayah, periksa rekomendasi destinasi, lalu buka detail dan cek tiket. Catat respons gagal jika layanan Wisata tidak tersedia. Bukti pengujian tim lain harus berasal dari deployment masing-masing, bukan hanya respons stub di tes lokal.

## Pembatasan pengujian

Reservasi hotel dan pencatatan pembayaran digunakan sebagai data tugas kuliah. Tidak ada payment gateway untuk transaksi uang asli. Harga serta ketersediaan yang tampil tidak boleh dianggap sebagai penawaran resmi hotel. Jangan memakai data pribadi atau kartu pembayaran sungguhan saat demonstrasi.
