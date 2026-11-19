# Kontrak API Hotel untuk Tim Itinerary

Dokumen ini dipakai tim Itinerary untuk menghubungkan backend mereka dengan JogjaStay. URL API tetap sama walaupun source Hotel diperbaiki dan di-deploy ulang.

**Base URL Hotel:** https://jogjastay-hotel-service.jogjawisata.workers.dev  
**Prefix API:** `/api/v1`  
**Dokumentasi API:** https://jogjastay-hotel-service.jogjawisata.workers.dev/api/docs

## Katalog dan pengecekan kamar

Endpoint publik yang dapat dipanggil tanpa token partner:

- `GET /api/v1/regions` — daftar lima wilayah DIY.
- `GET /api/v1/hotels` — daftar hotel. Filter wilayah dapat memakai `city=Sleman` atau slug `city=kabupaten-sleman`.
- `GET /api/v1/hotels/{id}` — detail hotel dan tipe kamar.
- `GET /api/v1/rooms?city=Bantul&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` — daftar kamar dengan ketersediaan dan harga untuk periode yang dipilih.
- `GET /api/v1/hotels/{id}/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` — ketersediaan kamar hotel tertentu.

Contoh permintaan:

```text
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels?city=Sleman
```

## Reservasi melalui backend Itinerary

Operasi partner dilakukan dari **server Itinerary**, bukan JavaScript browser.

- `POST /api/v1/hotel-bookings` — membuat reservasi. Data yang diperlukan: `hotelId`, `roomId`, `guestName`, `guests`, `checkIn`, dan `checkOut`; kontak tamu mengikuti validasi API.
- `GET /api/v1/partner/bookings` — membaca reservasi milik partner yang sedang terautentikasi.
- `GET /api/v1/hotel-bookings/{id}` — membaca reservasi sesuai izin akses.
- `POST /api/v1/hotel-bookings/{id}/pay` — mencatat status pembayaran pada data tugas kuliah.
- `DELETE /api/v1/hotel-bookings/{id}` — pembatalan sesuai aturan yang berlaku.

Contoh header operasi partner:

```http
Authorization: Bearer TOKEN_PARTNER_HOTEL
Idempotency-Key: KEY_UNIK_PER_PERMINTAAN_RESERVASI
Content-Type: application/json
```

Token partner Hotel sudah disampaikan kepada tim Itinerary secara privat. **Jangan menaruh token asli di GitHub, halaman browser, atau dokumentasi.** Pengiriman token saja belum membuktikan bahwa reservasi dari Itinerary telah berhasil; tetap perlu tes end-to-end.

## Integrasi langsung Hotel dan Wisata

Hotel memanggil API Wisata di:

```text
https://wisata-jogja-ten.vercel.app/api/v1/destinations?region=kabupaten-sleman
```

Contoh respons yang sudah dipetakan ke format JogjaStay dapat dilihat melalui:

```text
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels/H11/recommendations
```

Pemetaan `Sleman` ↔ `kabupaten-sleman` juga berlaku untuk empat wilayah DIY lainnya. Integrasi **Hotel → Wisata** sudah lolos pengecekan API lima wilayah.

Arah **Wisata → Hotel** merupakan pekerjaan tim Wisata. Mereka perlu memanggil API Hotel dari backend Wisata dan menampilkan hasilnya pada aplikasi mereka.

**Itinerary tidak menjadi perantara komunikasi Hotel ↔ Wisata.** Itinerary menggunakan API kedua layanan untuk menyusun bundling perjalanan.

## Bukti yang masih dibutuhkan untuk laporan

1. Pengujian dari aplikasi Itinerary yang berhasil membaca data Hotel dan membuat reservasi menggunakan token partner.
2. Bukti reservasi tersebut muncul pada dashboard Hotel dengan sumber partner yang benar.
3. Hasil tampilan aplikasi Wisata yang sudah mengambil rekomendasi Hotel secara langsung.
4. Pengujian kondisi gagal, seperti token tidak valid, stok kamar habis, atau layanan mitra tidak tersedia.

Status tersebut belum boleh ditulis sebagai sudah selesai sebelum dibuktikan dari deployment masing-masing.

## Catatan penggunaan

- Harga dan pembayaran reservasi Hotel digunakan untuk demonstrasi akademik, bukan transaksi uang asli.
- `GET` katalog publik tidak membutuhkan token. `POST` reservasi partner membutuhkannya.
- Format respons rinci dan kode kesalahan mengikuti API yang berjalan. Jangan menyimpulkan keberhasilan hanya dari status HTTP bila respons menunjukkan kegagalan.
