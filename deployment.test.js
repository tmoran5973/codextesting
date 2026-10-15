import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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
  assert.equal(missingKey.status,400);assert.match((await missingKey.json()).error,/COLORING_API_KEY/);
  assert.equal((await fetch(app.base+'/api/projects',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
  await app.stop();app=await start(dir);
  const restored=await (await fetch(app.base+'/api/projects',{headers})).json();
  assert.equal(restored.projects[0].title,'Persistent pilot');assert.equal(restored.projects[0].reserved,0);
 } finally {if(app)await app.stop();await rm(dir,{recursive:true,force:true});}
});
