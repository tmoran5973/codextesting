const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = n => `$${Number(n).toFixed(2)}`;
let selected = null, data = { projects: [] }, showingForm = true, producing = false;
async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function error(e) { $('#message').className='error'; $('#message').textContent=e.message; }
function clear() { $('#message').className=''; $('#message').textContent=''; }
function form() {
 showingForm=true;
 $('#content').innerHTML=`<span class="badge">A new creative project</span><h1>Let’s make your next book.</h1><p class="muted">Set the direction. Approve a sample. Then let the production agents get to work.</p><form id="create"><label for="title">Book title</label><input id="title" name="title" placeholder="Woodland moments" required maxlength="120"><label for="brief">Creative direction</label><textarea id="brief" name="brief" placeholder="Cozy woodland animals for adult beginners. Bold clean outlines, simple backgrounds, consistent friendly style…" required maxlength="8000"></textarea><div class="row"><div><label for="count">Pages</label><input id="count" name="count" type="number" min="1" max="40" value="5" required></div><div><label for="budget">Spending reservation limit (USD)</label><input id="budget" name="budget" type="number" min="0.1" max="1000" step="0.01" value="5" required></div></div><label for="ideas">Page ideas · one per line</label><textarea id="ideas" name="ideas" rows="7" required placeholder="A fox reading beside a mushroom cottage&#10;A rabbit tending a vegetable garden&#10;A hedgehog having a picnic&#10;An owl in a cozy treehouse&#10;A squirrel baking acorn cookies"></textarea><div class="notice">Start with five pages to test quality and cost. Creating a project is free. Running generation and review uses a separately billed OpenAI API key. Reservations are configurable estimates, not a guaranteed billing cap.</div><button>Create book project →</button></form>`;
 $('#create').onsubmit=async event=>{event.preventDefault(); clear();try{const values=Object.fromEntries(new FormData(event.target));const p=await request('/api/projects',values);selected=p.id;showingForm=false;await refresh();}catch(e){error(e);}};
}
function render() {
 const p=data.projects.find(p=>p.id===selected); if(!p) return form();
 const approved=p.pages.filter(x=>x.status==='approved').length;
 const hasSample=p.pages[0].versions.length>0;
 const pending=p.pages.some(x=>!x.versions.length || (x.status!=='approved'&&!x.versions.at(-1).review));
 $('#content').innerHTML=`<span class="badge">${escape(p.status)}${data.busy?' · Agent working':''}</span><h1>${escape(p.title)}</h1><p class="brief">${escape(p.brief)}</p><div class="stats"><div class="stat"><strong>${approved} / ${p.count}</strong>pages approved</div><div class="stat"><strong>${money(p.reserved)}</strong>reserved · ${money(p.budget)} limit</div><div class="stat"><strong>${p.events.filter(e=>e.kind==='image').length}</strong>image requests attempted</div></div><div class="notice">Each image request reserves ${money(data.imageReservation)}; each quality review reserves ${money(data.reviewReservation)}. These are planning allowances, not actual charges. Failed requests keep their reservation. Check your provider billing and configure provider-side limits.</div>${p.error?`<div class="error">${escape(p.error)}</div>`:''}<div class="row"><button id="batch" ${data.busy||!pending?'disabled':''}>${!hasSample?'Generate sample + quality check':p.pages[0].status==='approved'?'Produce remaining pages':'Resume sample check'}</button><button id="budgetButton" class="secondary" ${data.busy?'disabled':''}>Change spending limit</button></div><p class="muted">The first sample needs your approval before the rest of the book runs. Every page still needs your final approval. Keep this tab open during batch production; closing it pauses scheduling after the current page.</p><div class="grid">${p.pages.map(page=>{
 const v=page.versions.at(-1); const review=v?.review;
 return `<article class="card" data-page="${page.id}"><div class="row"><span class="badge">Page ${page.number} · ${escape(page.status)}</span>${v?`<small>Version ${page.versions.length} / 4</small>`:''}</div><h2>${escape(page.idea)}</h2>${v?`<img src="/images/${v.file}" alt="Page ${page.number}, current version"><p><strong>Quality agent</strong></p>${review?review.issues.length?`<ul class="issues">${review.issues.map(i=>`<li>${escape(i)}</li>`).join('')}</ul>`:'<p class="muted">No issues flagged. Please inspect the artwork yourself.</p>':'<p class="muted">Quality check pending.</p>'}<textarea aria-label="Corrections for page ${page.number}" placeholder="Describe a correction…">${escape(review?.repair||'')}</textarea><button data-action="approve" ${data.busy||!review||page.status==='approved'?'disabled':''}>${page.status==='approved'?'✓ Approved':'Approve page'}</button><button data-action="revise" class="secondary" ${data.busy||page.versions.length>=4?'disabled':''}>Revise + check</button>${!review?`<button data-action="review" class="secondary" ${data.busy?'disabled':''}>Run quality check</button>`:''}<a class="download secondary" href="/images/${v.file}" download="page-${page.number}.png">Download PNG</a>${page.versions.length>1?`<details><summary>Previous versions</summary><div class="history">${page.versions.slice(0,-1).map((old,i)=>`<a href="/images/${old.file}" target="_blank" rel="noopener"><img src="/images/${old.file}" alt="Version ${i+1}"></a>`).join('')}</div></details>`:''}`:'<div class="placeholder">Waiting for production</div>'}</article>`;
 }).join('')}</div><details><summary>Spending activity · ${p.events.length} requests</summary>${p.events.map(e=>`<p>${escape(e.kind)} · ${escape(e.status)} · ${money(e.reservation)} reserved · ${escape(new Date(e.at).toLocaleString())}</p>`).join('')}</details><p class="muted">This first version covers artwork production and review. PDF assembly, market research, promotional video, and Etsy publishing are upcoming stages.</p>`;
 $('#batch').onclick=()=>action('batch',{});
 $('#budgetButton').onclick=()=>{const value=prompt('New reservation limit in USD',p.budget);if(value!==null)action('budget',{budget:Number(value)});};
 document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const card=button.closest('[data-page]');action(button.dataset.action,{pageId:card.dataset.page,feedback:card.querySelector('textarea').value});});
}
async function action(type, body) {
 clear();
 try {
  producing = type === 'batch';
  do {
   await request(`/api/projects/${selected}/${type}`,body);
   await refresh();
   const p=data.projects.find(p=>p.id===selected);
   if(type!=='batch'||!p||p.status==='paused'||p.pages[0].status!=='approved'||!p.pages.some(x=>!x.versions.length||(x.status!=='approved'&&!x.versions.at(-1).review)))break;
  } while(producing);
 } catch(e){error(e);} finally{producing=false;await refresh().catch(error);render();}
}
async function refresh() {
 const next=await request('/api/projects');next.busy ||= producing;const changed=JSON.stringify(next)!==JSON.stringify(data);data=next;
 $('#connection').textContent=data.configured?'API KEY CONNECTED':'API KEY NEEDED FOR GENERATION';
 $('#projects').innerHTML=data.projects.map(p=>`<button data-id="${p.id}">${escape(p.title)}</button>`).join('');
 document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{clear();selected=b.dataset.id;showingForm=false;render();});
 if(!showingForm&&changed)render();
}
$('#new').onclick=()=>{clear();form();};
await refresh().catch(error);form();
setInterval(()=>refresh().catch(error),3000);

