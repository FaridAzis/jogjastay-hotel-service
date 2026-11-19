import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.mjs';
import {normRegion,validRange,destination} from '../src/logic.mjs';

let db,env;
function d1(sqlite){
 return {
   prepare(sql){return {bind(...args){
     const stmt=sqlite.prepare(sql);
     return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>{
       const info=stmt.run(...args);return {meta:{changes:Number(info.changes),last_row_id:Number(info.lastInsertRowid)}};
     }};
   }};
   },
   async batch(stmts){sqlite.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
}
function req(path,method='GET',body,headers={}){return new Request('https://jogjastay.workers.dev'+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const context={waitUntil(p){p.catch(()=>{});}};
async function call(path,method='GET',body,headers={}){const res=await worker.fetch(req(path,method,body,headers),env,context);let data;try{data=await res.json();}catch{data=null;}return {status:res.status,data,headers:res.headers};}
const addDays=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
before(()=>{
 db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));db.exec(fs.readFileSync(new URL('../db/seed.sql',import.meta.url),'utf8'));
 env={DB:d1(db),ADMIN_PASSWORD:'A_VeryStrongTestPasswordWithLength_123!',PARTNER_TOKEN:'hs_very_long_partner_test_token_1234567890',ASSETS:{fetch:async()=>new Response('<html>asset</html>',{headers:{'Content-Type':'text/html'}})}};
});
test('region normalization and validation',()=>{assert.equal(normRegion('Kabupaten Kulon Progo'),'Kulon Progo');assert.equal(normRegion('Gunung Kidul'),'Gunungkidul');assert.equal(normRegion('Banjarmasin'),null);assert.throws(()=>validRange('2026-02-30','2026-03-03'),{code:'INVALID_DATE'});assert.equal(destination({id:123,name:'Candi',city:'Sleman'},'Sleman').name,'Candi');});
test('50 hotel dan minimal 10 per wilayah',async()=>{const r=await call('/api/v1/regions');assert.equal(r.status,200);assert.equal(r.data.length,5);for(const x of r.data)assert.ok(x.hotelCount>=10);const h=await call('/api/v1/hotels');assert.equal(h.data.length,50);assert.ok((await call('/api/v1/hotels?city=Kulon%20Progo')).data.length>=10);});
test('rooms and availability',async()=>{let h=await call('/api/v1/hotels/H01');assert.ok(h.data.rooms.length);let r=await call('/api/v1/rooms?city=Sleman');assert.ok(r.data.length);r=await call(`/api/v1/hotels/H01/availability?checkIn=${addDays(10)}&checkOut=${addDays(12)}`);assert.equal(r.status,200);assert.equal(r.data.nights,2);});
let bookingId,accessToken;
test('guest booking with private token',async()=>{const room=(await call('/api/v1/hotels/H01')).data.rooms[0];const result=await call('/api/v1/hotel-bookings','POST',{hotelId:'H01',roomId:room.roomId,guestName:'Tamu Demo',guests:1,checkIn:addDays(10),checkOut:addDays(12)});assert.equal(result.status,201,JSON.stringify(result.data));assert.ok(result.data.bookingId);assert.ok(result.data.accessToken);bookingId=result.data.bookingId;accessToken=result.data.accessToken;});
test('unauthorized guest cannot read/pay/cancel',async()=>{const unauthorized=await call('/api/v1/hotel-bookings/'+bookingId);assert.equal(unauthorized.status,403);const cancel=await call('/api/v1/hotel-bookings/'+bookingId,'DELETE',{reason:'demo'});assert.equal(cancel.status,403);});
test('guest booking detail and simulation payment/refund',async()=>{const h={'X-Booking-Token':accessToken};let r=await call('/api/v1/hotel-bookings/'+bookingId,'GET',undefined,h);assert.equal(r.status,200);assert.equal(r.data.guestName,'Tamu Demo');r=await call('/api/v1/hotel-bookings/'+bookingId+'/pay','POST',{method:'qris'},h);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.payment.status,'paid');r=await call('/api/v1/hotel-bookings/'+bookingId,'DELETE',{reason:'demo'},h);assert.equal(r.status,200);assert.equal(r.data.status,'cancelled');assert.equal(r.data.refund.percent,100);});
let cookie;
test('staff bootstrap/login/session',async()=>{const r=await call('/api/v1/auth/login','POST',{username:'admin',password:env.ADMIN_PASSWORD});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.user.role,'admin');cookie=r.headers.get('set-cookie').split(';')[0];const me=await call('/api/v1/auth/me','GET',undefined,{Cookie:cookie});assert.equal(me.status,200);const dashboard=await call('/dashboard','GET',undefined,{Cookie:cookie});assert.equal(dashboard.status,200);});
test('PBKDF2 baru kompatibel Workers dan hash lama tidak menyebabkan HTTP 500',async()=>{
 const prior=db.prepare("SELECT password_hash FROM users WHERE username='admin'").get().password_hash;
 assert.match(prior,/^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
 try{
  db.prepare("UPDATE users SET password_hash=? WHERE username='admin'").run(prior.replace('$100000$','$125000$'));
  const failed=await call('/api/v1/auth/login','POST',{username:'admin',password:env.ADMIN_PASSWORD});
  assert.equal(failed.status,401,JSON.stringify(failed.data));
  assert.equal(failed.data.code,'INVALID_CREDENTIALS');
 }finally{
  db.prepare("UPDATE users SET password_hash=? WHERE username='admin'").run(prior);
  db.prepare('DELETE FROM login_attempts').run();
 }
 const ok=await call('/api/v1/auth/login','POST',{username:'admin',password:env.ADMIN_PASSWORD});
 assert.equal(ok.status,200,JSON.stringify(ok.data));
});
test('login, dashboard, dan docs memakai URL asset kanonis tanpa redirect loop',async()=>{
 const original=env.ASSETS;const paths=[];
 env.ASSETS={fetch:async request=>{paths.push(new URL(request.url).pathname);return new Response('<html>halaman</html>',{status:200,headers:{'Content-Type':'text/html'}});}};
 try{
  let r=await worker.fetch(req('/login'),env,context);assert.equal(r.status,200);assert.equal(paths.at(-1),'/login');
  r=await worker.fetch(req('/dashboard','GET',undefined,{Cookie:cookie}),env,context);assert.equal(r.status,200);assert.equal(paths.at(-1),'/dashboard');
  r=await worker.fetch(req('/api/docs'),env,context);assert.equal(r.status,200);assert.equal(paths.at(-1),'/docs');
 }finally{env.ASSETS=original;}
});
test('dashboard stats, catalog, audit, partner',async()=>{const h={Cookie:cookie};let r=await call('/api/v1/admin/stats','GET',undefined,h);assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(Array.isArray(r.data.bySource));r=await call('/api/v1/admin/bookings','GET',undefined,h);assert.equal(r.status,200);r=await call('/api/v1/admin/api-clients','GET',undefined,h);assert.equal(r.status,200);assert.equal(r.data.length,1);});
test('partner auth, room booking, ownership',async()=>{const h={Authorization:'Bearer '+env.PARTNER_TOKEN};let r=await call('/api/v1/partner/me','GET',undefined,h);assert.equal(r.status,200);const room=(await call('/api/v1/hotels/H01')).data.rooms[0];r=await call('/api/v1/hotel-bookings','POST',{hotelId:'H01',roomId:room.roomId,guestName:'Partner Demo',guests:1,checkIn:addDays(20),checkOut:addDays(22)},h);assert.equal(r.status,201);assert.equal(r.data.accessToken,undefined);const id=r.data.bookingId;const own=await call('/api/v1/hotel-bookings/'+id,'GET',undefined,h);assert.equal(own.status,200);const other=await call('/api/v1/hotel-bookings/'+id);assert.equal(other.status,403);});
test('Wisata integration is truthful before configured',async()=>{const r=await call('/api/v1/hotels/H01/recommendations');assert.equal(r.status,503);assert.equal(r.data.code,'WISATA_UNCONFIGURED');});
test('idempotency key reuses same booking',async()=>{const room=(await call('/api/v1/hotels/H02')).data.rooms[0],body={hotelId:'H02',roomId:room.roomId,guestName:'Dina',guests:1,checkIn:addDays(25),checkOut:addDays(26)};const a=await call('/api/v1/hotel-bookings','POST',body,{'Idempotency-Key':'demo123'});const b=await call('/api/v1/hotel-bookings','POST',body,{'Idempotency-Key':'demo123'});assert.equal(a.status,201);assert.equal(b.status,200,JSON.stringify(b.data));assert.equal(a.data.bookingId,b.data.bookingId);});


test('admin CRUD hotel dan kamar',async()=>{
 const h={Cookie:cookie};let r=await call('/api/v1/admin/hotels','POST',{name:'Hotel Demo Baru',address:'Jalan Demo',city:'Kabupaten Bantul',area:'Bantul',rating:4,description:'Uji',imageUrl:''},h);
 assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.hotelId;
 r=await call('/api/v1/admin/hotels/'+id,'PATCH',{name:'Hotel Demo Update'},h);assert.equal(r.status,200);assert.equal(r.data.name,'Hotel Demo Update');
 r=await call('/api/v1/admin/rooms','POST',{hotelId:id,roomType:'Deluxe',pricePerNight:250000,capacity:2,totalUnits:3,description:'Uji',facilities:['WiFi','AC']},h);
 assert.equal(r.status,201,JSON.stringify(r.data));const roomId=r.data.roomId;
 r=await call('/api/v1/admin/rooms/'+roomId,'PATCH',{pricePerNight:280000},h);assert.equal(r.status,200);assert.equal(r.data.pricePerNight,280000);
 r=await call('/api/v1/admin/rooms/'+roomId,'DELETE',{},h);assert.equal(r.status,200);assert.equal(r.data.deleted,true);
});
test('admin kelola user & penggantian token partner',async()=>{
 const h={Cookie:cookie};let r=await call('/api/v1/admin/users','POST',{username:'stafdemo',name:'Petugas Demo',role:'receptionist',password:'VeryLongPasswordTest_12345'},h);
 assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.id;
 r=await call('/api/v1/admin/users/'+id,'PATCH',{active:false},h);assert.equal(r.status,200);assert.equal(r.data.active,false);
 const partners=(await call('/api/v1/admin/api-clients','GET',undefined,h)).data;
 r=await call('/api/v1/admin/api-clients/'+partners[0].id+'/rotate','POST',{},h);assert.equal(r.status,200);assert.ok(r.data.token.startsWith('hs_'));
 const me=await call('/api/v1/partner/me','GET',undefined,{Authorization:'Bearer '+r.data.token});assert.equal(me.status,200);
 const old=await call('/api/v1/partner/me','GET',undefined,{Authorization:'Bearer '+env.PARTNER_TOKEN});assert.equal(old.status,401);
});
test('tolak booking kapasitas melebihi maksimum, tanggal tidak valid',async()=>{
 const room=(await call('/api/v1/hotels/H01')).data.rooms[0];let r=await call('/api/v1/hotel-bookings','POST',{hotelId:'H01',roomId:room.roomId,guestName:'Demo',guests:room.capacity+1,checkIn:addDays(15),checkOut:addDays(16)});assert.equal(r.status,400);assert.equal(r.data.code,'OVER_CAPACITY');
 r=await call('/api/v1/hotel-bookings','POST',{hotelId:'H01',roomId:room.roomId,guestName:'Demo',guests:1,checkIn:addDays(-4),checkOut:addDays(-3)});assert.equal(r.status,400);assert.equal(r.data.code,'DATE_IN_PAST');
});
test('tolak serangan cross-origin pada operasi publik',async()=>{
 const room=(await call('/api/v1/hotels/H01')).data.rooms[0];const r=await call('/api/v1/hotel-bookings','POST',{hotelId:'H01',roomId:room.roomId,guestName:'Demo',guests:1,checkIn:addDays(11),checkOut:addDays(12)},{Origin:'https://unknown.example'});
 assert.equal(r.status,403);assert.equal(r.data.code,'INVALID_ORIGIN');
});
test('server Hotel mengambil data rekomendasi dari API Wisata (stub terkontrol)',async()=>{
 const original=globalThis.fetch;
 env.WISATA_API_BASE_URL='https://wisata.example';
 globalThis.fetch=async()=>new Response(JSON.stringify({data:[{id:'W1',name:'Wisata Sleman',city:'Sleman',price:15000},{id:'W2',name:'Wisata Bantul',city:'Bantul'}]}),{headers:{'Content-Type':'application/json'}});
 try{const h=(await call('/api/v1/hotels?city=Sleman')).data[0];const r=await call(`/api/v1/hotels/${h.hotelId}/recommendations`);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.destinations.length,1);assert.equal(r.data.destinations[0].wisataId,'W1');}
 finally{globalThis.fetch=original;delete env.WISATA_API_BASE_URL;}
});
test('stok kamar tidak bisa dipesan melebihi kapasitas (atomic SQL)',async()=>{
 const h={Cookie:cookie};const room=(await call('/api/v1/hotels/H02')).data.rooms[0];let r=await call('/api/v1/admin/rooms/'+room.roomId,'PATCH',{totalUnits:1},h);assert.equal(r.status,200);
 const body={hotelId:'H02',roomId:room.roomId,guestName:'Check stok',guests:1,checkIn:addDays(40),checkOut:addDays(41)};
 const a=await call('/api/v1/hotel-bookings','POST',body);assert.equal(a.status,201);
 const b=await call('/api/v1/hotel-bookings','POST',body);assert.equal(b.status,409,JSON.stringify(b.data));assert.equal(b.data.code,'ROOM_UNAVAILABLE');
});
test('health endpoint dan proteksi dashboard staf',async()=>{
 const h=await call('/health');assert.equal(h.status,200);assert.equal(h.data.hotels,51); // satu hotel baru dari uji CRUD
 const r=await worker.fetch(req('/dashboard'),env,context);assert.equal(r.status,302);assert.ok(r.headers.get('location').includes('/login'));
});

