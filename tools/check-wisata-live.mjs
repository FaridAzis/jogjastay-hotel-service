#!/usr/bin/env node
/**
 * Pengujian langsung via internet pada Mac pengguna, tanpa password dan tanpa booking.
 * Tidak mengubah data D1, hanya GET endpoint publik.
 */
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const remote = config.vars?.WISATA_API_BASE_URL;
const hotel = 'https://jogjastay-hotel-service.jogjawisata.workers.dev';
const withHotel = process.argv.includes('--hotel');
const regions = [
  ['Kota Yogyakarta','kota-yogyakarta','H01'],
  ['Sleman','kabupaten-sleman','H11'],
  ['Bantul','kabupaten-bantul','H19'],
  ['Gunungkidul','kabupaten-gunungkidul','H26'],
  ['Kulon Progo','kabupaten-kulon-progo','H31'],
];
async function get(url) {
  let res;
  try {res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});}
  catch (e) {throw Error('Jaringan gagal: '+String(e.message||e));}
  const body=await res.text();
  if (!res.ok) throw Error(`HTTP ${res.status}: ${body.slice(0,160)}`);
  try {return JSON.parse(body);}catch {throw Error('Respons bukan JSON: '+body.slice(0,160));}
}
let errors=0;
console.log('Pemeriksaan API Wisata langsung:',remote);
for (const [city,slug,hotelId] of regions) {
  try {
    const u=new URL('/api/v1/destinations',remote);
    u.searchParams.set('region',slug);u.searchParams.set('limit','8');
    const data=await get(u);
    const items=Array.isArray(data)?data:[data?.data,data?.destinations,data?.wisata,data?.results].find(Array.isArray);
    if(!items) throw Error('Format daftar destinasi tidak dikenali');
    if(items.length===0)throw Error('API mengembalikan daftar kosong untuk '+slug);
    if(items.some(x=>x.region!==slug))throw Error('Ada objek yang kode wilayahnya tidak cocok');
    console.log(`OK  Wisata ${city} (${slug}): ${items.length} destinasi`);
    if(withHotel){
      const h=await get(`${hotel}/api/v1/hotels/${hotelId}/recommendations`);
      if(h?.source!=='Wisata Service'||h?.city!==city||!Array.isArray(h?.destinations)||!h.destinations.length)
        throw Error('Hotel tidak mengembalikan rekomendasi dari Wisata: '+JSON.stringify(h).slice(0,220));
      console.log(`OK  JogjaStay ${hotelId}: ${h.destinations.length} rekomendasi`);
    }
  } catch(e) {errors++;console.error(`GAGAL ${city}: ${e.message}`);}
}
if(withHotel) console.log('Catatan: menguji endpoint Hotel yang sudah di-deploy.');
if(errors) {console.error(`${errors} pemeriksaan gagal. Periksa API/deployment, jangan klaim integrasi sukses.`);process.exitCode=1;}
else console.log('SEMUA pemeriksaan GET publik berhasil. Tidak ada data/booking yang diubah.');
