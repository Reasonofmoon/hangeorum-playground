// Drive 폴더·원본 시트·보호 파일을 만든다. clasp 로그인 토큰(drive.file 범위)을 쓴다.
// 사용: node tools/drive-setup.mjs <gatedDir> <sheet.xlsx> <stateFile>
// 다시 실행하면 stateFile을 보고 이미 만든 것은 건너뛰고, 원문 파일은 내용이 바뀐 것만 갱신한다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const [GATED, XLSX, STATE_FILE] = process.argv.slice(2).map(p => path.resolve(p));
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { folders: {}, files: {} };
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

const rc = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8')).tokens.default;
let TOKEN = '';
async function refresh() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: rc.client_id, client_secret: rc.client_secret, refresh_token: rc.refresh_token, grant_type: 'refresh_token' }) });
  const d = await r.json(); if (!d.access_token) throw new Error('토큰 갱신 실패: ' + d.error); TOKEN = d.access_token;
}
async function api(url, opt = {}, retry = 3) {
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + TOKEN, ...(opt.headers || {}) } });
  if ((r.status === 429 || r.status >= 500) && retry) { await new Promise(s => setTimeout(s, 1500)); return api(url, opt, retry - 1); }
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${url}\n${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}
async function folder(key, name, parent) {
  if (state.folders[key]) return state.folders[key];
  const f = await api('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }) });
  state.folders[key] = f.id; save(); return f.id;
}
function multipart(meta, buf, mime) {
  const b = 'hgb' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`),
    buf, Buffer.from(`\r\n--${b}--`)]);
  return { body, type: `multipart/related; boundary=${b}` };
}
async function upload({ key, name, parent, buf, mime, convertTo, props }) {
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const prev = state.files[key];
  if (prev && prev.hash === hash) return prev.id;
  if (prev) { // 내용 갱신
    await api(`https://www.googleapis.com/upload/drive/v3/files/${prev.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': mime }, body: buf });
    state.files[key] = { id: prev.id, hash }; save(); return prev.id;
  }
  const meta = { name, parents: [parent], appProperties: props || undefined, mimeType: convertTo || undefined };
  const mp = multipart(meta, buf, mime);
  const f = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'content-type': mp.type }, body: mp.body });
  state.files[key] = { id: f.id, hash }; save(); return f.id;
}
async function anyoneReader(id) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
}
const mimeOf = p => ({ '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.md': 'text/markdown', '.csv': 'text/csv', '.txt': 'text/plain', '.py': 'text/x-python', '.yaml': 'text/yaml', '.conf': 'text/plain', '.pdf': 'application/pdf', '.epub': 'application/epub+zip' }[path.extname(p).toLowerCase()] || 'application/octet-stream');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

await refresh();
const ROOT = await folder('root', '한 걸음 서재 CMS');
const F = {
  admin: await folder('admin', '00_관리', ROOT),
  mediaPublic: await folder('mediaPublic', '10_미디어_공개', ROOT),
  mediaDraft: await folder('mediaDraft', '20_미디어_초안', ROOT),
  resources: await folder('resources', '30_자료', ROOT),
  publish: await folder('publish', '40_게시본', ROOT),
  source: await folder('source', '50_원문', ROOT),
  archive: await folder('archive', '90_보관', ROOT),
};
F.resourcesPublic = await folder('resourcesPublic', '공개', F.resources);
F.resourcesLearners = await folder('resourcesLearners', '학습자용', F.resources);
F.versions = await folder('versions', 'versions', F.publish);
if (!state.sharedPublic) { await anyoneReader(F.mediaPublic); await anyoneReader(F.resourcesPublic); state.sharedPublic = true; save(); }

// 원본 시트
const sheetId = await upload({ key: 'sheet', name: '한걸음서재_원본', parent: F.admin, buf: fs.readFileSync(XLSX), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', convertTo: 'application/vnd.google-apps.spreadsheet' });

// 보호 파일(원문)
const manifest = {};
const files = walk(GATED);
let n = 0;
for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map(async f => {
    const rel = path.relative(GATED, f).split(path.sep).join('/');
    const id = await upload({ key: 'src:' + rel, name: rel.replace(/\//g, '__'), parent: F.source, buf: fs.readFileSync(f), mime: mimeOf(rel), props: { path: rel.slice(0, 100) } });
    manifest[rel] = { id, bytes: fs.statSync(f).size, binary: /\.(pdf|epub)$/i.test(rel), v: state.files['src:' + rel].hash.slice(0, 12) };
    n++;
  }));
  if (i % 60 === 0) await refresh();
}
const manifestId = await upload({ key: 'manifest', name: 'manifest.json', parent: F.source, buf: Buffer.from(JSON.stringify(manifest)), mime: 'application/json' });

// 첫 게시본 = 기존 v7 카탈로그 그대로
const v7 = fs.readFileSync(path.join(GATED, 'data', 'playground-v7.js'), 'utf8');
const catalog = v7.slice(v7.indexOf('=') + 1).trim().replace(/;\s*$/, '');
const publishedId = await upload({ key: 'published', name: 'playground-catalog.json', parent: F.publish, buf: Buffer.from(catalog), mime: 'application/json' });
await upload({ key: 'version1', name: 'playground-catalog.v1.json', parent: F.versions, buf: Buffer.from(catalog), mime: 'application/json' });

const out = { ROOT, ...F, SHEET_ID: sheetId, MANIFEST_ID: manifestId, PUBLISHED_ID: publishedId, gatedFiles: n };
state.out = out; save();
console.log(JSON.stringify(out, null, 1));