test('kontrak asli Wisata Jogja: region slug, daftar JSON, foto dan deep link', async()=>{
 const oldFetch=globalThis.fetch;
 env.WISATA_API_BASE_URL='https://wisata-demo.example';
 let sentUrl;
 globalThis.fetch=async(url)=>{
  sentUrl=new URL(url);
  return new Response(JSON.stringify([
   {id:1,region:'kota-yogyakarta',name:'Keraton Yogyakarta',description:'Wisata budaya',price:15000,photos:['/static/img/1-1.jpg']},
   {id:2,region:'kabupaten-sleman',name:'Museum Sleman',description:'Lain wilayah',price:10000,photos:['/static/img/2-1.jpg']}
  ]),{headers:{'Content-Type':'application/json'}});
 };
 try{
  const hotel=(await call('/api/v1/hotels?city=Kota%20Yogyakarta')).data[0];
  const result=await call(`/api/v1/hotels/${hotel.hotelId}/recommendations`);
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(sentUrl.pathname,'/api/v1/destinations');
  assert.equal(sentUrl.searchParams.get('region'),'kota-yogyakarta');
  assert.equal(result.data.destinations.length,1);
  assert.equal(result.data.destinations[0].name,'Keraton Yogyakarta');
  assert.equal(result.data.destinations[0].imageUrl,'https://wisata-demo.example/static/img/1-1.jpg');
  assert.equal(result.data.destinations[0].url,'https://wisata-demo.example/#/wisata/1');
 }finally{globalThis.fetch=oldFetch;delete env.WISATA_API_BASE_URL;}
});

