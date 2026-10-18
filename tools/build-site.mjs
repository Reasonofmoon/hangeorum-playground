// 기존 미러(_mirror)에서 공개 사이트(site/)와 보호 파일(_gated/)을 나눠 만든다.
// 사용: node tools/build-site.mjs <mirrorDir> <gatedOutDir>
// 공개 저장소에는 site/만 들어가고, _gated/는 Drive 50_원문 폴더로 올린다.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MIRROR = path.resolve(process.argv[2] || path.join(repo, '..', '_mirror'));
const GATED = path.resolve(process.argv[3] || path.join(repo, '..', '_gated'));
const SITE = path.join(repo, 'site');

const KEEP_PUBLIC_OVERRIDES = path.join(repo, 'site-src'); // 우리가 고친 파일(덮어쓰기)

// 보호 대상 판정 (루트 기준 경로)
const isGatedFile = rel =>
  /^data\//.test(rel) ||
  /^review\//.test(rel) ||
  /^apps\/(file-management|publishing|web)\/lesson\.js$/.test(rel) ||
  /^apps\/ai50\/samples\.js$/.test(rel) ||
  /^materials\/(delivery|provenance)\//.test(rel) ||
  /^materials\/[^/]+\/lesson\.json$/.test(rel) ||
  /^materials\/.+\.(md|html|json|py|yaml|conf|txt|epub|pdf)$/.test(rel);
// 본문 안의 보호 파일 링크(스크립트 제외)를 view.html 뷰어로 돌린다
function rewriteGatedLinks(html, rel) {
  const root = '../'.repeat(rel.split('/').length - 1);
  return html.replace(/\bhref="([^"#?]+)([#?][^"]*)?"/g, (m, href, tail) => {
    if (/^(https?:|mailto:|#|data:|javascript:)/.test(href)) return m;
    const abs = path.posix.normalize(path.posix.join(path.posix.dirname(rel), href));
    if (!isGatedFile(abs) || /\.js$/.test(abs)) return m;
    return `href="${root}view.html?path=${encodeURIComponent(abs)}"`;
  });
}
const isDropped = rel => /^cdn-cgi\//.test(rel) || rel === 'favicon.ico';
// 본문(main)을 보호할 페이지: index.html(플레이그라운드 틀)과 apps/ 실습 화면은 제외
const gatesMain = rel => rel.endsWith('.html') && !['index.html', 'terms.html', 'view.html'].includes(rel) && !rel.startsWith('apps/');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const toRel = (base, p) => path.relative(base, p).split(path.sep).join('/');
const write = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };

