import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as storage from './storage.js';
import { keyStatus, saveKey, removeKey, publicKeyStatus, safeProviderError } from './credentials.js';
import { authorized, sameOrigin } from './auth.js';
import { validateProject, reserve, pagePrompt } from './workflow.js';

const production = process.env.NODE_ENV === 'production';
const password = process.env.DEMO_PASSWORD || '';
if (production && password.length < 16) throw new Error('Set DEMO_PASSWORD to a strong password of at least 16 characters before deployment.');
const context = new AsyncLocalStorage();
const state = () => context.getStore();
async function save() { await storage.save(state().projects, state().lease); }
function reply(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
async function body(req) { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 20000) throw new Error('Request too large.'); } return JSON.parse(data || '{}'); }
function rate(name, fallback) { const value = Number(process.env[name] || fallback); if (!Number.isFinite(value) || value <= 0) throw new Error(`Set a positive ${name}.`); return value; }
async function api(path, payload) {
  const key = state().credentials.key;
  if (!key) throw new Error('Open API settings and add your OpenAI API key.');
  const multipart = payload instanceof FormData;
  const response = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) }, body: multipart ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`AI service: ${safeProviderError(result.error?.message || response.status, key)}`);
  return result;
}
async function paid(project, kind, action) {
  if (!state().credentials.key) throw new Error('Open API settings and add your OpenAI API key before running agents.');
  const amount = kind === 'image' ? rate('IMAGE_RESERVATION_USD', .5) : rate('REVIEW_RESERVATION_USD', .05);
  reserve(project, amount);
  const event = { id: randomUUID(), kind, reservation: amount, at: new Date().toISOString(), status: 'started' };
  project.events.push(event); await save();
  try { const result = await action(); event.status = 'completed'; if (result.usage) event.usage = result.usage; await save(); return result; }
  catch (e) { event.status = 'failed'; await save(); throw e; }
}
async function generate(project, page) {
  const previous = page.versions.at(-1);
  const result = await paid(project, 'image', async () => {
    if (previous) {
      const form = new FormData();
      form.set('model', 'gpt-image-1'); form.set('prompt', pagePrompt(project, page)); form.set('size', '1024x1536'); form.set('quality', 'medium');
      form.set('image', new Blob([await storage.getImage(previous.file)], { type: 'image/png' }), 'page.png');
      return api('images/edits', form);
    }
    return api('images/generations', { model: 'gpt-image-1', prompt: pagePrompt(project, page), n: 1, size: '1024x1536', quality: 'medium' });
  });
  if (!result.data?.[0]?.b64_json) throw new Error('Image service returned no image.');
  const file = `${randomUUID()}.png`;
  await storage.putImage(file, Buffer.from(result.data[0].b64_json, 'base64'));
  page.versions.push({ file, at: new Date().toISOString(), feedback: page.feedback || '', review: null });
  page.status = 'needs-review'; await save();
}
async function review(project, page) {
  const version = page.versions.at(-1);
  const data = (await storage.getImage(version.file)).toString('base64');
  const result = await paid(project, 'review', () => api('responses', {
    model: 'gpt-4.1-mini', max_output_tokens: 700,
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Inspect this coloring-book page for broken or messy lines, random floating objects, anatomy mistakes, confusing overlaps, shading and print margins. Direction: ${project.brief}. Page brief: ${page.idea}. Return JSON with issues (array of concise strings) and repair (specific correction instructions, empty if none). Be conservative. This is an advisory check; a human must approve.` }, { type: 'input_image', image_url: `data:image/png;base64,${data}` }] }],
    text: { format: { type: 'json_schema', name: 'quality_review', strict: true, schema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'string' } }, repair: { type: 'string' } }, required: ['issues', 'repair'], additionalProperties: false } } }
  }));
  const output = result.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text');
  if (!output) throw new Error('Quality agent returned no review.');
  version.review = JSON.parse(output.text); await save();
}
async function run(project, action) {
  state().busy = true; project.status = 'running'; project.error = null; await save();
  try { await action(); project.status = 'review'; }
  catch (e) { project.status = 'paused'; project.error = e.message; }
  finally { state().busy = false; await save(); }
}
async function handle(req, res) {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return reply(res, 200, { ok: true });
    if (!authorized(req.headers.authorization, password)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Coloring Studio", charset="UTF-8"');
      return reply(res, 401, { error: 'Sign in with username studio and your demo password.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/settings') return reply(res, 200, publicKeyStatus(state().credentials));
    if (req.method === 'GET' && url.pathname === '/api/projects') return reply(res, 200, { projects: state().projects, configured: !!state().credentials.key, busy: state().busy, imageReservation: rate('IMAGE_RESERVATION_USD', .5), reviewReservation: rate('REVIEW_RESERVATION_USD', .05) });
    if (url.pathname.startsWith('/api/') && req.method === 'POST') {
      // Bind to loopback by default; reject cross-origin browser mutations.
      if (!sameOrigin(req.headers.origin, req.headers.host)) return reply(res, 403, { error: 'Cross-origin request rejected.' });
      if (state().busy && !state().lease) return reply(res, 409, { error: 'An agent is working. Wait until it finishes.' });
      const input = await body(req);
      if (url.pathname === '/api/settings') {
        if (input.action === 'remove') await removeKey();
        else if (input.action === 'save') await saveKey(input.key, password);
        else throw new Error('Unknown settings action.');
        return reply(res, 200, publicKeyStatus(await keyStatus(password)));
      }
      if (url.pathname === '/api/projects') {
        const validated = validateProject(input);
        const ideas = String(input.ideas || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (ideas.length < validated.count) throw new Error('Provide one distinct page idea per line for every page.');
        const project = { id: randomUUID(), ...validated, status: 'draft', reserved: 0, events: [], pages: ideas.slice(0, validated.count).map((idea, i) => ({ id: randomUUID(), number: i + 1, idea, status: 'planned', versions: [] })) };
        state().projects.unshift(project); await save(); return reply(res, 201, project);
      }
      const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/(\w+)$/);
      const project = state().projects.find(p => p.id === match?.[1]);
      if (!project) return reply(res, 404, { error: 'Project not found.' });
      const action = match[2];
      if (action === 'budget') { const n = Number(input.budget); if (!Number.isFinite(n) || n < project.reserved || n > 1000) throw new Error('Budget must cover existing reservations and be at most $1,000.'); project.budget = n; await save(); return reply(res, 200, project); }
      if (action === 'batch') {
        if (!state().credentials.key) throw new Error('Open API settings and add your OpenAI API key.');
        const pages = project.pages.filter(p => !p.versions.length || (p.status !== 'approved' && !p.versions.at(-1).review));
        if (!pages.length) throw new Error('All generated pages have reviews. Approve them or request revisions.');
        // First batch is always one sample. Subsequent production requires explicit approval.
        const sampleApproved = project.pages[0].status === 'approved';
        const selection = sampleApproved ? pages.slice(0, 1) : pages.filter(p => p.number === 1);
        if (!selection.length) throw new Error('Approve the first sample before producing the rest.');
        await run(project, async () => { for (const page of selection) { if (!page.versions.length) await generate(project, page); await review(project, page); } });
        return reply(res, 202, { accepted: true });
      }
      const page = project.pages.find(p => p.id === input.pageId);
      if (!page || !page.versions.length) throw new Error('Generate the page first.');
      if (action === 'approve') { if (!page.versions.at(-1).review) throw new Error('Run the quality check before approval.'); page.status = 'approved'; await save(); return reply(res, 200, project); }
      if (action === 'review') { await run(project, () => review(project, page)); return reply(res, 202, { accepted: true }); }
      if (action === 'revise') {
        if (page.versions.length >= 4) throw new Error('Three-revision limit reached. Keep a version or revisit the page brief.');
        const feedback = String(input.feedback || '').trim(); if (!feedback || feedback.length > 4000) throw new Error('Enter correction instructions (up to 4,000 characters).');
        page.feedback = feedback; page.status = 'needs-review';
        await run(project, async () => { await generate(project, page); await review(project, page); }); return reply(res, 202, { accepted: true });
      }
      return reply(res, 404, { error: 'Unknown action.' });
    }
    if (req.method === 'GET' && /^\/images\/[a-f0-9-]+\.png$/.test(url.pathname)) {
      const image = await storage.getImage(url.pathname.slice(8)); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }); return res.end(image);
    }
    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && files[url.pathname]) { const [file, type] = files[url.pathname]; res.writeHead(200, { 'Content-Type': type }); return res.end(await readFile(new URL(`./public/${file}`, import.meta.url))); }
    reply(res, 404, { error: 'Not found.' });
  } catch (e) { if (!res.headersSent) reply(res, 400, { error: e.message }); else res.end(); }
}
export async function requestHandler(req, res) {
 let lease;
 try {
  // Authenticate before database access. Health checks reveal no workspace information.
  if (req.url === '/healthz') return reply(res, 200, { ok: true });
  if (!authorized(req.headers.authorization, password)) {
   res.setHeader('WWW-Authenticate', 'Basic realm="Coloring Studio", charset="UTF-8"');
   return reply(res, 401, {error:'Sign in with username studio and your demo password.'});
  }
  if(req.method === 'POST') {lease=await storage.acquire();if(!lease)return reply(res,409,{error:'An agent is working. Wait until it finishes.'});}
  const loaded=await storage.load();
  // An expired lease means a previous serverless invocation was interrupted.
  if(!loaded.busy || lease) for(const project of loaded.projects) if(project.status==='running') {project.status='paused';project.error='Previous job was interrupted. Review completed pages before continuing.';}
  const credentials = await keyStatus(password);
  await context.run({...loaded,lease,credentials},()=>handle(req,res));
 } catch(e) {
  console.error('Request failed:', e.name);
  if(!res.headersSent)reply(res,503,{error:'Storage is unavailable. Check the deployment database configuration.'});else res.end();
 } finally {if(lease)await storage.release(lease).catch(()=>console.error('Lease release failed'));}
}
if (!process.env.VERCEL) {
 const server = http.createServer(requestHandler);
 server.listen(Number(process.env.PORT || 3000), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log(`Coloring Studio running on port ${server.address().port}`));
}
