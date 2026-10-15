import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dir) {
 const child=spawn(process.execPath,['server.js'],{cwd:import.meta.dirname,env:{...process.env,NODE_ENV:'production',DEMO_PASSWORD:'integration-only-password',DATABASE_URL:'',VERCEL:'',COLORING_API_KEY:'',PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 let text='';
 const port=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill();reject(new Error('Server startup timed out'));},10000);
  child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/running on port (\d+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
  child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Server exited before startup'));});
 });
 return {base:`http://127.0.0.1:${port}`,stop:async()=>{child.kill();await once(child,'exit');}};
}
test('deployed handler protects UI and data, accepts HTTPS origins, and preserves projects across restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'coloring-test-'));let app;
 const headers={Authorization:`Basic ${Buffer.from('studio:integration-only-password').toString('base64')}`,'Content-Type':'application/json'};
 try {
  app=await start(dir);
  assert.equal((await fetch(app.base+'/healthz')).status,200);
  assert.equal((await fetch(app.base+'/')).status,401);
  assert.equal((await fetch(app.base+'/api/projects')).status,401);
  assert.equal((await fetch(app.base+'/images/000.png')).status,401);
  assert.equal((await fetch(app.base+'/',{headers})).status,200);
  const create=await fetch(app.base+'/api/projects',{method:'POST',headers:{...headers,Origin:app.base.replace('http:','https:')},body:JSON.stringify({title:'Persistent pilot',brief:'Clean animal outlines',count:1,budget:1,ideas:'A fox'})});
  assert.equal(create.status,201);const project=await create.json();
  const missingKey=await fetch(app.base+`/api/projects/${project.id}/batch`,{method:'POST',headers,body:'{}'});
  assert.equal(missingKey.status,400);assert.match((await missingKey.json()).error,/API settings/);
  assert.equal((await fetch(app.base+'/api/projects',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
  // Settings require login and same-origin access; responses must never contain keys.
  assert.equal((await fetch(app.base+'/api/settings')).status,401);
  const firstKey='sk-integration-test-first-not-real';
  const nextKey='sk-integration-test-replacement-not-real';
  const change=async body=>fetch(app.base+'/api/settings',{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await change({action:'save',key:'bad'})).status,400);
  const blocked=await fetch(app.base+'/api/settings',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify({action:'save',key:firstKey})});
  assert.equal(blocked.status,403);
  const saved=await change({action:'save',key:firstKey});assert.equal(saved.status,200);
  const savedText=await saved.text();assert(!savedText.includes(firstKey));assert.equal(JSON.parse(savedText).source,'app');
  assert.equal((await change({action:'save',key:nextKey})).status,200);
  const onDisk=await readFile(join(dir,'credential.json'),'utf8');assert(!onDisk.includes(firstKey));assert(!onDisk.includes(nextKey));
  assert.equal((await stat(join(dir,'credential.json'))).mode&0o777,0o600);
  const publicState=await (await fetch(app.base+'/api/projects',{headers})).text();assert(!publicState.includes(nextKey));assert.equal(JSON.parse(publicState).configured,true);
  await app.stop();app=await start(dir);
  const restored=await (await fetch(app.base+'/api/projects',{headers})).json();
  assert.equal(restored.projects[0].title,'Persistent pilot');assert.equal(restored.projects[0].reserved,0);
  assert.equal(restored.configured,true);
  const removed=await fetch(app.base+'/api/settings',{method:'POST',headers,body:JSON.stringify({action:'remove'})});
  assert.equal(removed.status,200);assert.equal((await removed.json()).configured,false);
  const finalState=await (await fetch(app.base+'/api/projects',{headers})).json();assert.equal(finalState.configured,false);
 } finally {if(app)await app.stop();await rm(dir,{recursive:true,force:true});}
});