function patchCSP(csp) {
  const d = new Map();
  for (const part of (csp || "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'").split(';')) {
    const [k, ...v] = part.trim().split(/\s+/); if (k) d.set(k, v);
  }
  const add = (k, ...vals) => { let v = (d.get(k) || []).filter(x => x !== "'none'"); for (const x of vals) if (!v.includes(x)) v.push(x); d.set(k, v); };
  add('script-src', "'self'", 'blob:', 'https://accounts.google.com/gsi/client');
  add('style-src', "'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style');
  add('img-src', "'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com', 'https://drive.google.com');
  add('connect-src', 'https://script.google.com', 'https://script.googleusercontent.com', 'https://accounts.google.com/gsi/');
  add('frame-src', "'self'", 'https://accounts.google.com/gsi/', 'https://drive.google.com');
  add('font-src', "'self'");
  return [...d].map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

const LEGAL = `<div class="hg-legal" role="contentinfo"><p>© 2026 한 걸음 서재. 모든 권리 보유. 글·이미지·실습 구성의 무단 복제와 재배포를 금지합니다. <a href="{ROOT}terms.html">이용 조건</a></p></div>`;

function transformHtml(rel, html, gatedOut) {
  const depth = rel.split('/').length - 1;
  const root = '../'.repeat(depth);
  // Cloudflare가 넣은 인라인 챌린지 스크립트 제거
  html = html.replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/g, '');
  // CSP / referrer
  if (/http-equiv="Content-Security-Policy"/.test(html)) html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (m, a, c, b) => a + patchCSP(c) + b);
  else html = html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${patchCSP('')}">`);
  html = html.replace(/<meta name="referrer" content="no-referrer">/, '<meta name="referrer" content="strict-origin-when-cross-origin">');
  // 스크립트 분류
  const gateData = [], gateScripts = [];
  html = html.replace(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g, (m, a, src, b) => {
    if (/^https?:/.test(src)) return m;
    const abs = path.posix.normalize(path.posix.join(path.posix.dirname(rel), src));
    if (isGatedFile(abs)) gateData.push(abs); else gateScripts.push(src);
    return '';
  });
  html = rewriteGatedLinks(html, rel);
  let gateMain = '';
  if (gatesMain(rel)) {
    const m = html.match(/(<main\b[^>]*>)([\s\S]*)(<\/main>)/);
    if (m) {
      gatedOut.set(rel, m[2]);
      gateMain = rel;
      const h1 = (m[2].match(/<h1[\s\S]*?<\/h1>/) || [''])[0].replace(/<[^>]+>/g, '').trim();
      const ph = `<div class="page-width hg-gate" data-gate-main="${rel}"><p class="hg-gate-eyebrow">한 걸음 서재 학습자 전용</p><h1>${h1 || '수업 자료'}</h1><p class="hg-gate-msg">본문을 불러오는 중입니다…</p><div class="hg-gate-login"></div></div>`;
      html = html.replace(m[0], m[1] + ph + m[3]);
    }
  }
  const metas = [
    `<meta name="gate-root" content="${root}">`,
    gateData.length ? `<meta name="gate-data" content="${gateData.join(' ')}">` : '',
    gateScripts.length ? `<meta name="gate-scripts" content="${gateScripts.join(' ')}">` : '',
    gateMain ? `<meta name="gate-main" content="${gateMain}">` : '',
    `<link rel="stylesheet" href="${root}assets/gate.css">`,
    `<script src="${root}assets/config.js"></script>`,
    `<script src="${root}assets/gate.js"></script>`,
  ].filter(Boolean).join('');
  html = html.replace(/<\/head>/i, metas + '</head>');
  const legal = LEGAL.replace('{ROOT}', root);
  html = html.replace(/<\/body>/i, `<div id="hg-auth" class="hg-auth" aria-live="polite"></div>${legal}</body>`);
  return html;
}

// ---- 실행 ----
fs.rmSync(SITE, { recursive: true, force: true });
fs.rmSync(GATED, { recursive: true, force: true });
const gatedMain = new Map();
let pub = 0, gated = 0;
for (const file of walk(MIRROR)) {
  const rel = toRel(MIRROR, file);
  if (isDropped(rel)) continue;
  if (isGatedFile(rel)) { write(path.join(GATED, rel), fs.readFileSync(file)); gated++; continue; }
  if (rel.endsWith('.html')) write(path.join(SITE, rel), transformHtml(rel, fs.readFileSync(file, 'utf8'), gatedMain));
  else write(path.join(SITE, rel), fs.readFileSync(file));
  pub++;
}
for (const [rel, body] of gatedMain) { write(path.join(GATED, '__main__', rel), body); gated++; }
// 우리가 직접 고친 공개 파일 덮어쓰기
if (fs.existsSync(KEEP_PUBLIC_OVERRIDES)) for (const f of walk(KEEP_PUBLIC_OVERRIDES)) {
  const rel = toRel(KEEP_PUBLIC_OVERRIDES, f);
  let data = fs.readFileSync(f);
  if (rel.endsWith('.html')) data = transformHtml(rel, data.toString('utf8'), gatedMain);
  write(path.join(SITE, rel), data);
}
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
console.log(JSON.stringify({ site: SITE, gated: GATED, publicFiles: pub, gatedFiles: gated, gatedPages: gatedMain.size }));