test('pemetaan seluruh 5 wilayah Hotel ke kode region API Wisata',()=>{
 const cities={
  'Kota Yogyakarta':'kota-yogyakarta',
  Sleman:'kabupaten-sleman',
  Bantul:'kabupaten-bantul',
  Gunungkidul:'kabupaten-gunungkidul',
  'Kulon Progo':'kabupaten-kulon-progo'
 };
 for(const [city,slug] of Object.entries(cities)){
  assert.equal(normRegion(slug),city);
  assert.equal(destination({id:8,name:'Wisata Uji',region:slug,price:20000},city).city,city);
 }
});

test('API Wisata gagal: Hotel tidak membuat destinasi palsu',async()=>{
 const oldFetch=globalThis.fetch;env.WISATA_API_BASE_URL='https://wisata-demo.example';
 globalThis.fetch=async()=>new Response('Service unavailable',{status:503});
 try{const r=await call('/api/v1/hotels/H01/recommendations');assert.equal(r.status,502);assert.equal(r.data.code,'WISATA_UPSTREAM_ERROR');}
 finally{globalThis.fetch=oldFetch;delete env.WISATA_API_BASE_URL;}
});

test('endpoint semantik memaparkan 5 konsep wilayah dan 17 atribut',async()=>{
 const r=await call('/api/v1/semantic/regions');
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.regions.length,5);
 assert.equal(r.data.fieldConcepts.length,21);
 assert.ok(r.data.statusMappings.wisataBooking.PAID==='reserved');
});
test('endpoint katalog Hotel juga memahami slug Wisata tanpa mengubah database Hotel',async()=>{
 const a=await call('/api/v1/hotels?city=kabupaten-sleman');
 const b=await call('/api/v1/hotels?city=Sleman');
 assert.equal(a.status,200);assert.equal(a.data.length,b.data.length);
});


