# Pemetaan Semantik Hotel dan Wisata DIY

Dokumen ini menjelaskan bagaimana JogjaStay (Hotel Service) dan Wisata Jogja bertukar data meskipun memakai istilah berbeda. Kedua aplikasi tetap menggunakan database dan backend masing-masing. Itinerary Yogyakarta hanya menggunakan layanan untuk bundling, bukan penghubung wajib antara Hotel dan Wisata.

## Kenapa perlu pemetaan istilah?

Sebagai contoh, di JogjaStay wilayah dicatat sebagai `Sleman`, sedangkan API Wisata memakai `kabupaten-sleman`. Kedua nilai itu menunjuk wilayah administratif yang sama. Kode adapter mengubah istilah yang dikirim tanpa harus mengubah struktur database sumber.

Pemetaan dipakai untuk **lima wilayah DIY** dan **21 konsep atribut**. Kosakata tersebut tersedia di `ontology/semantic-vocabulary.json`, sedangkan `ontology/diy-semantic.ttl` menyimpan representasi SKOS/RDF untuk dokumentasi.

Implementasinya menggunakan pemetaan istilah yang telah ditentukan dan diuji. Proyek ini **tidak** menjalankan reasoner OWL atau triple store.

## Padanan wilayah

| Wilayah | Label di Hotel | Kode di Wisata |
| --- | --- | --- |
| Kota Yogyakarta | `Kota Yogyakarta` | `kota-yogyakarta` |
| Sleman | `Sleman` | `kabupaten-sleman` |
| Bantul | `Bantul` | `kabupaten-bantul` |
| Gunungkidul | `Gunungkidul` | `kabupaten-gunungkidul` |
| Kulon Progo | `Kulon Progo` | `kabupaten-kulon-progo` |

Nama tidak spesifik seperti `Jogja` atau `DIY` tidak otomatis dianggap `Kota Yogyakarta`. Jika satu data memiliki dua label wilayah yang bertentangan, adapter tidak memaksanya menjadi satu konsep.

## Contoh penyelarasan atribut

| Makna | Hotel | Wisata | Catatan |
| --- | --- | --- | --- |
| Nama objek | `name` | `name` | Hotel dan destinasi tetap dua jenis objek berbeda |
| Deskripsi | `description` | `description` | Informasi teks yang sepadan |
| Foto | `imageUrl` | `photos[]` | Path foto relatif Wisata diubah menjadi URL absolut |
| Kode pemesanan | `bookingId` | `code` | Peran mirip, tetapi ID tidak boleh dianggap sama |
| Nama pengguna | `guestName` | `name`, `customer.name` | Padanan dalam konteks pemesan |
| Jumlah | `guests` | `qty` | Jumlah tamu tidak identik dengan jumlah tiket |
| Tanggal | `checkIn`, `checkOut` | `visit_date` | Periode menginap berbeda dari tanggal wisata |
| Harga satuan | `pricePerNight` | `price`, `unit_price` | Rupiah per malam berbeda dari rupiah per tiket |
| Ketersediaan | `unitsAvailable` | `available`, `remaining` | Stok kamar berbeda dari kuota tiket |
| Status | `confirmed`, `cancelled` | `PENDING`, `PAID`, dll. | Status pemesanan dan pembayaran dibaca terpisah |
| Error | `code`, `message` | `code`, `error` | Pesan dapat dinormalisasi tanpa menyamakan semua kode |

Keseluruhan **21 konsep atribut** dan relasinya tersedia dalam `ontology/semantic-vocabulary.json`. Tabel di atas hanya contoh yang paling sering dipakai dalam pertukaran data.

## Cara kerja komunikasi dua arah

**Hotel → Wisata (sudah diuji melalui API)**

1. Pengguna memilih hotel di Sleman pada JogjaStay.
2. Backend JogjaStay memetakan wilayah `Sleman` menjadi `kabupaten-sleman`.
3. JogjaStay memanggil `GET https://wisata-jogja-ten.vercel.app/api/v1/destinations?region=kabupaten-sleman`.
4. Data dari Wisata disesuaikan menjadi format rekomendasi JogjaStay, termasuk informasi nama, harga katalog, dan foto bila tersedia.
5. Rekomendasi disajikan melalui `GET /api/v1/hotels/H11/recommendations`.

**Wisata → Hotel (menunggu implementasi dan pengujian di aplikasi Wisata)**

1. Pengguna membuka destinasi dengan wilayah `kabupaten-sleman`.
2. Backend Wisata memetakan nilai tersebut ke konsep wilayah Sleman.
3. Backend Wisata meminta `GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels?city=Sleman`.
4. Aplikasi Wisata menampilkan rekomendasi penginapan dari respons Hotel, bukan daftar yang disalin secara manual.

Data hotel/destinasi **dicocokkan berdasarkan kota atau kabupaten**, bukan jarak antar-koordinat. Jangan menampilkan klaim “hotel terdekat” berdasarkan pemetaan ini saja.

## Referensi kode dan kontrak

- `src/semantic.mjs` — adapter dan deskripsi semantik Hotel.
- `src/worker.mjs` — endpoint API yang memakai adapter.
- `ontology/semantic-vocabulary.json` — lima konsep wilayah dan 21 konsep atribut.
- `ontology/diy-semantic.ttl` — kosakata SKOS/RDF.
- `ontology/fixtures.json` — contoh nilai untuk pengujian.
- `test/semantic.test.mjs` — pengujian aturan pemetaan.

Endpoint yang dapat diperiksa:

```text
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/semantic/regions
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels?city=kabupaten-sleman
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels/H11/recommendations
```

Jalankan pengujian lokal dengan `npm test` dan pengecekan API online dengan `npm run check:interop`. Hasil tes lokal saja tidak cukup untuk menyatakan tampilan dan reservasi dari aplikasi Wisata telah berhasil.

## Hal yang tidak boleh disamakan

- `hotelId` bukan `destination_id` walaupun sama-sama ID numerik atau string.
- `checkIn` tidak otomatis sama dengan `visit_date`.
- Harga kamar per malam tidak sama dengan harga tiket wisata per orang.
- `confirmed` pada reservasi Hotel tidak sama dengan `PAID` pada pembayaran Wisata.
- Harga destinasi pada katalog bukan harga final untuk semua tanggal.
- Kuota tiket dan pemesanan lintas aplikasi memerlukan pemeriksaan API Wisata dan kontrak yang mendukung penyimpanan persisten.

Pemesanan tiket Wisata dari JogjaStay belum diaktifkan karena kontrak reservasi dan persistensi data Wisata masih perlu dipastikan. Kondisi tersebut tidak menghalangi pengambilan informasi destinasi maupun pengecekan harga dan kuota.
