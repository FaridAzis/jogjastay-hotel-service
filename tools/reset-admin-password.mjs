/**
 * One-time recovery of the existing admin account on REMOTE Cloudflare D1.
 * Run on your own Mac in the JogjaStay project directory:
 *   node tools/reset-admin-password.mjs
 * Never paste or transmit your new password into a chat or command line.
 */
import {pbkdf2 as pbkdf2Callback,randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

const pbkdf2=promisify(pbkdf2Callback);

async function readHidden(prompt){
  if(!process.stdin.isTTY||!process.stdin.setRawMode)throw Error('Jalankan melalui terminal VS Code yang interaktif.');
  return new Promise((resolve,reject)=>{
    let value='';const stdin=process.stdin;const prior=stdin.isRaw;
    const cleanup=()=>{stdin.off('data',onData);stdin.setRawMode(prior);stdin.pause();};
    const onData=(chunk)=>{
      for(const char of String(chunk)){
        if(char==='\r'||char==='\n'){cleanup();process.stdout.write('\n');resolve(value);return;}
        if(char==='\u0003'){cleanup();process.stdout.write('\n');reject(Error('Dibatalkan oleh pengguna.'));return;}
        if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue;}
        if(char>=' '&&char!=='\u007f')value+=char;
      }
    };
    process.stdout.write(prompt);
    stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');stdin.on('data',onData);
  });
}
function runWrangler(file){
  return new Promise((resolve,reject)=>{
    const child=spawn('npx',['--no-install','wrangler','d1','execute','jogjastay-db','--remote','--file',file,'--yes'],{cwd:process.cwd(),stdio:'inherit',shell:false});
    child.on('error',reject);
    child.on('exit',(code)=>code===0?resolve():reject(Error(`Wrangler gagal dengan kode ${code}`)));
  });
}
async function main(){
  const config=JSON.parse(await readFile('./wrangler.jsonc','utf8'));
  if(config.name!=='jogjastay-hotel-service'||!config.d1_databases?.some(d=>d.binding==='DB'&&d.database_name==='jogjastay-db'&&d.database_id==='f125d151-21c3-4867-a0b8-bb3b01f90095')){
    throw Error('Konfigurasi proyek bukan Worker/D1 JogjaStay yang kita periksa. Operasi dibatalkan.');
  }
  console.log('Target: akun admin pada jogjastay-db (REMOTE). Hotel, kamar, reservasi, dan token partner tidak disentuh.');
  console.log('Password baru minimal 12 karakter dan sebaiknya berbeda dari password yang sempat terlihat di screenshot.');
  const password=await readHidden('Password admin BARU (input tersembunyi): ');
  if(password.length<12)throw Error('Password minimal 12 karakter. Tidak ada data yang diubah.');
  const confirmation=await readHidden('Ulangi password admin BARU: ');
  if(password!==confirmation)throw Error('Konfirmasi tidak cocok. Tidak ada data yang diubah.');
  const yes=await readHidden('Ketik RESET untuk memperbarui akun admin pada database online: ');
  if(yes!=='RESET')throw Error('Dibatalkan. Tidak ada data yang diubah.');
  const salt=randomBytes(16).toString('hex');
  // Salt adalah STRING heksadesimal (UTF-8), mengikuti implementasi Worker.
  const digest=(await pbkdf2(password,Buffer.from(salt,'utf8'),100000,32,'sha256')).toString('hex');
  const encoded=`pbkdf2$100000$${salt}$${digest}`;
  const tmp=await mkdtemp(join(tmpdir(),'jogjastay-admin-'));
  try{
    const file=join(tmp,'reset-admin.sql');
    await writeFile(file,`UPDATE users SET password_hash='${encoded}' WHERE username='admin' AND role='admin';\nDELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username='admin' AND role='admin');\nSELECT username,role,active,substr(password_hash,1,13) AS hash_format FROM users WHERE username='admin';\n`,{mode:0o600});
    await runWrangler(file);
    console.log('Perintah selesai. Periksa hasil SELECT: hash_format harus pbkdf2$100000 dan active=1.');
    console.log('Sekarang login menggunakan password BARU. Jangan bagikan password.');
  }finally{await rm(tmp,{recursive:true,force:true});}
}
main().catch(err=>{console.error('Tidak berhasil:',err.message);process.exitCode=1;});