function showKeyStatus(status) {
 $('#keyStatus').textContent=status.unreadable
  ? 'The saved key cannot be unlocked. Enter it again or remove it.'
  :status.source==='app'?'An API key saved in this app is active.'
  :status.source==='environment'?'A key from hosting environment settings is active. Saving here will override it.'
  :'No API key connected. Add one to enable generation and quality checks.';
 $('#removeKey').disabled=!status.hasSaved;
}
$('#settingsButton').onclick=async()=>{
 $('#settingsError').textContent='';$('#apiKey').value='';$('#settingsDialog').showModal();
 try{showKeyStatus(await request('/api/settings'));}catch(e){$('#settingsError').textContent=e.message;}
};
function closeSettings(){$('#apiKey').value='';$('#settingsDialog').close();}
$('#closeSettings').onclick=closeSettings;
$('#settingsDialog').addEventListener('close',()=>{$('#apiKey').value='';});
async function updateKey(action){
 const key=$('#apiKey').value;
 if(action==='save'&&!key.trim()){$('#settingsError').textContent='Enter a new key, or close this panel to keep the current one.';return;}
 $('#settingsError').textContent='';$('#saveKey').disabled=true;$('#removeKey').disabled=true;
 try{
  const status=await request('/api/settings',{action,...(action==='save'?{key}:{})});
  $('#apiKey').value='';showKeyStatus(status);await refresh();
  $('#settingsError').textContent=action==='save'?'Key saved. You can generate a sample now.':status.hasEnvironment?'App-saved key removed. The hosting environment key is now active.':'Saved key removed.';
 }catch(e){$('#apiKey').value='';$('#settingsError').textContent=e.message;}
 finally{$('#saveKey').disabled=false;try{showKeyStatus(await request('/api/settings'));}catch{}}
}
$('#settingsForm').onsubmit=event=>{event.preventDefault();updateKey('save');};
$('#removeKey').onclick=()=>{if(confirm('Remove the key saved in this app? A hosting environment key, if set, will remain active.'))updateKey('remove');};
