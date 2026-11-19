# Pemetaan Semantik Hotel ↔ Wisata (DIY) — v1

Dokumentasi ini melengkapi interoperabilitas operasional Hotel JogjaStay (JavaScript/Cloudflare Workers/D1) dan Wisata Jogja (Python/Flask/Vercel). **Itinerary Yogyakarta tetap hanya aggregator bundling**; komunikasi Hotel–Wisata berjalan langsung tanpa melewati aplikasi tersebut.

## Mengapa ada lapisan semantik?

Kedua aplikasi menyimpan istilah masing-masing. `Sleman` pada Hotel dan `kabupaten-sleman` pada Wisata merujuk pada konsep administratif yang sama: `diy:kabupaten-sleman`. Kedua database tidak perlu diseragamkan. Lapisan adapter membaca nilai asal, memahami konsepnya, lalu menghasilkan representasi yang dibutuhkan API tujuan.

Implementasi yang disertakan:
- `ontology/semantic-vocabulary.json`: 5 konsep wilayah, **21 konsep atribut** dan 4 peta status (reservasi/pembayaran).
- `ontology/diy-semantic.ttl`: SKOS/RDF controlled vocabulary untuk dokumentasi akademik; **belum** memakai reasoner OWL atau triple store.
- `ontology/fixtures.json`: 40+ contoh alias dan record, berbagi kontrak lintas bahasa.
- Hotel: `src/semantic.mjs`, `src/logic.mjs`, `src/worker.mjs` (endpoint `GET /api/v1/semantic/regions`, pemetaan rekomendasi Wisata).
- Wisata: `semantic.py`, `integrations.py` (terjemahan query `region`/`city`/`wilayah`), `app.py` (endpoint `GET /api/v1/semantic/regions`).

## Konsep yang diselaraskan

| Makna | Hotel | Wisata | Aturan |
|---|---|---|---|
| Wilayah DIY | `city=Sleman` | `region=kabupaten-sleman` | **Konsep sama**, `conceptId=diy:kabupaten-sleman` |
| Informasi objek | `hotelId`, `name` | `id`, `name` | Tipe entitas **berbeda**, ID namespace berbeda |
| Deskripsi | `description` | `description` | Properti sejajar |
| Foto | `imageUrl` | `photos[]` | Foto pertama dapat diubah ke URL HTTPS absolut |
| Tamu/pembeli | `guestName`, `guestEmail`, `guestPhone` | `name`, `email`, `phone`, `customer.*` | Properti sejajar dalam konteks customer |
| Referensi pesanan | `bookingId` | `code` | Peran sama, jangan satukan nilai ID |
| Jumlah pengguna | `guests` | `qty` | **Hanya terkait**, orang menginap vs jumlah tiket |
| Tanggal | `checkIn`/`checkOut` | `visit_date` | **Hanya terkait**, tanggal kunjungan ≠ check-in |
| Harga satuan | `pricePerNight` | `price`, `unit_price` | **Hanya terkait**, Rp/malam ≠ Rp/tiket |
| Total transaksi | `totalPrice` | `total` | Sama-sama IDR, dasar hitung berbeda |
| Ketersediaan | `unitsAvailable` | `available`, `remaining` | Stok kamar vs kuota tiket |
| Status pemesanan | `confirmed`, `cancelled` | `PENDING`, `PAID`, `REFUNDED`, `EXPIRED` | Pisahkan reservationState dan paymentState |
| Sumber pesanan | `source` | `source` | Sumber transaksi per aplikasi |
| Nominal refund | `refund.amount`, `payment.refundAmount` | `refund_amount` | Padanan nominal IDR |
| Waktu dibuat | `createdAt` | `created_at` | Makna sama, format zona waktu bisa berbeda |
| Kode error | `code` | `code` | Kategori kesalahan, nilai dapat berbeda |
| Pesan error | `message` (sedangkan `error` adalah boolean) | `error` sebagai string | Dinormalisasi menjadi `{code,message}` |

### Pemetaan wilayah eksplisit

| conceptId | Hotel | Wisata |
|---|---|---|
| `diy:kota-yogyakarta` | Kota Yogyakarta | kota-yogyakarta |
| `diy:kabupaten-sleman` | Sleman | kabupaten-sleman |
| `diy:kabupaten-bantul` | Bantul | kabupaten-bantul |
| `diy:kabupaten-gunungkidul` | Gunungkidul | kabupaten-gunungkidul |
| `diy:kabupaten-kulon-progo` | Kulon Progo | kabupaten-kulon-progo |

