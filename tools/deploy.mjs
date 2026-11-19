/**
 * Interactive setup for Cloudflare Free deployment of JogjaStay.
 * Requires local npm install. Never prints/saves passwords.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline/promises';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const cmd=(bin,args)=>{console.log(`\n$ ${bin} ${args.join(' ')}`);const result=spawnSync(process.platform==='win32'?bin+'.cmd':bin,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`Perintah gagal (${result.status}). Periksa output terminal sebelum melanjutkan.`);};
const ask=async(prompt)=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout});try{return (await rl.question(prompt)).trim();}finally{rl.close();}};
console.log('\n=== JogjaStay: Cloudflare Workers + D1 (akun Free) ===');
console.log('Hanya untuk database D1 BARU/KOSONG dan data DEMO. Jangan gunakan pada database booking penting.');
if(Number(process.versions.node.split('.')[0])<22)throw Error('Butuh Node.js 22 atau lebih baru');
const confirm=await ask('Lanjut menginstal di database demo baru? ketik YA: ');
if(confirm!=='YA')throw Error('Dibatalkan tanpa mengubah cloud.');
cmd('npm',['test']);
cmd('npx',['wrangler','login']);
const configPath=resolve(root,'wrangler.jsonc');
let cfg=JSON.parse(readFileSync(configPath,'utf8'));
let id=cfg.d1_databases?.[0]?.database_id;
if(id==='REPLACE_WITH_D1_DATABASE_ID'||!/^[a-f0-9-]{36}$/i.test(id||'')){
 const already=await ask('Database jogjastay-db pernah dibuat sebelumnya? ketik SUDAH atau BARU: ');
 if(already==='BARU'){
   console.log('\nMembuat database D1 baru. Bila Wrangler menawarkan menambah binding, pilih No.');
   cmd('npx',['wrangler','d1','create','jogjastay-db']);
 }else if(already!=='SUDAH'){throw Error('Harus pilih SUDAH atau BARU.');}
 id=await ask('\nTempel database_id (UUID) dari output d1 create / dashboard Cloudflare: ');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('database_id bukan UUID yang valid. Lihat output d1 create.');
 cfg=JSON.parse(readFileSync(configPath,'utf8'));
 cfg.d1_databases=[{binding:'DB',database_name:'jogjastay-db',database_id:id}];
 writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
}else{
 const useExisting=await ask('Database sudah terkonfigurasi. Untuk keamanan, seed tidak dijalankan ulang. Ketik SKIP untuk langsung deploy atau BATAL: ');
 if(useExisting!=='SKIP')throw Error('Dibatalkan untuk melindungi data database.');
 cmd('npx',['wrangler','deploy']);
 cmd('npx',['wrangler','secret','put','ADMIN_PASSWORD']);
 cmd('npx',['wrangler','deploy']);
 console.log('\nDeploy dilakukan. Periksa URL aktual yang ditampilkan Wrangler.');
 process.exit(0);
}
cmd('npx',['wrangler','d1','execute','jogjastay-db','--remote','--file=./db/schema.sql']);
cmd('npx',['wrangler','d1','execute','jogjastay-db','--remote','--file=./db/seed.sql']);
cmd('npx',['wrangler','d1','execute','jogjastay-db','--remote','--command=SELECT city, COUNT(*) AS jumlah FROM hotels GROUP BY city;']);
console.log('\nSekarang masukkan password admin kuat minimal 12 karakter via prompt Wrangler. Tidak disimpan di source code.');
cmd('npx',['wrangler','deploy']);
cmd('npx',['wrangler','secret','put','ADMIN_PASSWORD']);
cmd('npx',['wrangler','deploy']);
console.log('\nSELESAI PERINTAH CLI. Uji URL /health, /api/v1/regions, /login, dan booking DEMO di browser.');
