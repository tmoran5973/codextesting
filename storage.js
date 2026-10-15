import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
const root = process.env.DATA_DIR ? pathToFileURL(resolve(process.env.DATA_DIR) + sep) : new URL('./.data/', import.meta.url);
let sql, initialized, localLease = null;
if (process.env.VERCEL && !process.env.DATABASE_URL) throw new Error('Connect a Neon database and set DATABASE_URL before deploying.');
if (process.env.DATABASE_URL) sql = neon(process.env.DATABASE_URL);
async function init() {
 if (!initialized) initialized = (async()=>{
  if(sql) {
   await sql`CREATE TABLE IF NOT EXISTS coloring_workspace (id integer PRIMARY KEY, projects jsonb NOT NULL DEFAULT '[]', lease text, lease_until timestamptz)`;
   await sql`INSERT INTO coloring_workspace (id) VALUES (1) ON CONFLICT DO NOTHING`;
   await sql`CREATE TABLE IF NOT EXISTS coloring_images (name text PRIMARY KEY, content text NOT NULL)`;
  } else await mkdir(root,{recursive:true});
 })();
 return initialized;
}
export async function load() {
 await init();
 if(sql) {const [row]=await sql`SELECT projects, (lease IS NOT NULL AND lease_until > now()) AS busy FROM coloring_workspace WHERE id=1`;return {projects:row.projects,busy:row.busy};}
 try{return {projects:JSON.parse(await readFile(new URL('projects.json',root),'utf8')),busy:!!localLease};}catch(e){if(e.code!=='ENOENT')throw e;return {projects:[],busy:!!localLease};}
}
export async function acquire() {
 await init();const id=randomUUID();
 if(sql){const rows=await sql`UPDATE coloring_workspace SET lease=${id}, lease_until=now()+interval '360 seconds' WHERE id=1 AND (lease IS NULL OR lease_until < now()) RETURNING id`;return rows.length?id:null;}
 if(localLease)return null;localLease=id;return id;
}
export async function release(id) {
 if(sql)await sql`UPDATE coloring_workspace SET lease=NULL, lease_until=NULL WHERE id=1 AND lease=${id}`;
 else if(localLease===id)localLease=null;
}
export async function save(projects,lease) {
 await init();
 if(sql){const rows=await sql`UPDATE coloring_workspace SET projects=${JSON.stringify(projects)}::jsonb WHERE id=1 AND lease=${lease} AND lease_until > now() RETURNING id`;if(!rows.length)throw new Error('Job lease expired. Refresh the project before continuing.');}
 else {await writeFile(new URL('projects.tmp',root),JSON.stringify(projects,null,2));await rename(new URL('projects.tmp',root),new URL('projects.json',root));}
}
export async function putImage(name,buffer) {if(sql)await sql`INSERT INTO coloring_images (name,content) VALUES (${name},${buffer.toString('base64')})`;else await writeFile(new URL(name,root),buffer);}
export async function getImage(name) {
 await init();
 if(sql){const [row]=await sql`SELECT content FROM coloring_images WHERE name=${name}`;if(!row)throw new Error('Image not found.');return Buffer.from(row.content,'base64');}
 return readFile(new URL(name,root));
}
