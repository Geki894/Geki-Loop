#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const portArg = process.argv.indexOf("--port");
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : 4178);
async function json(file, fallback) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function github() {
  try {
    const [prs, runs] = await Promise.all([
      execFileAsync("gh", ["pr", "list", "--state", "open", "--json", "number,title,headRefName,baseRefName,statusCheckRollup,url"], { cwd: root, timeout: 5000 }),
      execFileAsync("gh", ["run", "list", "--limit", "10", "--json", "status,conclusion,name,workflowName,url,headBranch"], { cwd: root, timeout: 5000 })
    ]);
    return { available: true, pullRequests: JSON.parse(prs.stdout), runs: JSON.parse(runs.stdout) };
  } catch (error) { return { available: false, reason: error.message }; }
}
async function snapshot() {
  const eventsPath = path.join(root, ".geki", "state", "events.jsonl");
  let events = [];
  try { events = (await fs.readFile(eventsPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).slice(-100).map(JSON.parse).reverse(); } catch {}
  return {
    state: await json(path.join(root, ".geki", "state", "current-run.json"), {}),
    planning: await json(path.join(root, ".geki", "state", "planning.json"), {}),
    deliverySlice: await json(path.join(root, ".geki", "planning", "delivery-slice.json"), {}),
    findings: await json(path.join(root, ".geki", "findings", "registry.json"), { findings: [] }),
    architecture: await json(path.join(root, ".geki", "architecture.json"), {}),
    lock: await json(path.join(root, ".geki", "lock.json"), {}),
    events,
    github: await github()
  };
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Geki Dashboard</title><style>
:root{font-family:Inter,Segoe UI,sans-serif;color:#e8edf5;background:#0c111b}body{margin:0;padding:24px;max-width:1200px;margin:auto}h1{margin:0 0 4px}.muted{color:#8fa0b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:24px 0}.card{background:#151d2b;border:1px solid #29364b;border-radius:12px;padding:18px}.value{font-size:1.35rem;color:#7dd3fc}.pill{display:inline-block;padding:4px 9px;border-radius:999px;background:#203047;margin:3px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #29364b}code{color:#a7f3d0}</style></head><body><h1>Geki Loop</h1><div class="muted">Read-only project and GitHub progress</div><div id="app">Loading…</div><script>
const e=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function render(){const d=await fetch('/api/state').then(r=>r.json());const s=d.state||{},p=d.planning||{},slice=d.deliverySlice||{},open=(d.findings?.findings||[]).filter(x=>x.status==='open');document.getElementById('app').innerHTML='<div class="grid"><div class="card"><div class="muted">Planning profile</div><div class="value">'+e(p.profile?.id)+'</div><p>Stage: '+e(p.stage)+' · '+e(p.status)+'</p></div><div class="card"><div class="muted">Current delivery</div><div class="value">'+e((slice.storyIds||[]).length)+' Stories</div><p>'+e(slice.status)+' · Open findings: '+e(open.length)+'</p></div><div class="card"><div class="muted">Execution</div><div class="value">'+e(s.phase)+'</div><p>'+e(s.currentStory||s.currentEpic)+' · Gate: '+e(s.currentGate)+'</p></div><div class="card"><div class="muted">GitHub</div><div class="value">'+(d.github.available?'Connected':'Unavailable')+'</div><p>Open PRs: '+e(d.github.pullRequests?.length||0)+'</p></div></div><div class="card"><h2>Next action</h2><p>'+e(p.nextAction)+'</p></div><div class="card"><h2>Modules</h2>'+Object.keys(d.lock.modules||{}).map(x=>'<span class="pill">'+e(x)+'</span>').join('')+'</div><div class="card"><h2>Recent events</h2><table><tr><th>Time</th><th>Event</th></tr>'+d.events.map(x=>'<tr><td>'+e(x.at)+'</td><td><code>'+e(x.type)+'</code></td></tr>').join('')+'</table></div>'}render();setInterval(render,5000);
</script></body></html>`;
const server = http.createServer(async (request, response) => {
  if (request.method !== "GET") { response.writeHead(405); return response.end("Read-only dashboard"); }
  if (request.url === "/api/state") { response.setHeader("content-type", "application/json"); return response.end(JSON.stringify(await snapshot())); }
  if (request.url === "/" || request.url === "/index.html") { response.setHeader("content-type", "text/html; charset=utf-8"); return response.end(html); }
  response.writeHead(404); response.end("Not found");
});
server.listen(port, "127.0.0.1", () => console.log(`Geki dashboard: http://127.0.0.1:${port}`));
