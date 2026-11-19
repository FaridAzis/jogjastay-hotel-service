# Kontrak untuk tim Itinerary Yogyakarta (draft yang dapat disepakati bersama)

URL base berasal dari URL Worker Hotel Service setelah deployment: `https://....workers.dev/api/v1`.

## Hotel

- `GET /regions` -> array `{name,hotelCount}`.
- `GET /hotels?city=Sleman` -> array `{hotelId,name,city,rating,area,description,imageUrl,address}`.
- `GET /rooms?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&city=Bantul` -> array kamar dengan `pricePerNight`, `unitsAvailable`, `totalPrice`.
- `POST /hotel-bookings`: JSON `{hotelId,roomId,guestName,guestEmail?,guestPhone?,guests,checkIn,checkOut}`; wajib via server aggregator dengan `Authorization: Bearer <token>` + `Idempotency-Key`.
- Response `201` `{bookingId,status,totalPrice}`; jika tamu langsung via website response juga mencakup `accessToken` privat.
- `GET /hotel-bookings/:id` untuk partner sah, `POST /hotel-bookings/:id/pay` (simulasi), `DELETE /hotel-bookings/:id` (pembatalan demo).
- `GET /partner/bookings` hanya mengembalikan reservasi milik token partner tersebut.

## Komunikasi Hotel -> Wisata

- Hotel Worker memanggil `WISATA_API_BASE_URL` + `WISATA_DESTINATIONS_PATH` dengan filter `city` dan memvalidasi/filter hasil terhadap wilayah hotel.
- Respons Wisata dapat berupa array langsung atau objek dengan properti `data`, `destinations`, `wisata`, atau `results`; setiap item minimal `id`, `name`, `city` (bisa alias `kabupaten`/`wilayah`).
- Jika API Wisata tidak siap, Hotel Worker mengembalikan HTTP 503/502; **jangan mengklaim komunikasi berhasil sebelum uji lintas-service**.

## Kriteria demonstrasi untuk Prof. Selo dan Prof. Lukito

1. Website hotel berfungsi independen saat Itinerary dimatikan.
2. Rekomendasi Hotel–Wisata merupakan request API langsung (bukan link atau data manual).
3. Itinerary berhasil meminta hotel dan membuat reservasi melalui API.
4. Status booking terlihat di admin Hotel, dan gagal/sukses tiap subsistem ditampilkan terpisah dalam paket bundling.


## Pembaruan semantik (19 November 2026)

Kontrak aktual tim Wisata: `GET /api/v1/destinations?region=kabupaten-sleman`. Hotel mengubah `city=Sleman` menjadi slug Wisata melalui kamus SKOS/RDF `ontology/diy-semantic.ttl`; Wisata dapat mengubah `region=kabupaten-sleman` menjadi query Hotel `city=Sleman`. Lihat `SEMANTIK_HOTEL_WISATA.md`. Filter saat ini adalah cakupan administratif, bukan jarak geospasial.
