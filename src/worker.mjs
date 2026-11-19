import {semanticDescription} from './semantic.mjs';
/*
 * JogjaStay Cloudflare edition — adaptasi dari Hotel Service buatan Ai.
 * Database: Cloudflare D1, UI: frontend asli Ai, public/.
 * DEMO AKADEMIK: pembayaran/refund hanyalah simulasi, inventaris tidak dikonfirmasi hotel.
 */
import {REGIONS,METHODS,POLICY,ApiError,normRegion,wisataRegionSlug,validRange,toHotel,toRoom,toBooking,cancellation,destination,safePublicUrl,isoNow,localToday} from './logic.mjs';

const BOOKING_SELECT=`SELECT b.*,h.name AS hotel_name,r.room_type,r.image_url AS room_image FROM bookings b JOIN hotels h ON h.id=b.hotel_id JOIN rooms r ON r.id=b.room_id`;
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const one=(db,sql,...bind)=>db.prepare(sql).bind(...bind).first();
const all=async(db,sql,...bind)=>(await db.prepare(sql).bind(...bind).all()).results||[];
const run=(db,sql,...bind)=>db.prepare(sql).bind(...bind).run();
const requireBody=async(req)=>{const n=+(req.headers.get('content-length')||0);if(n>100000)fail(413,'BODY_TOO_LARGE','Maksimum 100 kB JSON');let b;try{const raw=await req.text();if(new TextEncoder().encode(raw).length>100000)fail(413,'BODY_TOO_LARGE','Maksimum 100 kB JSON');b=JSON.parse(raw);}catch(e){if(e instanceof ApiError)throw e;fail(400,'INVALID_JSON','Body JSON tidak valid');}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'INVALID_JSON','Body harus objek JSON');return b;};
const t=(s,max=500)=>String(s??'').trim().slice(0,max);
const natural=(n,k,min=0,max=1e10)=>{const v=Number(n);if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,'VALIDATION_ERROR',`${k} harus bilangan bulat ${min}–${max}`);return v;};
const text=(v,k,required=false,max=500)=>{const s=t(v,max);if(required&&!s)fail(400,'VALIDATION_ERROR',`${k} wajib diisi`);return s;};
const rnd=(len=32)=>{const b=new Uint8Array(len);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
const hash=async(s)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(s))))).map(b=>b.toString(16).padStart(2,'0')).join('');
// Cloudflare Workers membatasi PBKDF2 ke 100.000 iterasi. Hash lama 125.000
// harus direset secara administratif; mengubah angka iterasi tidak memigrasikan hash.
const PASSWORD_ITERATIONS=100000;
const passwordHash=async(pass)=>{const salt=rnd(16);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:PASSWORD_ITERATIONS,hash:'SHA-256'},await crypto.subtle.importKey('raw',new TextEncoder().encode(String(pass)),'PBKDF2',false,['deriveBits']),256);return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('')}`;};
async function verifyPassword(pass,enc){if(typeof enc!=='string'||!enc.startsWith('pbkdf2$'))return false;const [_,iterations,salt,expected]=enc.split('$');const n=Number(iterations);if(!Number.isSafeInteger(n)||n<50000||n>PASSWORD_ITERATIONS||!/^[0-9a-f]{32}$/.test(salt)||!/^[0-9a-f]{64}$/.test(expected))return false;const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:n,hash:'SHA-256'},await crypto.subtle.importKey('raw',new TextEncoder().encode(String(pass)),'PBKDF2',false,['deriveBits']),256);const actual=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');return actual===expected;}
const today=localToday;
const plusDays=(n)=>new Date(Date.parse(today()+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const staffPublic=u=>({id:u.id,username:u.username,name:u.name,role:u.role});
const clientPublic=c=>({id:c.id,name:c.name,tokenPrefix:c.token_prefix,active:!!c.active,createdAt:c.created_at,lastUsedAt:c.last_used_at});
const lookupCookie=req=>{const m=(req.headers.get('cookie')||'').match(/(?:^|;\s*)hs_session=([^;]+)/);return m?decodeURIComponent(m[1]):null;};
const hasOrigin=(req)=>{const origin=req.headers.get('origin');if(!origin)return true;try{return new URL(origin).origin===new URL(req.url).origin;}catch{return false;}};
async function audit(env,actor,action,target='',detail=''){try{await run(env.DB,'INSERT INTO activity_log(actor,action,target,detail) VALUES(?,?,?,?)',actor,action,target,t(detail,400));}catch(e){console.warn('audit:',e.message);}}
async function initUser(env){
  const count=await one(env.DB,'SELECT COUNT(*) n FROM users');if(count?.n)return;
  if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)fail(503,'ADMIN_NOT_CONFIGURED','Pasang secret ADMIN_PASSWORD (minimal 12 karakter) sebelum login pertama');
  await run(env.DB,"INSERT OR IGNORE INTO users(username,name,role,password_hash) VALUES('admin','Administrator','admin',?)",await passwordHash(env.ADMIN_PASSWORD));
  if(env.STAFF_PASSWORD&&env.STAFF_PASSWORD.length>=12)await run(env.DB,"INSERT OR IGNORE INTO users(username,name,role,password_hash) VALUES('receptionist','Resepsionis','receptionist',?)",await passwordHash(env.STAFF_PASSWORD));
  const token=env.PARTNER_TOKEN?.length>=24?env.PARTNER_TOKEN:'unissued_'+rnd(24);
  await run(env.DB,"INSERT OR IGNORE INTO api_clients(name,token_hash,token_prefix) VALUES('Itinerary Yogyakarta',?,?)",await hash(token),token.slice(0,8));
}
async function staffFromCookie(req,db){const token=lookupCookie(req);if(!token)return null;const row=await one(db,`SELECT u.id,u.username,u.name,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`,await hash(token));return row?.active&&row.expires_at>isoNow()?staffPublic(row):null;}
async function partnerFromRequest(req,db){const h=req.headers.get('authorization')||'';const m=h.match(/^(Bearer|Token)\s+(.+)$/i);const tok=m?.[2]?.trim()||req.headers.get('x-api-key');if(!tok)return null;const row=await one(db,'SELECT id,name,active FROM api_clients WHERE token_hash=?',await hash(tok));if(!row?.active)fail(401,'INVALID_TOKEN','Token API tidak valid atau dinonaktifkan');return {id:row.id,name:row.name};}
const needStaff=(u,role)=>{if(!u)fail(401,'UNAUTHENTICATED','Silakan login sebagai staf');if(role&&u.role!==role)fail(403,'FORBIDDEN','Akses khusus admin');};
const needPartner=p=>{if(!p)fail(401,'TOKEN_REQUIRED','Header Authorization: Bearer <token> diperlukan');};
const getRoom=async(db,id)=>{const row=await one(db,'SELECT * FROM rooms WHERE id=?',id);if(!row)fail(404,'ROOM_NOT_FOUND','Tipe kamar tidak ditemukan');return row;};
const getHotel=async(db,id)=>{const row=await one(db,'SELECT * FROM hotels WHERE id=?',id);if(!row)fail(404,'HOTEL_NOT_FOUND','Penginapan tidak ditemukan');return row;};
const getBooking=async(db,id)=>{const row=await one(db,`${BOOKING_SELECT} WHERE b.id=?`,id);if(!row)fail(404,'BOOKING_NOT_FOUND','Booking tidak ditemukan');return row;};
async function guardBooking(req,db,partner,id){const b=await getBooking(db,id);if(partner){if(b.source!==partner.name)fail(404,'BOOKING_NOT_FOUND','Booking tidak ditemukan');return b;}const tok=req.headers.get('x-booking-token');if(b.source!=='website'||!tok||tok.length>256||await hash(tok)!==b.access_token_hash)fail(403,'BOOKING_ACCESS_DENIED','Kode akses booking tidak valid');return b;}
async function used(db,id,a,b){return (await one(db,"SELECT COUNT(*) n FROM bookings WHERE room_id=? AND status IN ('confirmed','checked_in') AND check_in_date<? AND check_out_date>?",id,b,a))?.n||0;}
async function roomsWithDate(db,rows,a,b){if(!a&&!b)return rows.map(toRoom);const n=validRange(a,b,{allowPast:true});const usage=await all(db,"SELECT room_id,COUNT(*) n FROM bookings WHERE status IN ('confirmed','checked_in') AND check_in_date<? AND check_out_date>? GROUP BY room_id",b,a);const map=new Map(usage.map(x=>[x.room_id,x.n]));return rows.map(r=>({...toRoom(r),nights:n,unitsAvailable:Math.max(0,r.total_units-(map.get(r.id)||0)),totalPrice:n*r.price_per_night}));}
async function searchBookings(db,q){let cond=[],args=[];for(const [key,col] of [['status','b.status'],['hotelId','b.hotel_id'],['source','b.source']])if(q.get(key)){cond.push(`${col}=?`);args.push(q.get(key));}if(q.get('q')){cond.push('(b.id LIKE ? OR b.guest_name LIKE ? OR b.guest_phone LIKE ? OR b.guest_email LIKE ?)');const term=new TextDecoder().decode(new TextEncoder().encode(q.get('q')).slice(0,45)).replace(/\uFFFD$/,'');for(let i=0;i<4;i++)args.push('%'+term+'%');}if(q.get('from')){cond.push('b.check_out_date>?');args.push(q.get('from'));}if(q.get('to')){cond.push('b.check_in_date<=?');args.push(q.get('to'));}const lim=Math.min(500,Math.max(1,+q.get('limit')||200));return (await all(db,`${BOOKING_SELECT} ${cond.length?'WHERE '+cond.join(' AND '):''} ORDER BY CASE WHEN b.status IN ('confirmed','checked_in') THEN 0 ELSE 1 END,b.check_in_date ASC,b.id DESC LIMIT ${lim}`,...args)).map(toBooking);}
async function getActivity(db,target,limit=100){const n=Math.max(1,Math.min(+limit||100,500));return target?all(db,`SELECT * FROM activity_log WHERE target=? ORDER BY id DESC LIMIT ${n}`,target):all(db,`SELECT * FROM activity_log ORDER BY id DESC LIMIT ${n}`);}
async function emitWebhook(env,ctx,event,payload){
  if(!env.WEBHOOKS_ENABLED)return;
  ctx.waitUntil((async()=>{const eps=await all(env.DB,'SELECT * FROM webhook_endpoints WHERE active=1');await Promise.all(eps.filter(e=>e.events.split(',').map(x=>x.trim()).includes(event)).map(async e=>{let code=null,success=0,error='';try{if(!safePublicUrl(e.url))throw Error('Unsafe webhook URL');const raw=JSON.stringify({event,payload,at:isoNow()});const mac=await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',new TextEncoder().encode(e.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),new TextEncoder().encode(raw));const signature=Array.from(new Uint8Array(mac),b=>b.toString(16).padStart(2,'0')).join('');const res=await fetch(e.url,{method:'POST',headers:{'Content-Type':'application/json','X-Hotel-Signature':`sha256=${signature}`},body:raw,signal:AbortSignal.timeout(3500)});code=res.status;success=+res.ok;}catch(err){error=String(err.message||err).slice(0,200);}await run(env.DB,'INSERT INTO webhook_deliveries(endpoint_id,event,payload,status_code,success,error) VALUES(?,?,?,?,?,?)',e.id,event,JSON.stringify(payload),code,success,error);}))})().catch(e=>console.warn('webhook:',e.message)));
}
async function createBooking(req,env,ctx,partner,body,sourceOverride){
  const db=env.DB;
  const hotelId=text(body.hotelId,'hotelId',true,40),roomId=text(body.roomId,'roomId',true,40),guestName=text(body.guestName,'guestName',true,120);
  const n=validRange(body.checkIn,body.checkOut);
  const guests=natural(body.guests??1,'guests',1,30);
  const email=t(body.guestEmail,255);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'VALIDATION_ERROR','Email tidak valid');
  const phone=t(body.guestPhone,50),notes=t(body.notes,500);
  const room=await getRoom(db,roomId);if(room.hotel_id!==hotelId)fail(400,'VALIDATION_ERROR','Kamar tidak cocok dengan hotel');if(guests>room.capacity)fail(400,'OVER_CAPACITY',`Kapasitas kamar maksimal ${room.capacity} orang`);
  const source=sourceOverride||(partner?.name||'website'),id='HB-'+rnd(8).toUpperCase(),accessToken=source==='website'?rnd(32):null;
  const result={bookingId:id,status:'confirmed',totalPrice:n*room.price_per_night,...(accessToken?{accessToken}:{})};
  // INSERT...SELECT menjadikan pemeriksaan kapasitas + insert satu operasi SQL atomik.
  const insert=`INSERT INTO bookings(id,hotel_id,room_id,guest_name,guest_email,guest_phone,guests,check_in_date,check_out_date,total_price,status,source,notes,access_token_hash)
  SELECT ?,?,?,?,?,?,?,?,?,?,'confirmed',?,?,? FROM rooms r WHERE r.id=? AND r.hotel_id=? AND r.capacity>=? AND r.total_units>(SELECT COUNT(*) FROM bookings b WHERE b.room_id=r.id AND b.status IN ('confirmed','checked_in') AND b.check_in_date<? AND b.check_out_date>?)`;
  const args=[id,hotelId,roomId,guestName,email,phone,guests,body.checkIn,body.checkOut,result.totalPrice,source,notes,accessToken?await hash(accessToken):null,roomId,hotelId,guests,body.checkOut,body.checkIn];
  const idem=t(req.headers.get('idempotency-key'),128),scope=partner?.name||'website';
  if(req.headers.get('idempotency-key')?.length>128)fail(400,'VALIDATION_ERROR','Idempotency-Key terlalu panjang');
  let idKey=null,bodyHash=null;
  if(idem){idKey=await hash(scope+':'+idem);bodyHash=await hash(JSON.stringify(body));const existing=await one(db,'SELECT response,request_hash FROM idempotency_keys WHERE key=?',idKey);if(existing){if(existing.request_hash!==bodyHash)fail(409,'IDEMPOTENCY_CONFLICT','Idempotency-Key digunakan untuk request berbeda');return json(JSON.parse(existing.response),200);}}
  try{
    const tasks=[db.prepare(insert).bind(...args)];
    if(idKey)tasks.push(db.prepare(`INSERT INTO idempotency_keys(key,response,request_hash) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=?)`).bind(idKey,JSON.stringify(result),bodyHash,id));
    const out=idKey?await db.batch(tasks):[await tasks[0].run()];
    if(!(out[0].meta?.changes>0))fail(409,'ROOM_UNAVAILABLE','Kamar sudah habis untuk rentang tanggal tersebut');
  }catch(e){if(idKey){const existing=await one(db,'SELECT response,request_hash FROM idempotency_keys WHERE key=?',idKey);if(existing){if(existing.request_hash!==bodyHash)fail(409,'IDEMPOTENCY_CONFLICT','Idempotency-Key digunakan untuk request berbeda');return json(JSON.parse(existing.response),200);}}throw e;}
  await audit(env,partner?`partner:${partner.name}`:'tamu','booking.create',id,`${guestName} ${body.checkIn}–${body.checkOut}`);
  await emitWebhook(env,ctx,'booking.confirmed',{...result,hotelId,roomId,checkIn:body.checkIn,checkOut:body.checkOut,source});
  return json(result,201);
}
async function payBooking(env,ctx,id,body,actor){
  const b=await getBooking(env.DB,id);if(!METHODS.includes(body.method))fail(400,'VALIDATION_ERROR','Metode pembayaran demo tidak dikenal');
  if(b.status==='cancelled')fail(409,'BOOKING_CANCELLED','Booking sudah dibatalkan');if(b.payment_status!=='unpaid')fail(409,'ALREADY_PAID','Booking sudah dibayar');
  const result=await run(env.DB,"UPDATE bookings SET payment_status='paid',payment_method=?,paid_amount=total_price,paid_at=? WHERE id=? AND payment_status='unpaid' AND status<>'cancelled'",body.method,isoNow(),id);
  if(!result.meta?.changes)fail(409,'ALREADY_PAID','Status pembayaran sudah berubah');
  await audit(env,actor,'booking.pay',id,`SIMULASI ${body.method}`);const updated=toBooking(await getBooking(env.DB,id));await emitWebhook(env,ctx,'booking.paid',updated);return updated;
}
async function cancelBooking(env,ctx,id,reason,actor){
  const b=await getBooking(env.DB,id),info=cancellation(b);if(!info.allowed)fail(409,'CANNOT_CANCEL',info.reason);
  const status=b.paid_amount?info.refundAmount===b.paid_amount?'refunded':info.refundAmount>0?'partially_refunded':'paid':b.payment_status;
  const result=await run(env.DB,"UPDATE bookings SET status='cancelled',cancelled_at=?,cancel_reason=?,refund_amount=?,payment_status=? WHERE id=? AND status='confirmed'",isoNow(),t(reason,200),info.refundAmount,status,id);
  if(!result.meta?.changes)fail(409,'CANNOT_CANCEL','Booking sudah berubah');
  const response={bookingId:id,status:'cancelled',refund:{percent:b.paid_amount?info.refundPercent:0,amount:info.refundAmount,paymentStatus:status}};
  await audit(env,actor,'booking.cancel',id,`Refund demo Rp${info.refundAmount}`);await emitWebhook(env,ctx,'booking.cancelled',response);return response;
}

// Pemesanan via partner Wisata hanya boleh aktif setelah API partner mendukung
// status PENDING, idempotensi dan penyimpanan persisten; endpoint asli saat ini
// menandai PAID tanpa transaksi sehingga tidak aman digunakan begitu saja.
function wisataEndpoint(env,path){
  if(!env.WISATA_API_BASE_URL||!safePublicUrl(env.WISATA_API_BASE_URL))fail(503,'WISATA_UNCONFIGURED','Alamat layanan Wisata tidak valid');
  const base=new URL(env.WISATA_API_BASE_URL);const target=new URL(path,base);
  if(!safePublicUrl(target.href)||target.origin!==base.origin)fail(503,'WISATA_UNCONFIGURED','URL Wisata tidak aman');
  return target;
}
const wisataId=id=>{if(!/^[1-9]\d{0,8}$/.test(String(id)))fail(400,'VALIDATION_ERROR','ID destinasi tidak valid');return String(id);};
const wisataDate=s=>{const d=typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T00:00:00Z'):null;if(!d||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s||s<today()||s>plusDays(365))fail(400,'VALIDATION_ERROR','Tanggal kunjungan tidak valid');return s;};
async function requestWisata(env,url,init={}){
  let response;try{response=await fetch(url,{...init,signal:AbortSignal.timeout(5000)});}catch{fail(502,'WISATA_UNAVAILABLE','Layanan Wisata tidak dapat dihubungi');}
  let data;try{data=await response.json();}catch{fail(502,'WISATA_BAD_RESPONSE','Layanan Wisata tidak mengembalikan JSON');}
  if(!response.ok)fail(response.status>=500?502:response.status,'WISATA_UPSTREAM_ERROR',typeof data?.error==='string'?data.error:'Permintaan ke layanan Wisata ditolak');
  return data;
}
async function wisataBookingReady(env){
  if(env.WISATA_TICKET_BOOKING_READY!=='true'||!env.WISATA_PARTNER_TOKEN||env.WISATA_PARTNER_TOKEN.length<24)return false;
  // Kontrak baru dari tim Wisata harus secara eksplisit mengumumkan fitur aman.
  try{
    const r=await fetch(wisataEndpoint(env,'/api/v1/partner/capabilities'),{headers:{Authorization:`Bearer ${env.WISATA_PARTNER_TOKEN}`,Accept:'application/json'},signal:AbortSignal.timeout(3000)});
    if(!r.ok)return false;
    const c=await r.json();
    return c?.bookingStatus==='PENDING'&&c?.durableStorage===true&&c?.idempotentBooking===true;
  }catch{return false;}
}

async function handlePublic(req,env,ctx,method,path,q,partner){
  const db=env.DB;
  if(method==='GET'&&path==='/regions'){
    const rows=await all(db,'SELECT city,COUNT(*) n FROM hotels GROUP BY city');const map=new Map(rows.map(x=>[x.city,x.n]));return json(REGIONS.map(name=>({name,hotelCount:map.get(name)||0})));
  }
  if(method==='GET'&&path==='/hotels'){
    const city=q.get('city')?normRegion(q.get('city')):null;if(q.get('city')&&!city)fail(400,'INVALID_REGION','Wilayah DIY tidak dikenal');
    return json((await all(db,city?'SELECT * FROM hotels WHERE city=? ORDER BY id':'SELECT * FROM hotels ORDER BY id',...(city?[city]:[]))).map(toHotel));
  }
  if(method==='GET'&&path==='/rooms'){
    const city=q.get('city')?normRegion(q.get('city')):null;if(q.get('city')&&!city)fail(400,'INVALID_REGION','Wilayah DIY tidak dikenal');
    const rows=await all(db,`SELECT r.*,h.name AS hotel_name,h.area AS hotel_area,h.rating AS hotel_rating,h.city AS hotel_city FROM rooms r JOIN hotels h ON h.id=r.hotel_id ${city?'WHERE h.city=?':''} ORDER BY r.hotel_id,r.price_per_night`,...(city?[city]:[]));
    const prices=await roomsWithDate(db,rows,q.get('checkIn'),q.get('checkOut'));return json(prices.map((room,i)=>({...room,hotelName:rows[i].hotel_name,hotelArea:rows[i].hotel_area,hotelRating:rows[i].hotel_rating})));
  }
  if(method==='GET'&&path==='/policy')return json({cancellation:POLICY,paymentMethods:METHODS});
  if(method==='GET'&&path==='/wisata/tickets/capability')return json({bookingAvailable:await wisataBookingReady(env)});
  let tmatch=path.match(/^\/wisata\/destinations\/([^/]+)\/availability$/);
  if(method==='GET'&&tmatch){
    const id=wisataId(tmatch[1]),date=wisataDate(q.get('date'));
    const qty=natural(q.get('qty'),'qty',1,20);
    const target=wisataEndpoint(env,`/api/v1/destinations/${id}/availability`);
    target.searchParams.set('date',date);target.searchParams.set('qty',String(qty));target.searchParams.set('tier','base');
    const r=await requestWisata(env,target,{headers:{Accept:'application/json'}});
    if(String(r.destination_id)!==id||r.date!==date||Number(r.qty)!==qty||typeof r.available!=='boolean'||
       !Number.isSafeInteger(Number(r.remaining))||Number(r.remaining)<0||!Number.isFinite(Number(r.total))||Number(r.total)<0||
       !Number.isFinite(Number(r.unit_price))||Number(r.unit_price)<0)fail(502,'WISATA_BAD_RESPONSE','Informasi ketersediaan tidak valid');
    return json({destinationId:id,date,qty,available:r.available,remaining:Number(r.remaining),unitPrice:Number(r.unit_price),total:Number(r.total),currency:'IDR'});
  }
  if(method==='POST'&&path==='/wisata/tickets/book'){
    // Pemeriksaan kesiapan sebelum menerima data pribadi dan sebelum ada side-effect.
    if(!await wisataBookingReady(env))fail(503,'WISATA_BOOKING_NOT_READY','Pemesanan tiket belum diaktifkan oleh layanan Wisata');
    const b=await requireBody(req),id=wisataId(b.destinationId),date=wisataDate(b.visitDate);
    const qty=natural(b.qty,'qty',1,20),name=text(b.name,'name',true,120),email=text(b.email,'email',true,200).toLowerCase(),phone=text(b.phone,'phone',false,40);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))fail(400,'VALIDATION_ERROR','Email tidak valid');
    const key=req.headers.get('idempotency-key');
    if(!key||!/^[a-zA-Z0-9_-]{16,80}$/.test(key))fail(400,'VALIDATION_ERROR','Idempotency-Key wajib dan harus valid');
    const target=wisataEndpoint(env,'/api/v1/partner/bookings');
    const result=await requestWisata(env,target,{method:'POST',headers:{Authorization:`Bearer ${env.WISATA_PARTNER_TOKEN}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({destination_id:Number(id),visit_date:date,qty,tier:'base',external_ref:'JS-'+key,customer:{name,email,phone}})});
    if(result.status!=='PENDING'||typeof result.code!=='string'||!result.code)fail(502,'WISATA_BAD_RESPONSE','Respons pemesanan Wisata belum sesuai kontrak PENDING');
    return json({code:result.code,status:'PENDING',destinationId:id,visitDate:date,qty},201);
  }

  let m=path.match(/^\/hotels\/([^/]+)\/recommendations$/);
  if(method==='GET'&&m){
    const hotel=await getHotel(db,decodeURIComponent(m[1]));
    if(!env.WISATA_API_BASE_URL)fail(503,'WISATA_UNCONFIGURED','Alamat API Wisata belum dikonfigurasi');
    if(!safePublicUrl(env.WISATA_API_BASE_URL))fail(503,'WISATA_UNCONFIGURED','URL Wisata harus HTTPS publik');
    const target=new URL(env.WISATA_DESTINATIONS_PATH||'/api/v1/destinations',env.WISATA_API_BASE_URL.endsWith('/')?env.WISATA_API_BASE_URL:env.WISATA_API_BASE_URL+'/');
    if(!safePublicUrl(target.href))fail(503,'WISATA_UNCONFIGURED','Endpoint Wisata tidak valid');
    // API Flask milik Hanif/Andi memakai ?region=<slug>, bukan ?city=<label>.
    target.searchParams.set('region',wisataRegionSlug(hotel.city));target.searchParams.set('limit','8');
    let response;try{response=await fetch(target,{headers:{'Accept':'application/json',...(env.WISATA_API_TOKEN?{'Authorization':`Bearer ${env.WISATA_API_TOKEN}`}:{})},signal:AbortSignal.timeout(4500)});}catch{fail(502,'WISATA_UNAVAILABLE','Wisata Service tidak dapat dihubungi');}
    if(!response.ok)fail(502,'WISATA_UPSTREAM_ERROR',`API Wisata mengembalikan HTTP ${response.status}`);
    let obj;try{obj=await response.json();}catch{fail(502,'WISATA_BAD_RESPONSE','API Wisata tidak mengembalikan JSON');}
    const items=Array.isArray(obj)?obj:[obj?.data,obj?.destinations,obj?.wisata,obj?.results].find(Array.isArray);
    if(!items)fail(502,'WISATA_BAD_RESPONSE','Format daftar destinasi tidak dikenali');
    return json({hotelId:hotel.id,city:hotel.city,source:'Wisata Service',destinations:items.map(x=>destination(x,hotel.city,env.WISATA_API_BASE_URL)).filter(Boolean).slice(0,8)});
  }
  m=path.match(/^\/hotels\/([^/]+)\/availability$/);
  if(method==='GET'&&m){const id=decodeURIComponent(m[1]);await getHotel(db,id);const a=q.get('checkIn'),b=q.get('checkOut'),n=validRange(a,b,{allowPast:true});const rows=await all(db,'SELECT * FROM rooms WHERE hotel_id=? ORDER BY price_per_night',id);const mapped=await roomsWithDate(db,rows,a,b);return json({hotelId:id,checkIn:a,checkOut:b,nights:n,rooms:mapped.map(r=>({roomId:r.roomId,roomType:r.roomType,roomPrice:r.pricePerNight,capacity:r.capacity,unitsAvailable:r.unitsAvailable,totalPrice:r.totalPrice}))});}
  m=path.match(/^\/hotels\/([^/]+)$/);
  if(method==='GET'&&m){const h=await getHotel(db,decodeURIComponent(m[1]));return json({...toHotel(h),rooms:(await all(db,'SELECT * FROM rooms WHERE hotel_id=? ORDER BY price_per_night',h.id)).map(toRoom)});}
  if(method==='POST'&&path==='/hotel-bookings')return createBooking(req,env,ctx,partner,await requireBody(req));
  m=path.match(/^\/hotel-bookings\/([^/]+)(?:\/(pay))?$/);
  if(m){const id=decodeURIComponent(m[1]),b=await guardBooking(req,db,partner,id),actor=partner?`partner:${partner.name}`:'tamu';
    if(method==='GET'&&!m[2])return json(toBooking(b));
    if(method==='POST'&&m[2]==='pay')return json(await payBooking(env,ctx,id,await requireBody(req),actor));
    if(method==='DELETE'&&!m[2])return json(await cancelBooking(env,ctx,id,(await requireBody(req)).reason||q.get('reason'),actor));
  }
  fail(404,'NOT_FOUND',`Endpoint ${method} ${path} tidak ditemukan`);
}
async function handleAuth(req,env,method,path,user){
  if(method==='POST'&&path==='/login'){
    const b=await requireBody(req),username=t(b.username,64).toLowerCase(),password=String(b.password||'');
    if(!username||!password)fail(400,'VALIDATION_ERROR','Username dan password wajib diisi');
    await initUser(env);
    const key=await hash(`${req.headers.get('cf-connecting-ip')||'unknown'}:${username}`),attempt=await one(env.DB,'SELECT count,until FROM login_attempts WHERE key=?',key);
    if(attempt?.count>=8&&attempt.until>Date.now())fail(429,'RATE_LIMIT','Terlalu banyak percobaan login, coba lagi nanti');
    const row=await one(env.DB,'SELECT * FROM users WHERE username=?',username);
    const valid=row?.active&&await verifyPassword(password,row.password_hash);
    if(!valid){const count=attempt?.until>Date.now()?attempt.count+1:1;await run(env.DB,'INSERT INTO login_attempts(key,count,until) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until',key,count,Date.now()+15*60*1000);fail(401,'INVALID_CREDENTIALS','Username atau password salah');}
    await run(env.DB,'DELETE FROM login_attempts WHERE key=?',key);
    const token=rnd(),expiration=new Date(Date.now()+8*3600e3).toISOString();
    await run(env.DB,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hash(token),row.id,expiration);
    await audit(env,username,'auth.login');
    return json({user:staffPublic(row)},200,{'Set-Cookie':`hs_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`});
  }
  if(method==='POST'&&path==='/logout'){
    const token=lookupCookie(req);if(token)await run(env.DB,'DELETE FROM sessions WHERE token_hash=?',await hash(token));
    return json({ok:true},200,{'Set-Cookie':'hs_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
  }
  if(method==='GET'&&path==='/me'){needStaff(user);return json({user});}
  fail(404,'NOT_FOUND','Endpoint autentikasi tidak ditemukan');
}
async function handlePartner(req,env,method,path,q,partner){needPartner(partner);
  if(method==='GET'&&path==='/me')return json({client:partner});
  if(method==='GET'&&path==='/bookings'){const copy=new URLSearchParams(q);copy.set('source',partner.name);return json(await searchBookings(env.DB,copy));}
  fail(404,'NOT_FOUND','Endpoint partner tidak ditemukan');
}
function simpleOpenapi(){return {openapi:'3.0.3',info:{title:'JogjaStay Hotel Service',version:'2.0.0',description:'API interoperabilitas untuk simulasi akademik'},servers:[{url:'/api/v1'}],paths:{'/regions':{get:{summary:'Lima wilayah DIY',responses:{200:{description:'OK'}}}},'/hotels':{get:{summary:'Daftar hotel, filter city',parameters:[{name:'city',in:'query',schema:{type:'string'}}],responses:{200:{description:'OK'}}}},'/hotels/{id}':{get:{summary:'Detail hotel',responses:{200:{description:'OK'}}}},'/rooms':{get:{summary:'Katalog kamar',responses:{200:{description:'OK'}}}},'/hotel-bookings':{post:{summary:'Buat reservasi demo',responses:{201:{description:'Booking dibuat'}}}},'/hotel-bookings/{id}':{get:{summary:'Detail booking dengan X-Booking-Token atau Bearer partner',responses:{200:{description:'OK'}}},delete:{summary:'Batalkan booking',responses:{200:{description:'OK'}}}},'/hotel-bookings/{id}/pay':{post:{summary:'Catat pembayaran simulasi',responses:{200:{description:'OK'}}}},'/hotels/{id}/recommendations':{get:{summary:'Rekomendasi langsung dari API Wisata',responses:{200:{description:'OK'},503:{description:'API Wisata belum dikonfigurasi'}}}},'/partner/bookings':{get:{security:[{bearerAuth:[]}],summary:'Daftar booking milik partner',responses:{200:{description:'OK'}}}}},components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}}};}
async function adminStats(db){
  const now=today(), n=async(sql,...p)=>(await one(db,sql,...p))?.n||0;
  const totalUnits=await n('SELECT COALESCE(SUM(total_units),0) n FROM rooms');
  const occupied=await n("SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','checked_in') AND check_in_date<=? AND check_out_date>?",now,now);
  const bySource=await all(db,"SELECT source,COUNT(*) count FROM bookings WHERE status<>'cancelled' GROUP BY source ORDER BY count DESC");
  const byHotel=await all(db,`SELECT h.id hotelId,h.name,COUNT(b.id) active FROM hotels h LEFT JOIN bookings b ON b.hotel_id=h.id AND b.status IN ('confirmed','checked_in') AND b.check_out_date>? GROUP BY h.id ORDER BY h.id`,now);
  const next7Days=[];for(let i=0;i<7;i++){const day=plusDays(i);next7Days.push({date:day,occupied:await n("SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','checked_in') AND check_in_date<=? AND check_out_date>?",day,day)});}
  return {today:now,arrivalsToday:await n("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND check_in_date=?",now),departuresToday:await n("SELECT COUNT(*) n FROM bookings WHERE status='checked_in' AND check_out_date<=?",now),inHouse:await n("SELECT COUNT(*) n FROM bookings WHERE status='checked_in'"),upcoming:await n("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND check_in_date>?",now),unpaid:await n("SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','checked_in') AND payment_status='unpaid'"),occupancy:{occupied,totalUnits,percent:totalUnits?Math.round(occupied/totalUnits*100):0},revenueThisMonth:await n('SELECT COALESCE(SUM(paid_amount-refund_amount),0) n FROM bookings WHERE substr(paid_at,1,7)=?',now.slice(0,7)),bySource,byHotel,next7Days};
}
const ROOM_TYPES=['Standard','Deluxe','Suite','Family','Villa','Villa Suite','Eco Villa','Sea View Suite','Adventure Suite'];
async function roomInput(db,b,partial=false){
  const f={};if(!partial||b.hotelId!==undefined){await getHotel(db,b.hotelId);f.hotel_id=b.hotelId;}
  if(!partial||b.roomType!==undefined){if(!ROOM_TYPES.includes(b.roomType))fail(400,'VALIDATION_ERROR','Tipe kamar tidak dikenal');f.room_type=b.roomType;}
  for(const [key,col,min] of [['pricePerNight','price_per_night',0],['capacity','capacity',1],['totalUnits','total_units',0],['sizeM2','size_m2',0]])if(!partial||b[key]!==undefined)f[col]=natural(b[key]??0,key,min);
  for(const [key,col,max] of [['bedType','bed_type',80],['description','description',2000],['imageUrl','image_url',500]])if(!partial||b[key]!==undefined)f[col]=t(b[key],max);
  if(!partial||b.facilities!==undefined)f.facilities=(Array.isArray(b.facilities)?b.facilities:String(b.facilities||'').split(',')).map(x=>t(x,100)).filter(Boolean).join(',');
  if(f.image_url&&!(/^https?:\/\//.test(f.image_url)||f.image_url.startsWith('img/')))fail(400,'VALIDATION_ERROR','imageUrl harus URL http(s) atau path img/');
  return f;
}
async function hotelInput(b,partial=false){
  const f={};for(const [key,max] of [['name',120],['address',200],['area',80],['description',2500],['imageUrl',500]])if(!partial||b[key]!==undefined)f[key==='imageUrl'?'image_url':key]=text(b[key],key,['name','address'].includes(key),max);
  if(!partial||b.city!==undefined){const city=normRegion(b.city);if(!city)fail(400,'INVALID_REGION','Wilayah bukan bagian dari DIY');f.city=city;}
  if(!partial||b.rating!==undefined)f.rating=natural(b.rating,'rating',1,5);
  return f;
}
const formFields=(f)=>Object.keys(f).map(k=>`${k}=?`).join(',');
async function nextId(db,table,prefix){const row=await one(db,`SELECT MAX(CAST(substr(id,${prefix.length+1}) AS INTEGER)) m FROM ${table} WHERE id LIKE ?`,prefix+'%');return prefix+String((row?.m||0)+1).padStart(2,'0');}
async function userList(db){return (await all(db,'SELECT * FROM users ORDER BY role,username')).map(u=>({id:u.id,username:u.username,name:u.name,role:u.role,active:!!u.active,createdAt:u.created_at}));}
async function clientList(db){const rows=await all(db,'SELECT * FROM api_clients ORDER BY id');return Promise.all(rows.map(async r=>({...clientPublic(r),bookings:(await one(db,'SELECT COUNT(*) n FROM bookings WHERE source=?',r.name)).n})));}
async function handleAdmin(req,env,ctx,method,path,q,user){
  needStaff(user);const db=env.DB,actor=user.username;
  if(method==='GET'&&path==='/stats')return json(await adminStats(db));
  if(method==='GET'&&path==='/activity')return json(await getActivity(db,q.get('target'),q.get('limit')));
  if(method==='GET'&&path==='/bookings')return json(await searchBookings(db,q));
  if(method==='GET'&&path==='/hotels')return json((await all(db,'SELECT * FROM hotels ORDER BY id')).map(toHotel));
  if(method==='GET'&&path==='/rooms')return json((await all(db,'SELECT * FROM rooms ORDER BY hotel_id,id')).map(toRoom));
  let m=path.match(/^\/bookings\/([^/]+)(?:\/(check-in|check-out|payment|cancel))?$/);
  if(m){const id=decodeURIComponent(m[1]),act=m[2],b=await getBooking(db,id);
    if(method==='GET'&&!act)return json({...toBooking(b),activity:await getActivity(db,id)});
    if(method==='PATCH'&&!act){if(['cancelled','checked_out'].includes(b.status))fail(409,'INVALID_STATUS','Booking sudah selesai/dibatalkan');const body=await requireBody(req);let f={};for(const [key,col,max] of [['guestName','guest_name',120],['guestEmail','guest_email',255],['guestPhone','guest_phone',50],['notes','notes',500]])if(body[key]!==undefined)f[col]=text(body[key],key,key==='guestName',max);if(body.guests!==undefined){const room=await getRoom(db,b.room_id);f.guests=natural(body.guests,'guests',1,room.capacity);}if(!Object.keys(f).length)fail(400,'VALIDATION_ERROR','Tidak ada field berubah');await run(db,`UPDATE bookings SET ${formFields(f)} WHERE id=?`,...Object.values(f),id);await audit(env,actor,'booking.update',id);return json(toBooking(await getBooking(db,id)));}
    if(method==='POST'&&act==='payment')return json(await payBooking(env,ctx,id,await requireBody(req),actor));
    if(method==='POST'&&act==='cancel')return json(await cancelBooking(env,ctx,id,(await requireBody(req)).reason,actor));
    if(method==='POST'&&act==='check-in'){if(b.status!=='confirmed')fail(409,'INVALID_STATUS','Check-in hanya untuk booking confirmed');if(today()<b.check_in_date||today()>=b.check_out_date)fail(409,'INVALID_DATE','Tanggal check-in di luar rentang menginap');const r=await run(db,"UPDATE bookings SET status='checked_in',checked_in_at=? WHERE id=? AND status='confirmed'",isoNow(),id);if(!r.meta?.changes)fail(409,'INVALID_STATUS','Status booking berubah');await audit(env,actor,'booking.check_in',id);const updated=toBooking(await getBooking(db,id));await emitWebhook(env,ctx,'booking.checked_in',updated);return json(updated);}
    if(method==='POST'&&act==='check-out'){if(b.status!=='checked_in')fail(409,'INVALID_STATUS','Check-out hanya setelah check-in');if(b.payment_status==='unpaid')fail(409,'UNPAID_BALANCE','Tagihan simulasi belum dibayar');const r=await run(db,"UPDATE bookings SET status='checked_out',checked_out_at=? WHERE id=? AND status='checked_in'",isoNow(),id);if(!r.meta?.changes)fail(409,'INVALID_STATUS','Status booking berubah');await audit(env,actor,'booking.check_out',id);const updated=toBooking(await getBooking(db,id));await emitWebhook(env,ctx,'booking.checked_out',updated);return json(updated);}
  }
  if(method==='POST'&&path==='/bookings')return createBooking(req,env,ctx,null,await requireBody(req),'walk-in');
  m=path.match(/^\/rooms\/([^/]+)$/);
  if(method==='POST'&&path==='/rooms'){needStaff(user,'admin');const f=await roomInput(db,await requireBody(req));const id=await nextId(db,'rooms','R');await run(db,`INSERT INTO rooms(id,${Object.keys(f).join(',')}) VALUES(?,${Object.keys(f).map(()=>'?').join(',')})`,id,...Object.values(f));await audit(env,actor,'room.create',id);return json(toRoom(await getRoom(db,id)),201);}
  if(m){needStaff(user,'admin');const id=decodeURIComponent(m[1]);await getRoom(db,id);if(method==='PATCH'){const f=await roomInput(db,await requireBody(req),true);if(!Object.keys(f).length)fail(400,'VALIDATION_ERROR','Tidak ada perubahan');await run(db,`UPDATE rooms SET ${formFields(f)} WHERE id=?`,...Object.values(f),id);await audit(env,actor,'room.update',id);return json(toRoom(await getRoom(db,id)));}if(method==='DELETE'){const b=await one(db,'SELECT 1 ok FROM bookings WHERE room_id=? LIMIT 1',id);if(b)fail(409,'ROOM_IN_USE','Kamar punya riwayat booking; set stok ke 0');await run(db,'DELETE FROM rooms WHERE id=?',id);await audit(env,actor,'room.delete',id);return json({roomId:id,deleted:true});}}
  m=path.match(/^\/hotels\/([^/]+)$/);
  if(method==='POST'&&path==='/hotels'){needStaff(user,'admin');const f=await hotelInput(await requireBody(req));const id=await nextId(db,'hotels','H');await run(db,`INSERT INTO hotels(id,${Object.keys(f).join(',')}) VALUES(?,${Object.keys(f).map(()=>'?').join(',')})`,id,...Object.values(f));await audit(env,actor,'hotel.create',id);return json(toHotel(await getHotel(db,id)),201);}
  if(m){needStaff(user,'admin');const id=decodeURIComponent(m[1]);await getHotel(db,id);if(method==='PATCH'){const f=await hotelInput(await requireBody(req),true);if(!Object.keys(f).length)fail(400,'VALIDATION_ERROR','Tidak ada perubahan');await run(db,`UPDATE hotels SET ${formFields(f)} WHERE id=?`,...Object.values(f),id);await audit(env,actor,'hotel.update',id);return json(toHotel(await getHotel(db,id)));}}
  if(path==='/users'&&method==='GET'){needStaff(user,'admin');return json(await userList(db));}
  if(path==='/users'&&method==='POST'){needStaff(user,'admin');const b=await requireBody(req),username=text(b.username,'username',true,40).toLowerCase();if(!/^[a-z0-9._-]{3,40}$/.test(username))fail(400,'VALIDATION_ERROR','Username tidak valid');if(!['admin','receptionist'].includes(b.role))fail(400,'VALIDATION_ERROR','Role tidak valid');if(String(b.password||'').length<12)fail(400,'VALIDATION_ERROR','Password minimal 12 karakter');try{await run(db,'INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)',username,text(b.name,'name',true,80),b.role,await passwordHash(b.password));}catch{fail(409,'USERNAME_TAKEN','Username sudah digunakan');}await audit(env,actor,'user.create',username);const row=await one(db,'SELECT * FROM users WHERE username=?',username);return json({id:row.id,username:row.username,name:row.name,role:row.role,active:!!row.active,createdAt:row.created_at},201);}
  m=path.match(/^\/users\/(\d+)$/);
  if(m&&method==='PATCH'){needStaff(user,'admin');const id=+m[1],b=await requireBody(req),row=await one(db,'SELECT * FROM users WHERE id=?',id);if(!row)fail(404,'USER_NOT_FOUND','Akun tidak ditemukan');const f={};if(b.name!==undefined)f.name=text(b.name,'name',true,80);if(b.role!==undefined){if(!['admin','receptionist'].includes(b.role))fail(400,'VALIDATION_ERROR','Role tidak valid');if(id===user.id&&b.role!=='admin')fail(409,'SELF_LOCKOUT','Tidak bisa mengubah role sendiri');f.role=b.role;}if(b.active!==undefined){if(id===user.id&&!b.active)fail(409,'SELF_LOCKOUT','Tidak bisa menonaktifkan diri');f.active=b.active?1:0;}if(b.password!==undefined){if(String(b.password).length<12)fail(400,'VALIDATION_ERROR','Password minimal 12 karakter');f.password_hash=await passwordHash(b.password);}if(!Object.keys(f).length)fail(400,'VALIDATION_ERROR','Tidak ada perubahan');await run(db,`UPDATE users SET ${formFields(f)} WHERE id=?`,...Object.values(f),id);if(f.active===0||f.password_hash)await run(db,'DELETE FROM sessions WHERE user_id=?',id);await audit(env,actor,'user.update',row.username);const u=await one(db,'SELECT * FROM users WHERE id=?',id);return json({id:u.id,username:u.username,name:u.name,role:u.role,active:!!u.active,createdAt:u.created_at});}
  if(path==='/api-clients'&&method==='GET'){needStaff(user,'admin');return json(await clientList(db));}
  m=path.match(/^\/api-clients\/(\d+)\/(rotate|revoke|enable)$/);
  if(m&&method==='POST'){needStaff(user,'admin');const id=+m[1],client=await one(db,'SELECT * FROM api_clients WHERE id=?',id);if(!client)fail(404,'CLIENT_NOT_FOUND','Partner tidak ditemukan');if(m[2]==='rotate'){const tok='hs_'+rnd(24);await run(db,'UPDATE api_clients SET token_hash=?,token_prefix=?,active=1 WHERE id=?',await hash(tok),tok.slice(0,8),id);await audit(env,actor,'client.rotate',client.name);return json({...clientPublic({...client,token_prefix:tok.slice(0,8),active:1}),token:tok});}const active=m[2]==='enable'?1:0;await run(db,'UPDATE api_clients SET active=? WHERE id=?',active,id);await audit(env,actor,active?'client.enable':'client.revoke',client.name);return json(clientPublic({...client,active}));}
  // Admin webhook CRUD (pengiriman opsional, diaktifkan dengan WEBHOOKS_ENABLED=true)
  if(path==='/webhooks'&&method==='GET'){needStaff(user,'admin');return json(await all(db,'SELECT id,name,url,events,active,created_at,last_used_at FROM webhook_endpoints ORDER BY id'));}
  if(path==='/webhooks'&&method==='POST'){needStaff(user,'admin');const b=await requireBody(req);if(!safePublicUrl(b.url))fail(400,'VALIDATION_ERROR','Webhook harus HTTPS publik');const secret=rnd(32);const ev=Array.isArray(b.events)?b.events.join(','):(b.events||'booking.confirmed,booking.paid,booking.cancelled,booking.checked_in,booking.checked_out');const result=await run(db,'INSERT INTO webhook_endpoints(name,url,secret,events) VALUES(?,?,?,?)',text(b.name,'name',true,100),b.url,secret,ev);return json({id:result.meta.last_row_id,name:b.name,url:b.url,events:ev,secret,active:1},201);}
  m=path.match(/^\/webhooks\/(\d+)(?:\/(deliveries|test))?$/);
  if(m){needStaff(user,'admin');const id=+m[1],ep=await one(db,'SELECT * FROM webhook_endpoints WHERE id=?',id);if(!ep)fail(404,'NOT_FOUND','Webhook tidak ditemukan');if(method==='GET'&&m[2]==='deliveries')return json(await all(db,'SELECT * FROM webhook_deliveries WHERE endpoint_id=? ORDER BY id DESC LIMIT 50',id));if(method==='DELETE'&&!m[2]){await run(db,'DELETE FROM webhook_endpoints WHERE id=?',id);return json({deleted:true});}if(method==='PUT'&&!m[2]){const b=await requireBody(req);if(b.url!==undefined&&!safePublicUrl(b.url))fail(400,'VALIDATION_ERROR','Webhook URL tidak aman');await run(db,'UPDATE webhook_endpoints SET name=?,url=?,events=?,active=? WHERE id=?',t(b.name??ep.name,100),b.url??ep.url,Array.isArray(b.events)?b.events.join(','):(b.events??ep.events),b.active===undefined?ep.active:+!!b.active,id);return json(await one(db,'SELECT id,name,url,events,active,created_at,last_used_at FROM webhook_endpoints WHERE id=?',id));}if(method==='POST'&&m[2]==='test'){await emitWebhook({...env,WEBHOOKS_ENABLED:'true'},ctx,'booking.confirmed',{bookingId:'TEST-0000',test:true});return json({sent:true,message:'Test event dijadwalkan'});}}
  fail(404,'NOT_FOUND',`Endpoint admin ${method} ${path} tidak ditemukan`);
}
const respondAsset=(env,req,file)=>env.ASSETS.fetch(new Request(new URL(file,req.url),req));
function withHeaders(res,req,env){
  const h=new Headers(res.headers);h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const origin=req.headers.get('origin');const permitted=(env.CORS_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(origin&&permitted.includes(origin)){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');}
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
}
export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url),pathname=url.pathname,method=req.method.toUpperCase(),q=url.searchParams;
  try{
    if(!env.DB)fail(503,'DATABASE_NOT_CONFIGURED','Cloudflare D1 binding DB belum dikonfigurasi');
    if(method==='OPTIONS'&&pathname.startsWith('/api/')){
      const origin=req.headers.get('origin'),permitted=(env.CORS_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim());
      if(!origin||!permitted.includes(origin))return withHeaders(json({error:true,message:'Origin tidak diizinkan'},403),req,env);
      return withHeaders(new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization, X-API-Key, X-Booking-Token, Idempotency-Key','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','Vary':'Origin'}}),req,env);
    }
    if(['POST','PUT','PATCH','DELETE'].includes(method)&&!hasOrigin(req))fail(403,'INVALID_ORIGIN','Permintaan lintas situs ditolak');
    if(method==='GET'&&pathname==='/health'){
      const row=await one(env.DB,'SELECT COUNT(*) n FROM hotels');return withHeaders(json({status:'ok',service:'hotel-service',database:'D1',hotels:row.n}),req,env);
    }
    if(method==='GET'&&pathname==='/api/docs')return withHeaders(await respondAsset(env,req,'/docs'),req,env);
    if(method==='GET'&&pathname==='/api/v1/semantic/regions')return withHeaders(json(semanticDescription),req,env);
    if(method==='GET'&&pathname==='/api/openapi.json')return withHeaders(json(simpleOpenapi()),req,env);
    if(method==='GET'&&pathname==='/api/v1')return withHeaders(json({service:'hotel-service',version:'v1',docs:'/api/docs',openapi:'/api/openapi.json',endpoints:['/regions','/hotels','/rooms','/hotel-bookings','/partner/bookings','/hotels/{id}/recommendations','/auth/login','/admin/*']}),req,env);
    if(method==='GET'&&pathname==='/login'){const u=await staffFromCookie(req,env.DB);if(u)return Response.redirect(new URL('/dashboard',req.url),302);return withHeaders(await respondAsset(env,req,'/login'),req,env);}
    if(method==='GET'&&pathname==='/dashboard'){const u=await staffFromCookie(req,env.DB);if(!u)return Response.redirect(new URL('/login',req.url),302);return withHeaders(await respondAsset(env,req,'/dashboard'),req,env);}
    const api=pathname.startsWith('/api/v1/')?pathname.slice('/api/v1'.length):pathname;
    const user=pathname.startsWith('/api/v1/admin/')||pathname.startsWith('/api/v1/auth/')?await staffFromCookie(req,env.DB):null;
    const partner=api.startsWith('/auth/')||api.startsWith('/admin/')?null:await partnerFromRequest(req,env.DB);
    let result;
    if(pathname.startsWith('/api/v1/auth/'))result=await handleAuth(req,env,method,api.slice('/auth'.length),user);
    else if(pathname.startsWith('/api/v1/admin/'))result=await handleAdmin(req,env,ctx,method,api.slice('/admin'.length),q,user);
    else if(pathname.startsWith('/api/v1/partner/'))result=await handlePartner(req,env,method,api.slice('/partner'.length),q,partner);
    else if(pathname.startsWith('/api/v1/')||/^(\/hotels|\/rooms|\/regions|\/hotel-bookings|\/policy)(\/|$)/.test(pathname))result=await handlePublic(req,env,ctx,method,api,q,partner);
    else result=await env.ASSETS.fetch(req);
    return withHeaders(result,req,env);
  }catch(e){
    if(!(e instanceof ApiError)){console.error('JogjaStay API error:',e);return withHeaders(json({error:true,code:'INTERNAL_ERROR',message:'Internal server error'},500),req,env);}
    return withHeaders(json({error:true,code:e.code,message:e.message},e.status),req,env);
  }
 }
};
