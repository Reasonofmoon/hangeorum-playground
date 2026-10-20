/**
 * 한 걸음 서재 공개 읽기 API (소유자 권한으로 실행, 누구나 접근)
 *
 * POST body(JSON, text/plain):
 *   {action:'bundle', paths:[...], main:'lessons/x.html', token:'<Google ID token>'}
 *   {action:'file', path:'materials/...', token}
 *   {action:'media', paths:['assets/supplements/..jpg', ...], have:{path:etag}, token}  (학습자만, 원문 이미지)
 * GET ?action=health
 *
 * 규칙
 * - 로그인하지 않았거나 명단에 없는 사람: 플레이그라운드 목록 + 각 튜토리얼 앞 N단계만
 * - 명단에 있는 학습자: 전체 데이터·원문, 6시간당 조회 한도 적용, 계정별 추적 번호 발급
 * - 모든 요청은 access_log 탭에 남긴다
 */
var PLAYGROUND_PATH = 'data/playground-v7.js';

function doGet(e) {
  var a = (e && e.parameter && e.parameter.action) || 'health';
  if (a === 'health') return json_({ ok: true, version: CFG.VERSION, login: CFG.CLIENT_IDS.length > 0 });
  return json_({ ok: false, message: 'POST로 요청하세요.' });
}

function doPost(e) {
  var t0 = Date.now();
  var req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, message: '잘못된 요청' }); }
  var auth = verifyToken_(req.token);
  var user = auth.email ? { email: auth.email, name: auth.name } : null;
  var learner = user ? isLearner_(user.email) : false;
  var res;
  try {
    if (req.action === 'bundle') res = bundle_(req, user, learner);
    else if (req.action === 'file') res = file_(req, user, learner);
    else if (req.action === 'media') res = media_(req, user, learner);
    else res = { ok: false, message: '알 수 없는 요청' };
  } catch (err) {
    res = { ok: false, message: '서버 오류: ' + err.message };
  }
  if (user) { user.trace = learner ? trace_(user.email) : ''; res.user = user; }
  if (auth.invalid) res.tokenInvalid = true;
  // 이미지 요청은 본문 조회(bundle) 때 이미 기록되므로, 거절된 경우만 남긴다
  if (req.action !== 'media' || res.ok === false) logAccess_(user, req, res, Date.now() - t0);
  return json_(res);
}

// ---------- 요청 처리 ----------
function bundle_(req, user, learner) {
  var paths = (req.paths || []).slice(0, 8);
  var out = { ok: true, level: learner ? 'full' : 'preview', files: {}, main: null };
  if (learner && !quotaOk_(user.email)) {
    out.ok = false; out.level = 'limited'; out.result = 429;
    out.message = '짧은 시간에 조회가 많아 잠시 제한되었습니다. 몇 시간 뒤 다시 열어 주세요.';
    learner = false;
  }
  var have = req.have || {};
  out.packed = {}; out.etags = {}; out.cached = [];
  for (var i = 0; i < paths.length; i++) {
    var p = String(paths[i]);
    if (p === PLAYGROUND_PATH) { out.files[p] = playgroundJs_(learner); continue; }
    if (!learner) continue;
    var m = manifest_()[p];
    if (!m || m.binary || m.image) continue;
    var tag = etag_(m);
    out.etags[p] = tag;
    if (have[p] && have[p] === tag) { out.cached.push(p); continue; }
    var z = readPacked_(p);
    if (z !== null) out.packed[p] = z;
  }
  if (req.main) {
    if (learner) out.main = readGated_('__main__/' + req.main);
    else out.message = out.message || (user ? '이 계정은 학습자 명단에 없습니다. 운영자에게 등록을 요청해 주세요.' : '이 본문은 학습자로 로그인하면 볼 수 있습니다.');
  }
  if (!learner && paths.some(function (p) { return p !== PLAYGROUND_PATH; }) && !out.message) {
    out.message = user ? '이 계정은 학습자 명단에 없습니다. 운영자에게 등록을 요청해 주세요.' : '이 실습은 학습자로 로그인하면 열립니다.';
  }
  return out;
}

function file_(req, user, learner) {
  var p = String(req.path || '');
  if (!learner) return { ok: false, message: user ? '학습자 명단에 없는 계정입니다.' : '학습자로 로그인하면 볼 수 있습니다.' };
  if (!quotaOk_(user.email)) return { ok: false, result: 429, message: '조회 한도를 넘었습니다. 몇 시간 뒤 다시 시도해 주세요.' };
  var m = manifest_()[p];
  if (!m || m.image) return { ok: false, message: '없는 자료입니다.' };
  if (m.binary) return { ok: true, kind: 'binary', driveUrl: 'https://drive.google.com/drive/folders/' + CFG.RESOURCES_LEARNERS_FOLDER };
  return { ok: true, kind: 'text', text: readGated_(p) };
}