**Ambiguitas disengaja:** `Jogja`, `Yogyakarta`, dan `DIY` tanpa keterangan dapat menunjuk kota atau provinsi. Adapter semantik **tidak** menganggapnya otomatis sama dengan Kota Yogyakarta. Masukkan nama wilayah yang tegas.

## Contoh interoperabilitas yang dapat diperagakan

1. **Hotel → Wisata.** Backend Hotel mengambil `/api/v1/destinations?region=kabupaten-sleman` ke URL Wisata yang dikonfigurasi. Hasil `photos[]`, `region`, dan `price` dipetakan ke format kartu Hotel. Wisata tetap mengelola dataset destinasi sendiri.
2. **Wisata → Hotel.** Backend Wisata menerima filter `region=kabupaten-sleman`, memetakannya ke `city=Sleman`, lalu melakukan HTTP GET ke `/api/v1/hotels?city=Sleman` di Hotel. Wisata tidak menyalin database Hotel.
3. **Kedua sisi dapat memperlihatkan kamus.** GET `/api/v1/semantic/regions` pada setiap sistem (setelah patch masing-masing di-deploy).
4. Itinerary Yogyakarta boleh memanggil keduanya untuk bundling, tetapi **bukan** perantara komunikasi Hotel ↔ Wisata.

## Konfigurasi dan deployment — jangan menimpa produksi otomatis

### Hotel Cloudflare Worker

- Proyek baru ini adalah *patch source*. **Tidak ada perubahan ke Cloudflare secara otomatis.**
- Periksa perbedaan kode, lalu set `WISATA_API_BASE_URL` menjadi **origin HTTPS asli** aplikasi Flask milik Hanif/Andi, tanpa menambahkan `/api/v1` di akhir (path endpoint sudah dikonfigurasi).
- Pastikan `WISATA_DESTINATIONS_PATH` = `/api/v1/destinations`.
- Jangan memanggil `tools/deploy.mjs` lagi: wizard tersebut untuk database **BARU** dan dapat menimpa data demo. Gunakan `npx wrangler deploy` **setelah** mengisi `database_id` D1 yang sudah aktif pada salinan konfigurasi lokal, tanpa menjalankan `seed.sql` kembali.
- Secret admin yang sudah tersimpan di Worker harus tetap ada; jangan kirim password atau API key ke pihak lain.

### Wisata Flask/Vercel

- Patch ini **belum ada di Vercel** hingga tim Hanif/Andi meninjau, menggabungkan, dan deploy repository mereka.
- Set variabel Vercel `HOTEL_API_URL=https://jogjastay-hotel-service.faridazis0150.workers.dev` dan `HOTEL_SEARCH_PATH=/api/v1/hotels`. `HOTEL_API_KEY` tidak diperlukan untuk katalog publik.
- `GET /api/v1/integrations/hotels?region=kabupaten-sleman` harus meneruskan query ke Hotel sebagai `city=Sleman`.
- Kode rute Flask lain tetap utuh, tidak diperlukan database baru.

### Validasi

- Hotel: `npm test`.
- Wisata (unit semantik yang tidak membutuhkan Flask): `python -m unittest test_semantic.py test_hotel_adapter.py -v`.
- Wisata keseluruhan setelah menginstal dependencies: `python -m unittest test_interop.py test_api.py -v`.
- Bukti produksi baru sah setelah kedua deployment terpasang, kemudian uji URL publik, rekomendasi Hotel, dan proxy Hotel dari Wisata. **Tes lokal/stub tidak sama dengan integrasi produksi.**

## Batasan penting

- Ini adalah **pemetaan kosakata semantik eksplisit + SKOS/RDF untuk dokumentasi**, bukan reasoner ontologi OWL. Tidak mencakup *semua sinonim bahasa Indonesia yang mungkin ada*. Hanya istilah yang ditemukan/dianggap relevan dari kontrak API dua source code yang diperiksa.
- Kesamaan teks tidak menyebabkan produk atau status bisnis disamakan. Status `PAID` pada Wisata bukan `confirmed` pada Hotel dalam dimensi pembayaran; status booking harus dinilai per sistem.
- Harga wisata yang tampil pada kartu adalah harga katalog dasar, bukan harga final untuk tanggal tertentu; gunakan endpoint availability sebelum booking.
- Lokasi cocok pada tingkat kota/kabupaten, **bukan rekomendasi menurut jarak kilometer**.
- Database Wisata yang disimpan di `/tmp` pada Vercel tidak persisten; perlu ditangani tim Wisata sebelum demonstrasi reservasi lintas layanan bersifat andal.
