/* Pemetaan makna Hotel ↔ Wisata; tidak mengubah kontrak endpoint lama. */
export const REGION_CONCEPTS=Object.freeze([
  Object.freeze({"conceptId": "diy:kota-yogyakarta", "hotelLabel": "Kota Yogyakarta", "wisataSlug": "kota-yogyakarta", "aliases": ["kota jogja", "kota yogya", "yogyakarta city", "kota yogyakarta"], "administrativeType": "city"}),
  Object.freeze({"conceptId": "diy:kabupaten-sleman", "hotelLabel": "Sleman", "wisataSlug": "kabupaten-sleman", "aliases": ["kabupaten sleman", "kab sleman", "kab. sleman", "sleman"], "administrativeType": "regency"}),
  Object.freeze({"conceptId": "diy:kabupaten-bantul", "hotelLabel": "Bantul", "wisataSlug": "kabupaten-bantul", "aliases": ["kabupaten bantul", "kab bantul", "kab. bantul", "bantul"], "administrativeType": "regency"}),
  Object.freeze({"conceptId": "diy:kabupaten-gunungkidul", "hotelLabel": "Gunungkidul", "wisataSlug": "kabupaten-gunungkidul", "aliases": ["kabupaten gunung kidul", "kabupaten gunungkidul", "gunung kidul", "gunungkidul", "kab. gunung kidul"], "administrativeType": "regency"}),
  Object.freeze({"conceptId": "diy:kabupaten-kulon-progo", "hotelLabel": "Kulon Progo", "wisataSlug": "kabupaten-kulon-progo", "aliases": ["kabupaten kulon progo", "kabupaten kulonprogo", "kulonprogo", "kulon progo", "kab. kulon progo"], "administrativeType": "regency"})
]);
const key = x => String(x??'').trim().toLowerCase().normalize('NFKC').replace(/[_.-]+/g,' ').replace(/\s+/g,' ');
const REGION_ALIASES=new Map();
for(const r of REGION_CONCEPTS){for(const s of [r.hotelLabel,r.wisataSlug,...r.aliases]){
 const k=key(s);if(REGION_ALIASES.has(k)&&REGION_ALIASES.get(k)!==r)throw Error('Benturan sinonim wilayah '+k);REGION_ALIASES.set(k,r);
}}
// "Jogja" atau "DIY" sendirian dapat berarti provinsi: sengaja tidak disamakan dengan Kota Yogyakarta.
export function semanticRegion(x){return typeof x==='string'?REGION_ALIASES.get(key(x))||null:null;}
export function hotelCityFromAny(x){return semanticRegion(x)?.hotelLabel||null;}
export function wisataSlugFromAny(x){return semanticRegion(x)?.wisataSlug||null;}
export function regionFromFields(d){
 if(!d||typeof d!=='object')return null;
 const found=[d.city,d.region,d.wilayah,d.kabupaten,d.regency,d.location?.regency,d.location?.region].filter(x=>typeof x==='string'&&x.trim());
 const mapped=found.map(semanticRegion).filter(Boolean);
 if(!mapped.length||mapped.some(x=>x.conceptId!==mapped[0].conceptId))return null;
 return mapped[0];
}
const firstString=(obj,keys)=>{for(const k of keys){const x=obj?.[k];if(typeof x==='string'&&x.trim())return x.trim();}return null;};
export function asDestination(d, baseUrl=''){
 if(!d||typeof d!=='object')return null;const r=regionFromFields(d);const name=firstString(d,['name','nama','nama_wisata']);const id=d.id??d.wisataId??d.destinationId??d.destination_id;
 if(!r||!name||id===null||id===undefined)return null;
 const rawPhoto=firstString(d,['imageUrl','image_url','foto','image'])||((Array.isArray(d.photos)&&d.photos.length)?d.photos[0]:null);
 const absolute=(v)=>{if(!v)return null;try{const u=new URL(v,baseUrl||undefined);return u.protocol==='https:'?u.href:null;}catch{return null;}};
 const rawPrice=d.price??d.harga??d.harga_tiket??null;
 const price=(rawPrice===null||rawPrice==='')?null:Number(rawPrice);
 return {provider:'wisata',entityType:'tourist_attraction',resourceId:String(id),regionId:r.conceptId,city:r.hotelLabel,region:r.wisataSlug,name,description:firstString(d,['description','deskripsi'])||'',pricePerTicket:Number.isFinite(price)?price:null,currency:'IDR',priceUnit:'ticket',imageUrl:absolute(rawPhoto)};
}
export function asHotel(h){
 if(!h||typeof h!=='object')return null;const r=regionFromFields(h);const name=firstString(h,['name','nama']);const id=h.hotelId??h.hotel_id??h.id;
 if(!r||!name||id==null)return null;
 return {provider:'hotel',entityType:'lodging',resourceId:String(id),regionId:r.conceptId,city:r.hotelLabel,region:r.wisataSlug,name,address:firstString(h,['address','alamat'])||null};
}
const HOTEL_BOOKING={confirmed:'reserved',checked_in:'in_progress',checked_out:'completed',cancelled:'cancelled'};
const HOTEL_PAYMENT={unpaid:'unpaid',paid:'paid',refunded:'refunded',partially_refunded:'partially_refunded'};
const WISATA_BOOKING={PENDING:'awaiting_payment',PAID:'reserved',REFUNDED:'refunded',EXPIRED:'expired'};
const WISATA_PAYMENT={PENDING:'unpaid',PAID:'paid',REFUNDED:'refunded',EXPIRED:'expired'};
export function bookingSemantics(provider,booking){
 if(!booking||typeof booking!=='object')return null;
 if(provider==='hotel')return {provider,reference:String(booking.bookingId??booking.id??''),reservationState:HOTEL_BOOKING[booking.status]||'unknown',paymentState:HOTEL_PAYMENT[booking.payment?.status??booking.payment_status]||'unknown'};
 if(provider==='wisata')return {provider,reference:String(booking.code??''),reservationState:WISATA_BOOKING[booking.status]||'unknown',paymentState:WISATA_PAYMENT[booking.status]||'unknown'};
 return null;
}
export function canonicalError(payload){
 if(!payload||typeof payload!=='object')return {code:'UPSTREAM_ERROR',message:'Respons upstream tidak valid'};
 return {code:String(payload.code||'UPSTREAM_ERROR'),message:typeof payload.message==='string'?payload.message:(typeof payload.error==='string'?payload.error:'Unknown upstream error')};
}
export const semanticDescription={
 version:'1.0.0',matching:'curated exactConcept by region conceptId, relatedMatch for other business fields',
 warning:'Tanggal check-in dan tanggal kunjungan, harga kamar per malam dan tiket per orang, serta status booking dan pembayaran TIDAK disamakan otomatis.',
 regions:REGION_CONCEPTS,
 fieldConcepts:[{"conceptId":"common:administrative-region","hotel":["city"],"wisata":["region"],"relation":"exactConcept","notes":"Representasi string berbeda; rujuk conceptId wilayah."},{"conceptId":"common:resource-title","hotel":["name"],"wisata":["name"],"relation":"relatedType","notes":"Nama objek akomodasi berbeda dari nama destinasi, jangan campur ID."},{"conceptId":"common:resource-description","hotel":["description"],"wisata":["description"],"relation":"sameProperty"},{"conceptId":"common:photo-of-resource","hotel":["imageUrl","image_url"],"wisata":["photos"],"relation":"sameProperty","notes":"Photos berupa array path relatif dan harus diselesaikan dengan URL asal Wisata."},{"conceptId":"common:booking-reference","hotel":["bookingId"],"wisata":["code"],"relation":"sameRole","notes":"ID berbeda namespace dan tidak boleh disamakan nilainya."},{"conceptId":"common:client-name","hotel":["guestName"],"wisata":["name","customer.name"],"relation":"sameRole"},{"conceptId":"common:client-email","hotel":["guestEmail"],"wisata":["email","customer.email"],"relation":"sameRole"},{"conceptId":"common:client-phone","hotel":["guestPhone"],"wisata":["phone","customer.phone"],"relation":"sameRole"},{"conceptId":"common:number-of-users","hotel":["guests"],"wisata":["qty"],"relation":"relatedMatch","notes":"Orang yang menginap vs tiket; unit dan aturan bisnis tidak identik."},{"conceptId":"common:service-start","hotel":["checkIn"],"wisata":["visit_date"],"relation":"relatedMatch","notes":"Check-in hotel vs tanggal kunjungan wisata tidak boleh disalin otomatis."},{"conceptId":"common:service-end","hotel":["checkOut"],"wisata":[],"relation":"hotelOnly"},{"conceptId":"common:unit-price","hotel":["pricePerNight"],"wisata":["price","unit_price"],"relation":"relatedMatch","notes":"Harga PER MALAM vs PER TIKET, gunakan unit eksplisit."},{"conceptId":"common:total-amount","hotel":["totalPrice"],"wisata":["total"],"relation":"sameRole","notes":"Keduanya IDR, tetapi total berasal dari perhitungan berbeda."},{"conceptId":"common:service-availability","hotel":["unitsAvailable"],"wisata":["available","remaining"],"relation":"relatedMatch","notes":"Stok kamar per malam vs kuota tiket per tanggal."},{"conceptId":"common:reservation-state","hotel":["status"],"wisata":["status"],"relation":"relatedMatch","notes":"Hotel confirmed bukan sinonim Wisata PAID; lifecycle dan payment harus dipisah."},{"conceptId":"common:currency","hotel":["IDR","Rp","rupiah"],"wisata":["IDR","Rp","rupiah"],"relation":"exactConcept"},{"conceptId":"common:source-system","hotel":["source"],"wisata":["source"],"relation":"sameProperty"},{"conceptId":"common:refund-amount","hotel":["payment.refundAmount","refund.amount"],"wisata":["refund_amount"],"relation":"sameRole","notes":"Nilai pengembalian dana, bukan persentase refund."},{"conceptId":"common:booking-created-at","hotel":["createdAt"],"wisata":["created_at"],"relation":"sameRole","notes":"Hati-hati timezone: Hotel biasanya UTC, Wisata dapat waktu lokal tanpa offset."},{"conceptId":"common:error-code","hotel":["code"],"wisata":["code"],"relation":"sameProperty","notes":"Kode error dapat berbeda nilainya meskipun kategori HTTP sama."},{"conceptId":"common:error-message","hotel":["message"],"wisata":["error"],"relation":"sameProperty","notes":"Hotel error bernilai boolean dan message berisi teks; Wisata error berisi teks."}],
 statusMappings:{"hotelBooking":{"confirmed":"reserved","checked_in":"in_progress","checked_out":"completed","cancelled":"cancelled"},"hotelPayment":{"unpaid":"unpaid","paid":"paid","refunded":"refunded","partially_refunded":"partially_refunded"},"wisataBooking":{"PENDING":"awaiting_payment","PAID":"reserved","REFUNDED":"refunded","EXPIRED":"expired"},"wisataPayment":{"PENDING":"unpaid","PAID":"paid","REFUNDED":"refunded","EXPIRED":"expired"}},
 nonEquivalences:["city=Kota Yogyakarta tidak sama dengan Provinsi DIY","hotelId tidak sama dengan destination_id walaupun nilainya sama","checkIn tidak sama dengan visit_date","guests tidak selalu sama dengan qty","pricePerNight tidak sama dengan unit_price tiket","confirmed tidak sama dengan paid","hotel cancelled tidak sama dengan wisata refunded"]
};