test('wisata tiket nonaktif sampai partner menjamin PENDING dan penyimpanan permanen',async()=>{
  const cap=await call('/api/v1/wisata/tickets/capability');
  assert.equal(cap.status,200);assert.equal(cap.data.bookingAvailable,false);
  const r=await call('/api/v1/wisata/tickets/book','POST',{destinationId:'1',visitDate:addDays(5),qty:2,name:'Tamu',email:'tamu@example.com'},{'Idempotency-Key':'1234567890123456'});
  assert.equal(r.status,503);assert.equal(r.data.code,'WISATA_BOOKING_NOT_READY');
});

test('cek kuota wisata asli diproksi aman via JogjaStay',async()=>{
  const savedFetch=globalThis.fetch;env.WISATA_API_BASE_URL='https://wisata.example';
  let visited;
  globalThis.fetch=async(url)=>{visited=new URL(url);return new Response(JSON.stringify({destination_id:12,date:addDays(7),qty:2,available:true,remaining:11,unit_price:15000,total:30000}),{headers:{'Content-Type':'application/json'}});};
  try{
    let r=await call('/api/v1/wisata/destinations/12/availability?date='+addDays(7)+'&qty=2');
    assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.total,30000);
    assert.equal(visited.pathname,'/api/v1/destinations/12/availability');
    assert.equal(visited.searchParams.get('tier'),'base');
    r=await call('/api/v1/wisata/destinations/../../availability?date='+addDays(7)+'&qty=2');assert.equal(r.status,404);
    r=await call('/api/v1/wisata/destinations/12/availability?date=2020-01-01&qty=2');assert.equal(r.status,400);
    r=await call('/api/v1/wisata/destinations/12/availability?date=2026-99-99&qty=2');assert.equal(r.status,400);
    r=await call('/api/v1/wisata/destinations/12/availability?date='+addDays(7)+'&qty=21');assert.equal(r.status,400);
  }finally{globalThis.fetch=savedFetch;delete env.WISATA_API_BASE_URL;}
});

