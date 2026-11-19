# Pengelolaan Deployment dan Integrasi Wisata

**Kondisi terakhir: 19 November 2026**

JogjaStay sudah berjalan di Cloudflare Workers. Dokumen ini dipakai ketika ada perubahan kode atau saat mengecek sambungan API Wisata. Ini **bukan** panduan membuat Worker maupun database baru.

## Alamat yang dipakai

- Website dan API Hotel: https://jogjastay-hotel-service.jogjawisata.workers.dev
- Dokumentasi API Hotel: https://jogjastay-hotel-service.jogjawisata.workers.dev/api/docs
- API Wisata: https://wisata-jogja-ten.vercel.app
- Nama Worker: `jogjastay-hotel-service`
- Binding database: `DB` → `jogjastay-db`

Konfigurasi aktif di `wrangler.jsonc`:

```json
{
  "WISATA_API_BASE_URL": "https://wisata-jogja-ten.vercel.app",
  "WISATA_DESTINATIONS_PATH": "/api/v1/destinations"
}
```

## Ketika ada perubahan kode Hotel

1. Ambil perubahan repository di laptop terlebih dahulu: `git pull`. Periksa bahwa tidak ada perubahan lokal yang belum disimpan.
2. Jalankan `npm test` dan `npm run check:interop`. Jika pemeriksaan tidak lulus, cari penyebabnya sebelum deploy.
3. Jika memang ada kode Worker atau frontend yang perlu diperbarui di website, jalankan `npx wrangler deploy` dari folder proyek yang sama.
4. Pastikan terminal tetap menunjukkan Worker `jogjastay-hotel-service` dan binding `env.DB` ke `jogjastay-db`.
5. Uji halaman utama, login staf, dan endpoint relevan setelah deploy.

**Untuk perubahan README atau dokumen GitHub saja, tidak perlu deploy Cloudflare.**

Jangan menjalankan `node tools/deploy.mjs`, `wrangler d1 create`, `db/schema.sql`, atau `db/seed.sql` pada database remote yang sudah dipakai. Jangan menimpa secret admin atau token partner tanpa kebutuhan yang jelas.

## Contoh pemeriksaan API tanpa mengubah data

Wisata, destinasi Sleman:

```text
https://wisata-jogja-ten.vercel.app/api/v1/destinations?region=kabupaten-sleman
```

JogjaStay, rekomendasi untuk hotel di Sleman:

```text
https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels/H11/recommendations
```

Pemeriksaan kelima wilayah dapat dijalankan melalui:

```bash
npm run check:interop
```

Kode Hotel mengubah label wilayah menjadi slug yang dimengerti Wisata, menerima respons destinasi, dan mengembalikan rekomendasi tanpa menyalin database destinasi ke D1.

## Integrasi dari aplikasi Wisata ke Hotel

Bagian **Wisata → Hotel** dikerjakan di backend tim Hanif–Andi. Mereka dapat menggunakan:

```text
HOTEL_API_URL=https://jogjastay-hotel-service.jogjawisata.workers.dev
HOTEL_SEARCH_PATH=/api/v1/hotels
```

Contoh panggilan publik ke Hotel:

```text
GET https://jogjastay-hotel-service.jogjawisata.workers.dev/api/v1/hotels?city=Sleman
```

Jika aplikasi Wisata menerima `region=kabupaten-sleman`, backend mereka dapat memetakannya ke wilayah `Sleman` sebelum meminta katalog hotel. Katalog publik tidak memerlukan Bearer token partner.

Implementasi tampilan dan rute integrasi di aplikasi Wisata belum otomatis terpasang karena source kedua aplikasi berbeda. Tim Wisata perlu menguji dan men-deploy perubahan di proyek mereka sendiri.

## Hubungan dengan tim Itinerary

Itinerary boleh membaca katalog Hotel dan Wisata untuk menyusun paket. Untuk membuat reservasi hotel melalui backend Itinerary, gunakan token partner Hotel yang sudah dibagikan secara privat. Token tidak boleh ditaruh di kode frontend atau di repository.

Komunikasi **Hotel ↔ Wisata berjalan langsung**. Itinerary bukan perantara request rekomendasi dua arah tersebut.

## Batasan

- Pemetaan wilayah dilakukan pada tingkat kota/kabupaten, bukan perhitungan jarak kilometer.
- Kamus istilah tersedia di `SEMANTIK_HOTEL_WISATA.md` dan folder `ontology/`.
- Cek harga/kuota tiket Wisata tidak sama dengan melakukan pembelian tiket. Pemesanan tiket langsung belum diaktifkan.
- Database D1 dan database milik Wisata dikelola terpisah.
