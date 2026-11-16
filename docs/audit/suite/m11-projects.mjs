// M11 — Projects & undertakings audit
// project CRUD → bootstrap feed → the undertakings table renders from it →
// project applications.
import {AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, extractFn, REPO } from './lib.mjs';
import { readFileSync } from 'fs';
import vm from 'vm';

const r = new Report('m11-projects');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const zk = await login(AUDIT, 'zk@solis.local');
  const os = await login(AUDIT, 'os@solis.local');

  // ── 1. listing and creation ───────────────────────────────────────────
  const anon = await req(AUDIT, 'GET', '/projects');
  r.check('anonymous project listing -> 401', anon.status === 401, anon);
  const list = await req(AUDIT, 'GET', '/projects', zk);
  r.check('a member can list projects', list.status === 200 && Array.isArray(list.j), list);

  const create = await req(AUDIT, 'POST', '/projects', zk, {
    id: 'audit-m11-project', title: 'Audit M11 Project', lead: 'Zanele Khumalo',
    progress: 25, role: 'Contributor', domains: ['Space Law']
  });
  r.check('a member can create a project -> 200/201', create.status === 200 || create.status === 201, create);
  const row = sqlRows(DB_AUDIT, "SELECT id,title,lead,progress,role FROM projects WHERE id='audit-m11-project';")[0];
  r.check('the project is stored with its progress', row && Number(row.progress) === 25 && row.lead === 'Zanele Khumalo', row);

  const patch = await req(AUDIT, 'PATCH', '/projects/audit-m11-project', zk, { progress: 80 });
  r.check('a project can be updated -> 200', patch.status === 200, patch);
  const row2 = sqlRows(DB_AUDIT, "SELECT progress FROM projects WHERE id='audit-m11-project';")[0];
  r.check('the progress change is persisted', row2 && Number(row2.progress) === 80, row2);

  // ── 2. the bootstrap feed the undertakings view renders ───────────────
  const bs = await req(AUDIT, 'GET', '/bootstrap', zk);
  const inFeed = (bs.j.projects || []).some(p => p.id === 'audit-m11-project');
  r.check('the project appears in the bootstrap feed', inFeed, (bs.j.projects || []).map(p => p.id));

  // L3: the real undertakings renderer (mock-loader.js), run against the live payload
  const rendered = {};
  const sandbox = {
    document: { getElementById: () => ({ textContent: '', style: {}, innerHTML: '' }) },
    setText: (id, v) => { rendered[id] = String(v); },
    setHtml: (id, v) => { rendered[id] = String(v); },
    escapeHtml: s => s,
    MOCK: bs.j,
    Number: Number, Math: Math, String: String, Array: Array, Object: Object, console: console
  };
  vm.createContext(sandbox);
  const loaderSrc = readFileSync(REPO + '/platform/mock-loader.js', 'utf8');
  vm.runInContext(extractFn(loaderSrc, 'renderProjectRows'), sandbox);
  const html = sandbox.renderProjectRows();
  r.check('the undertakings table renders the new project',
    /Audit M11 Project/.test(html) && /80%/.test(html), html.slice(0, 300));
  r.check('the rendered row shows the project role', /Contributor/.test(html), html.slice(0, 300));

  // ── 3. project applications ───────────────────────────────────────────
  const cell = sqlRows(DB_AUDIT, "SELECT id FROM cells WHERE type='Project Cell' LIMIT 1;")[0];
  const app = await req(AUDIT, 'POST', '/project-applications', os, {
    id: 'audit-m11-app', cell_id: cell.id, project_name: 'Audit M11 Project',
    applicant: 'Oumo Samuel', initials: 'OS', motivation: 'M11 apply', proposed_role: 'Contributor'
  });
  r.check('a member can apply to a project -> 200/201', app.status === 200 || app.status === 201, app);
  const appRow = sqlRows(DB_AUDIT, "SELECT id,applicant,status,proposed_role FROM project_applications WHERE id='audit-m11-app';")[0];
  r.check('the application is stored', appRow && appRow.applicant === 'Oumo Samuel' && appRow.status === 'pending', appRow);
  const apps = await req(AUDIT, 'GET', '/project-applications', sd);
  r.check('applications are listable', apps.status === 200 && Array.isArray(apps.j), apps);
  const bs2 = await req(AUDIT, 'GET', '/bootstrap', sd);
  r.check('project applications reach the bootstrap payload',
    Array.isArray(bs2.j.projectApplications) && bs2.j.projectApplications.some(a => a.id === 'audit-m11-app'),
    bs2.j.projectApplications);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