test('partner wisata butuh kontrak aman sebelum mengirim pesanan',async()=>{
  const savedFetch=globalThis.fetch;env.WISATA_API_BASE_URL='https://wisata.example';
  env.WISATA_TICKET_BOOKING_READY='true';env.WISATA_PARTNER_TOKEN='tok_example_super_long_12345678';
  let nPost=0;
  globalThis.fetch=async(url,opts)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/capabilities'))return new Response(JSON.stringify({bookingStatus:'PAID',durableStorage:false,idempotentBooking:true}),{headers:{'Content-Type':'application/json'}});
    if(opts?.method==='POST')nPost++;
    return new Response('Not ready',{status:503});
  };
  try{
    const r=await call('/api/v1/wisata/tickets/book','POST',{destinationId:'1',visitDate:addDays(5),qty:1,name:'Tamu',email:'tamu@example.com'},{'Idempotency-Key':'idempotencykey123456789'});
    assert.equal(r.status,503);assert.equal(nPost,0);
  }finally{globalThis.fetch=savedFetch;delete env.WISATA_API_BASE_URL;delete env.WISATA_TICKET_BOOKING_READY;delete env.WISATA_PARTNER_TOKEN;}
});


test('partner wisata dengan kontrak PENDING dapat menerima pesanan melalui backend',async()=>{
  const savedFetch=globalThis.fetch;env.WISATA_API_BASE_URL='https://wisata.example';
  env.WISATA_TICKET_BOOKING_READY='true';env.WISATA_PARTNER_TOKEN='tok_example_super_long_12345678';
  let posted;
  globalThis.fetch=async(url,opts)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/capabilities'))return new Response(JSON.stringify({bookingStatus:'PENDING',durableStorage:true,idempotentBooking:true}),{headers:{'Content-Type':'application/json'}});
    if(path.endsWith('/partner/bookings')){
      assert.equal(opts.headers.Authorization,'Bearer tok_example_super_long_12345678');
      posted=JSON.parse(opts.body);
      return new Response(JSON.stringify({code:'WJ-TEST123',status:'PENDING'}),{status:201,headers:{'Content-Type':'application/json'}});
    }
    throw Error('Unexpected endpoint');
  };
  try{
    const cap=await call('/api/v1/wisata/tickets/capability');assert.equal(cap.data.bookingAvailable,true);
    const r=await call('/api/v1/wisata/tickets/book','POST',{destinationId:'12',visitDate:addDays(9),qty:2,name:'Nama Pemesan',email:'customer@example.org',phone:''},{'Idempotency-Key':'idempotencykey123456789'});
    assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.status,'PENDING');
    assert.equal(posted.destination_id,12);assert.equal(posted.customer.email,'customer@example.org');
    assert.equal(posted.external_ref,'JS-idempotencykey123456789');
  }finally{globalThis.fetch=savedFetch;delete env.WISATA_API_BASE_URL;delete env.WISATA_TICKET_BOOKING_READY;delete env.WISATA_PARTNER_TOKEN;}
});
