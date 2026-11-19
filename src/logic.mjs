import {hotelCityFromAny,wisataSlugFromAny,asDestination} from './semantic.mjs';
export const REGIONS = Object.freeze(['Kota Yogyakarta','Sleman','Bantul','Gunungkidul','Kulon Progo']);
export const METHODS = Object.freeze(['transfer','kartu','e-wallet','qris','tunai']);
export const POLICY = 'Refund 100% jika dibatalkan ≥ 3 hari sebelum check-in, 50% jika 1–2 hari sebelumnya, dan tanpa refund pada hari check-in.';
export class ApiError extends Error { constructor(status, code, message){ super(message); this.status=status; this.code=code; } }
export function normRegion(value){return hotelCityFromAny(value);}
export function wisataRegionSlug(city){return wisataSlugFromAny(city);}
export function validRange(a,b,{allowPast=false}={}){
  const good=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  if(!a||!b)throw new ApiError(400,'MISSING_DATES','checkIn dan checkOut wajib diisi');
  try{if(!good(a)||!good(b))throw Error();}catch{throw new ApiError(400,'INVALID_DATE','Gunakan tanggal YYYY-MM-DD yang valid');}
  const nights=(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
  if(nights<=0||nights>30)throw new ApiError(400,'INVALID_DATE_RANGE','Lama menginap harus antara 1–30 malam');
  if(!allowPast && a < localToday())throw new ApiError(400,'DATE_IN_PAST','Check-in tidak boleh di masa lalu');
  return nights;
}
export const split=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
export const toHotel=h=>({hotelId:h.id,name:h.name,address:h.address,city:h.city,rating:h.rating,area:h.area,description:h.description,imageUrl:h.image_url});
export const toRoom=r=>({roomId:r.id,hotelId:r.hotel_id,roomType:r.room_type,pricePerNight:r.price_per_night,capacity:r.capacity,totalUnits:r.total_units,sizeM2:r.size_m2,bedType:r.bed_type,description:r.description,facilities:split(r.facilities),imageUrl:r.image_url});
export const isoNow=()=>new Date().toISOString();
export const localToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
export const nights=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
export function cancellation(b){
  const deny=reason=>({allowed:false,reason,refundPercent:0,refundAmount:0,policy:POLICY});
  if(b.status!=='confirmed')return deny('Booking tidak dapat dibatalkan pada status saat ini');
  if(localToday()>=b.check_out_date)return deny('Masa menginap selesai');
  const before=nights(localToday(),b.check_in_date);
  const pct=before>=3?100:before>=1?50:0;
  return {allowed:true,daysBeforeCheckIn:before,refundPercent:pct,refundAmount:Math.round(b.paid_amount*pct/100),policy:POLICY};
}
export function toBooking(b){return {
  bookingId:b.id,hotelId:b.hotel_id,hotelName:b.hotel_name,roomId:b.room_id,roomType:b.room_type,roomImageUrl:b.room_image,
  guestName:b.guest_name,guestEmail:b.guest_email||null,guestPhone:b.guest_phone||null,guests:b.guests,
  checkIn:b.check_in_date,checkOut:b.check_out_date,nights:nights(b.check_in_date,b.check_out_date),totalPrice:b.total_price,
  status:b.status,source:b.source,notes:b.notes||'',createdAt:b.created_at,
  payment:{status:b.payment_status,method:b.payment_method||null,paidAmount:b.paid_amount,paidAt:b.paid_at||null,refundAmount:b.refund_amount},
  checkedInAt:b.checked_in_at||null,checkedOutAt:b.checked_out_at||null,cancelledAt:b.cancelled_at||null,cancelReason:b.cancel_reason||null,cancellation:cancellation(b)
};}
export function destination(d,region,websiteBase=''){
  const mapped=asDestination(d,websiteBase);
  if(!mapped||mapped.city!==region)return null;
  const rawLink=d.url||d.bookingUrl||d.booking_url;
  let link=null;
  try{const target=new URL(rawLink||`/#/wisata/${encodeURIComponent(mapped.resourceId)}`,websiteBase||undefined);if(safePublicUrl(target.href))link=target.href;}catch{}
  return {wisataId:mapped.resourceId,name:mapped.name,city:mapped.city,description:mapped.description.slice(0,350),price:mapped.pricePerTicket,imageUrl:mapped.imageUrl&&safePublicUrl(mapped.imageUrl)?mapped.imageUrl:null,url:link,regionId:mapped.regionId,priceUnit:mapped.priceUnit,currency:mapped.currency};
}
export function safePublicUrl(v){try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)return false;const h=u.hostname.toLowerCase();return !(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h==='::1'||h==='0.0.0.0'||h.endsWith('.localhost')||/^\d+\.\d+\.\d+\.\d+$/.test(h));}catch{return false;}}