// 원문 이미지: 학습자에게만 base64로 준다. 브라우저가 Blob으로 바꿔 표시하고 보관한다.
var MEDIA_PREFIX = 'assets/supplements/';
function media_(req, user, learner) {
  if (!learner) return { ok: false, message: user ? '학습자 명단에 없는 계정입니다.' : '학습자로 로그인하면 볼 수 있습니다.' };
  var paths = (req.paths || []).slice(0, CFG.MEDIA_PER_REQUEST);
  if (!mediaQuotaOk_(user.email, paths.length)) return { ok: false, result: 429, message: '그림 조회가 많아 잠시 제한되었습니다. 몇 시간 뒤 다시 열어 주세요.' };
  var have = req.have || {}, man = manifest_();
  var out = { ok: true, files: {}, etags: {}, cached: [] };
  paths.forEach(function (raw) {
    var p = String(raw);
    if (p.indexOf(MEDIA_PREFIX) !== 0 || p.indexOf('..') >= 0) return;
    var m = man[p];
    if (!m || !m.image) return;
    var tag = etag_(m);
    out.etags[p] = tag;
    if (have[p] && have[p] === tag) { out.cached.push(p); return; }
    var key = 'img:' + tag;
    var b64 = getBig_(key);
    if (!b64) { b64 = Utilities.base64Encode(DriveApp.getFileById(m.id).getBlob().getBytes()); putBig_(key, b64); }
    out.files[p] = { type: m.mime || 'image/jpeg', b64: b64 };
  });
  return out;
}

function mediaQuotaOk_(email, n) {
  var c = CacheService.getScriptCache();
  var k = 'mq:' + email + ':' + Math.floor(Date.now() / 21600000);
  var used = Number(c.get(k) || 0) + n;
  c.put(k, String(used), 21600);
  return used <= CFG.MEDIA_QUOTA_PER_6H;
}

// ---------- 플레이그라운드 데이터 ----------
function publishedText_() {
  var cache = CacheService.getScriptCache();
  var stamp = cache.get('pub:stamp');
  if (!stamp) {
    stamp = String(DriveApp.getFileById(CFG.PUBLISHED_ID).getLastUpdated().getTime());
    cache.put('pub:stamp', stamp, 60);
  }
  var key = 'pub:' + stamp;
  var hit = getBig_(key);
  if (hit) return hit;
  var text = DriveApp.getFileById(CFG.PUBLISHED_ID).getBlob().getDataAsString('UTF-8');
  putBig_(key, text);
  return text;
}

function playgroundJs_(full) {
  var text = publishedText_();
  if (full) return 'window.PLAYGROUND_CATALOG=' + text + ';';
  var cache = CacheService.getScriptCache();
  var key = 'prev:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)).slice(0, 12);
  var hit = getBig_(key);
  if (hit) return hit;
  var cat = JSON.parse(text);
  var n = CFG.PREVIEW_STEPS;
  cat.items.forEach(function (it) {
    it.stepCount = it.steps.length;
    it.steps = it.steps.slice(0, n);
    it.locked = it.stepCount > n;
    delete it.hints; delete it.expected; delete it.recovery;
  });
  delete cat.epub; delete cat.sourceHashes;
  cat.preview = true;
  var js = 'window.PLAYGROUND_CATALOG=' + JSON.stringify(cat) + ';';
  putBig_(key, js);
  return js;
}

// ---------- 보호 파일 ----------
function manifest_() {
  var cache = CacheService.getScriptCache();
  var hit = getBig_('manifest');
  if (hit) return JSON.parse(hit);
  var text = DriveApp.getFileById(CFG.MANIFEST_ID).getBlob().getDataAsString('UTF-8');
  putBig_('manifest', text, 600);
  return JSON.parse(text);
}

function etag_(m) { return (m.v || m.id) + ':' + m.bytes; }

// gzip + base64 로 압축한 본문(큰 데이터 파일용). 브라우저가 DecompressionStream으로 푼다.
function readPacked_(path) {
  var m = manifest_()[path];
  if (!m || m.binary) return null;
  var key = 'z:' + etag_(m);
  var hit = getBig_(key);
  if (hit) return hit;
  var blob = DriveApp.getFileById(m.id).getBlob();
  var z = Utilities.base64Encode(Utilities.gzip(blob).getBytes());
  putBig_(key, z);
  return z;
}

