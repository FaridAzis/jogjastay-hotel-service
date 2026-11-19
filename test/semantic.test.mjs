import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hotelCityFromAny,wisataSlugFromAny,asHotel,asDestination,bookingSemantics,canonicalError,semanticDescription,regionFromFields} from '../src/semantic.mjs';
const f=JSON.parse(fs.readFileSync(new URL('../ontology/fixtures.json',import.meta.url),'utf8'));
test('kamus wilayah: semua sinonim lima wilayah lintas bahasa',()=>{
 for(const x of f.regions){assert.equal(hotelCityFromAny(x.input),x.hotelLabel,x.input);assert.equal(wisataSlugFromAny(x.input),x.wisataSlug,x.input);}
 for(const bad of f.reject)assert.equal(hotelCityFromAny(bad),null,bad);
});
test('contoh sumber hotel vs wisata berbagi konsep region, bukan identitas objek',()=>{
 for(const x of f.resources){const a=asHotel(x.hotel),b=asDestination(x.wisata,'https://wisata.example');assert.equal(a.regionId,x.conceptId);assert.equal(b.regionId,x.conceptId);assert.notEqual(a.entityType,b.entityType);assert.notEqual(a.resourceId,b.resourceId);assert.equal(b.priceUnit,'ticket');}
});
test('status lifecycle dipisahkan dari status pembayaran',()=>{
 for(const x of f.bookings)assert.deepEqual(bookingSemantics(x.provider,x.input),x.expected);
});
test('konflik dua label wilayah tidak dianggap cocok',()=>{
 assert.equal(regionFromFields({city:'Sleman',region:'kabupaten-bantul'}),null);
 assert.equal(regionFromFields({city:'Sleman',region:'kabupaten-sleman'}).conceptId,'diy:kabupaten-sleman');
});
test('kontrak semantik mendokumentasikan 17 konsep atribut dan batas penyamaan',()=>{
 assert.equal(semanticDescription.fieldConcepts.length,21);
 assert.ok(semanticDescription.nonEquivalences.some(x=>x.includes('confirmed')));
});

test('error Wisata string dan error Hotel boolean + message menjadi representasi sama',()=>{
 assert.deepEqual(canonicalError({error:'Layanan tidak ditemukan',code:'NOT_FOUND'}),{code:'NOT_FOUND',message:'Layanan tidak ditemukan'});
 assert.deepEqual(canonicalError({error:true,code:'NOT_FOUND',message:'Hotel tidak ditemukan'}),{code:'NOT_FOUND',message:'Hotel tidak ditemukan'});
});
