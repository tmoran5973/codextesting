import { randomUUID } from 'node:crypto';

export class SupabaseStorage {
 constructor(url, key, fetcher=fetch) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('SUPABASE_URL must be your HTTPS project URL, without a path.');
  if(!key)throw new Error('Set SUPABASE_SERVICE_ROLE_KEY in hosting environment settings.');
  this.url=parsed.origin;this.key=key;this.fetcher=fetcher;this.bucket='coloring-studio-artwork';
 }
 async request(path,{method='GET',body,binary=false,headers={}}={}) {
  let response;
  try {response=await this.fetcher(this.url+path,{method,headers:{apikey:this.key,...(!this.key.startsWith('sb_secret_')?{Authorization:`Bearer ${this.key}`}:{ }),...(body!==undefined&&!binary?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:binary?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(binary?120000:15000)});}
  catch {throw new Error('Supabase is unreachable. Check the project is active and its connection settings.');}
  if(!response.ok) {
   if(response.status===401||response.status===403)throw new Error('Supabase denied access. Check the server-side secret key and SQL setup.');
   if(response.status===404)throw new Error('Supabase setup is missing. Run supabase/setup.sql in the SQL Editor.');
   throw new Error(`Supabase storage request failed (${response.status}). No local fallback was used.`);
  }
  if(binary&&method==='GET')return Buffer.from(await response.arrayBuffer());
  if(response.status===204)return null;
  const text=await response.text();return text?JSON.parse(text):null;
 }
 async rpc(name,body={}) {return this.request('/rest/v1/rpc/'+name,{method:'POST',body});}
 async init() {
  const state=await this.load();if(!state||!Array.isArray(state.projects))throw new Error('Supabase workspace is missing. Run supabase/setup.sql.');
  const bucket=await this.request('/storage/v1/bucket/'+this.bucket);
  if(bucket.public!==false)throw new Error('Artwork bucket must be private. Change its visibility in Supabase Storage.');
 }
 async load() {return this.rpc('coloring_load');}
 async acquire() {const id=randomUUID();return await this.rpc('coloring_acquire',{requested_lease:id})?id:null;}
 async release(id) {await this.rpc('coloring_release',{requested_lease:id});}
 async save(projects,id) {if(!await this.rpc('coloring_save',{new_projects:projects,requested_lease:id}))throw new Error('Job lease expired. Refresh the project before continuing.');}
 imagePath(name) {if(!/^[a-f0-9-]+\.png$/.test(name))throw new Error('Invalid artwork filename.');return '/storage/v1/object/'+this.bucket+'/'+name;}
 async putImage(name,buffer) {await this.request(this.imagePath(name),{method:'POST',body:buffer,binary:true,headers:{'Content-Type':'image/png','x-upsert':'false'}});}
 async getImage(name) {return this.request(this.imagePath(name),{binary:true});}
 async readCredential() {const rows=await this.request('/rest/v1/coloring_credentials?id=eq.1&select=encrypted');return rows[0]?.encrypted||null;}
 async writeCredential(record) {
  if(record)await this.request('/rest/v1/coloring_credentials?on_conflict=id',{method:'POST',body:{id:1,encrypted:record},headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
  else await this.request('/rest/v1/coloring_credentials?id=eq.1',{method:'DELETE'});
 }
}