function readGated_(path) {
  var m = manifest_()[path];
  if (!m || m.binary) return null;
  var key = 'src:' + m.id;
  var hit = getBig_(key);
  if (hit) return hit;
  var text = DriveApp.getFileById(m.id).getBlob().getDataAsString('UTF-8');
  putBig_(key, text);
  return text;
}

// 큰 문자열을 나눠서 캐시(값 하나당 100KB 제한)
function putBig_(key, text, ttl) {
  try {
    var size = 90000, parts = {}, n = Math.ceil(text.length / size);
    if (n > 300) return;
    if (/[^\x00-\x7f]/.test(text)) { size = 25000; n = Math.ceil(text.length / size); if (n > 300) return; }
    for (var i = 0; i < n; i++) parts[key + ':' + i] = text.substr(i * size, size);
    parts[key + ':n'] = String(n);
    CacheService.getScriptCache().putAll(parts, ttl || 21600);
  } catch (err) { /* 캐시 실패는 무시 */ }
}
function getBig_(key) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key + ':n'));
  if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(key + ':' + i);
  var got = c.getAll(keys), out = '';
  for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; out += got[keys[j]]; }
  return out;
}

// ---------- 로그인·명단 ----------
function verifyToken_(token) {
  if (!token || !CFG.CLIENT_IDS.length) return {};
  var cache = CacheService.getScriptCache();
  var k = 'tok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { invalid: true };
  var p = JSON.parse(r.getContentText());
  var ok = CFG.CLIENT_IDS.indexOf(p.aud) >= 0 && String(p.email_verified) === 'true' && Number(p.exp) * 1000 > Date.now() &&
    (p.iss === 'accounts.google.com' || p.iss === 'https://accounts.google.com');
  if (!ok) return { invalid: true };
  var u = { email: String(p.email).toLowerCase(), name: p.name || '' };
  var ttl = Math.max(60, Math.min(3000, Math.floor((Number(p.exp) * 1000 - Date.now()) / 1000)));
  cache.put(k, JSON.stringify(u), ttl);
  return u;
}

function learners_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('learners');
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('learners');
  var rows = sh.getDataRange().getValues();
  var head = rows.shift();
  var ie = head.indexOf('email'), ix = head.indexOf('expires');
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var map = {};
  rows.forEach(function (r) {
    var em = String(r[ie] || '').trim().toLowerCase(); if (!em) return;
    var exp = r[ix];
    if (exp) { var d = exp instanceof Date ? exp : new Date(exp); if (!isNaN(d) && d < today) return; }
    map[em] = 1;
  });
  map[CFG.OWNER] = 1;
  cache.put('learners', JSON.stringify(map), 300);
  return map;
}
function isLearner_(email) { return !!learners_()[String(email).toLowerCase()]; }

function quotaOk_(email) {
  var c = CacheService.getScriptCache();
  var k = 'q:' + email + ':' + Math.floor(Date.now() / 21600000);
  var n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 21600);
  return n <= CFG.QUOTA_PER_6H;
}

function trace_(email) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('TRACE_SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('TRACE_SALT', salt); }
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + email);
  return d.slice(0, 4).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').toUpperCase();
}

// ---------- 기록 ----------
function logAccess_(user, req, res, ms) {
  try {
    var sh = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('access_log');
    var paths = (req.paths || []).concat(req.main ? ['main:' + req.main] : []).concat(req.path ? [req.path] : []);
    var tid = '';
    var m = String(req.page || '').match(/tutorial=([^&]+)/); if (m) tid = decodeURIComponent(m[1]);
    if (!tid && req.main) tid = req.main.replace(/\.html$/, '');
    sh.appendRow([new Date(), user ? user.email : '', user ? (user.trace || '') : '', req.action || '', paths.join(' ').slice(0, 400), tid,
      res.result || (res.ok === false ? 'denied' : res.level || 'ok'), ms]);
  } catch (err) { /* 기록 실패는 응답에 영향 주지 않음 */ }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// 소유자가 편집기에서 한 번 실행해 권한을 승인하는 함수
function authorizeOnce() {
  DriveApp.getFileById(CFG.MANIFEST_ID).getName();
  SpreadsheetApp.openById(CFG.SHEET_ID).getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  CacheService.getScriptCache().put('x', '1', 10);
  Logger.log('ok ' + trace_(CFG.OWNER));
}
