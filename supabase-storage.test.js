import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStorage } from './supabase-storage.js';
import { spawnSync } from 'node:child_process';

function fixture() {
 const data={projects:[],lease:null,encrypted:null,images:new Map(),private:true};
 const calls=[];
 const fetcher=async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,options});
  const body=options.body&&typeof options.body==='string'?JSON.parse(options.body):options.body;
  const json=value=>new Response(JSON.stringify(value),{status:200});
  if(path.endsWith('/coloring_load'))return json({projects:data.projects,busy:!!data.lease});
  if(path.endsWith('/coloring_acquire')){if(data.lease)return json(false);data.lease=body.requested_lease;return json(true);}
  if(path.endsWith('/coloring_save')){if(data.lease!==body.requested_lease)return json(false);data.projects=body.new_projects;return json(true);}
  if(path.endsWith('/coloring_release')){if(data.lease===body.requested_lease)data.lease=null;return json(null);}
  if(path.startsWith('/storage/v1/bucket/'))return json({public:!data.private});
  if(path.startsWith('/storage/v1/object/')){
   if(options.method==='POST'){data.images.set(path,Buffer.from(options.body));return json({Key:path});}
   return new Response(data.images.get(path));
  }
  if(path==='/rest/v1/coloring_credentials'){
   if(options.method==='POST'){data.encrypted=body.encrypted;return new Response(null,{status:204});}
   if(options.method==='DELETE'){data.encrypted=null;return new Response(null,{status:204});}
   return json(data.encrypted?[{encrypted:data.encrypted}]:[]);
  }
  throw new Error('Unexpected request');
 };
 return {data,calls,store:()=>new SupabaseStorage('https://project.supabase.co','server-test-secret',fetcher)};
}
test('Supabase adapter uses server-authenticated private storage and retains records across adapter instances',async()=>{
 const f=fixture();const a=f.store();await a.init();
 const lease=await a.acquire();assert(lease);assert.equal(await a.acquire(),null);
 await a.save([{id:'pilot'}],lease);await a.writeCredential({v:1,ciphertext:'encrypted'});
 await a.putImage('a1-b2.png',Buffer.from('png-binary'));
 await assert.rejects(a.save([], 'wrong-lease'),/lease expired/);
 await a.release('wrong-lease');assert.equal((await a.load()).busy,true);
 await a.release(lease);
 const b=f.store();await b.init();assert.deepEqual((await b.load()).projects,[{id:'pilot'}]);
 assert.equal((await b.getImage('a1-b2.png')).toString(),'png-binary');
 assert.deepEqual(await b.readCredential(),{v:1,ciphertext:'encrypted'});
 await b.writeCredential(null);assert.equal(await b.readCredential(),null);
 for(const c of f.calls){assert.equal(c.options.headers.apikey,'server-test-secret');assert(!c.path.includes('/public/'));}
});
test('Supabase rejects public buckets, unsafe filenames and storage errors without local fallback',async()=>{
 const f=fixture();f.data.private=false;await assert.rejects(f.store().init(),/must be private/);
 assert.throws(()=>f.store().imagePath('../private'),/filename/);
 assert.throws(()=>new SupabaseStorage('http://project.supabase.co','key'),/HTTPS/);
 const unavailable=new SupabaseStorage('https://project.supabase.co','key',async()=>new Response('sensitive server detail',{status:500}));
 await assert.rejects(unavailable.load(),e=>e.message.includes('No local fallback')&&!e.message.includes('sensitive'));
});
test('hosted app refuses temporary storage when Supabase is unconfigured',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./storage.js')"],{cwd:import.meta.dirname,env:{...process.env,RENDER:'true',VERCEL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',DATABASE_URL:''},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Temporary storage is disabled/);
});
