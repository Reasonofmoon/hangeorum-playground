/**
 * 한 걸음 서재 관리자 웹앱 (접속한 사용자 권한으로 실행)
 * 화면: Index.html / 서버 함수: google.script.run.<함수명>
 */
var TUT_COLS = ['id', 'publish_state', 'category', 'code', 'title', 'description', 'tags', 'difficulty', 'difficultyBasis', 'minutes', 'timeBasis', 'mode', 'engine', 'practiceUrl', 'sourceUrl', 'scopeNote', 'expected', 'recovery', 'hints', 'conditional', 'status', 'sourceKind', 'courseId', 'sourceStatus', 'volumeIds', 'simulation', 'rights_json', 'blockers_json', 'resources_json', 'cover_media_id', 'updated_by', 'updated_at'];
var STEP_COLS = ['tutorial_id', 'order', 'code', 'title', 'instruction', 'expected', 'recovery', 'kind', 'sourceType', 'assessmentBasis', 'sourceUrl', 'practiceUrl', 'media_id', 'media_caption', 'extra_json'];
var MEDIA_COLS = ['media_id', 'drive_file_id', 'type', 'display', 'alt', 'caption', 'source', 'rights', 'public_url', 'uploaded_by', 'uploaded_at', 'used_in'];
var STATES = ['초안', '검수중', '게시', '보관'];

var REPO_RAW = 'https://raw.githubusercontent.com/Reasonofmoon/hangeorum-playground/main/content/';

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'import' && p.track) {
    try { var r = importFromRepo(p.track); return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">가져오기 완료: ' + r.added + '개 (초안). <a href="' + ScriptApp.getService().getUrl() + '" target="_top">관리자 화면으로</a></p>'); }
    catch (err) { return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;color:#b3261e">가져오기 실패: ' + String(err.message).replace(/[<>&]/g, '') + '</p>'); }
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('한 걸음 서재 관리자')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

// ---------- 공통 ----------
function me_() { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }
function ss_() { return SpreadsheetApp.openById(CFG.SHEET_ID); }
function tab_(name) { var s = ss_().getSheetByName(name); if (!s) throw new Error(name + ' 탭이 없습니다.'); return s; }
function read_(name) {
  var v = tab_(name).getDataRange().getValues();
  var head = v.shift().map(String);
  return { head: head, rows: v.map(function (r, i) { var o = { _row: i + 2 }; head.forEach(function (h, j) { o[h] = r[j]; }); return o; }) };
}
function toRow_(head, obj) { return head.map(function (h) { var v = obj[h]; return v === undefined || v === null ? '' : v; }); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
function log_(action, target, detail) { try { tab_('log').appendRow([new Date(), me_(), action, target || '', String(detail || '').slice(0, 1000)]); } catch (e) {} }
function settings_() { var o = {}; read_('settings').rows.forEach(function (r) { o[r.key] = r.value; }); return o; }
function parseJ_(s, d) { if (s === '' || s == null) return d; try { return JSON.parse(s); } catch (e) { return d; } }
function hasEmail_(users, em) { return (users || []).some(function (u) { return String(u.getEmail()).toLowerCase() === em; }); }

/** 역할: Drive 공유 권한으로 판정 */
function role_() {
  var em = me_();
  if (!em) return 'none';
  if (em === CFG.OWNER) return 'operator';
  try { var f = DriveApp.getFolderById(CFG.FOLDERS.PUBLISH); if (hasEmail_(f.getEditors(), em)) return 'operator'; } catch (e) {}
  try {
    var s = DriveApp.getFileById(CFG.SHEET_ID);
    if (hasEmail_(s.getEditors(), em)) return 'editor';
    return 'reviewer';
  } catch (e) { return 'none'; }
}
function need_(min) {
  var order = { none: 0, reviewer: 1, editor: 2, operator: 3 };
  var r = role_();
  if (order[r] < order[min]) throw new Error('권한이 없습니다. 필요한 역할: ' + ({ reviewer: '검수자', editor: '편집자', operator: '운영자' })[min] + '. Drive 공유 설정에서 권한을 받으세요.');
  return r;
}

function getBootstrap() {
  var role = role_();
  if (role === 'operator') { try { var s0 = ss_(); if (s0.getSpreadsheetTimeZone() !== 'Asia/Seoul') s0.setSpreadsheetTimeZone('Asia/Seoul'); } catch (e) {} }
  var st = role === 'none' ? {} : settings_();
  return {
    email: me_(), role: role, siteUrl: CFG.SITE_URL,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + CFG.SHEET_ID + '/edit',
    folderUrl: 'https://drive.google.com/drive/folders/' + CFG.FOLDERS.ROOT,
    publishFolderUrl: 'https://drive.google.com/drive/folders/' + CFG.FOLDERS.PUBLISH,
    categories: parseJ_(st.categories_json, []), states: STATES,
    hasGeminiKey: role === 'none' ? false : !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'),
    geminiModel: st.gemini_model || '', maxUploadMb: CFG.MAX_UPLOAD_MB
  };
}

// ---------- 튜토리얼 ----------
function listTutorials() {
  need_('reviewer');
  var steps = read_('steps').rows, count = {};
  steps.forEach(function (s) { count[s.tutorial_id] = (count[s.tutorial_id] || 0) + 1; });
  return read_('tutorials').rows.map(function (r) {
    return { id: r.id, title: r.title, category: r.category, code: r.code, state: r.publish_state, mode: r.mode, steps: count[r.id] || 0, updated: fmt_(r.updated_at), conditional: String(r.conditional) === 'true' || r.conditional === true };
  });
}

function getTutorial(id) {
  need_('reviewer');
  var t = read_('tutorials').rows.filter(function (r) { return r.id === id; })[0];
  if (!t) throw new Error('없는 튜토리얼: ' + id);
  var steps = read_('steps').rows.filter(function (s) { return s.tutorial_id === id; }).sort(function (a, b) { return a.order - b.order; });
  var media = {};
  read_('media').rows.forEach(function (m) { media[m.media_id] = m; });
  var used = {};
  steps.forEach(function (s) { if (s.media_id && media[s.media_id]) used[s.media_id] = mediaView_(media[s.media_id]); });
  var plain = function (o) { var r = {}; for (var k in o) if (k !== '_row') r[k] = o[k] instanceof Date ? fmt_(o[k]) : o[k]; return r; };
  return { tutorial: plain(t), steps: steps.map(plain), media: used };
}

function saveTutorial(payload) {
  need_('editor');
  var t = payload.tutorial, steps = payload.steps || [];
  if (!t.id || !/^[a-z0-9\-]+\/[a-z0-9\-]+$/.test(t.id)) throw new Error('ID 형식: 영문소문자-숫자/영문소문자-숫자 (예: google-workspace/gw-08)');
  if (!t.title) throw new Error('제목을 입력하세요.');
  if (STATES.indexOf(t.publish_state) < 0) t.publish_state = '초안';
  if (t.publish_state === '게시' && role_() !== 'operator') throw new Error('게시 상태는 운영자만 정할 수 있습니다. "검수중"으로 저장해 검수를 요청하세요.');
  ['rights_json', 'blockers_json', 'resources_json'].forEach(function (k) { if (t[k] && parseJ_(t[k], 'ERR') === 'ERR') throw new Error(k + ' JSON 형식 오류'); });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    t.updated_by = me_(); t.updated_at = now_();
    if (t.minutes === '' || t.minutes == null) t.minutes = steps.length ? steps.length * 2 : '';
    var sh = tab_('tutorials'), data = read_('tutorials');
    var hit = data.rows.filter(function (r) { return r.id === (payload.originalId || t.id); })[0];
    var row = toRow_(data.head, t);
    if (hit) sh.getRange(hit._row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    // 단계: 이 튜토리얼 것만 바꿔서 전체 다시 쓰기
    var sd = read_('steps'), ssh = tab_('steps');
    var keep = sd.rows.filter(function (s) { return s.tutorial_id !== t.id && s.tutorial_id !== payload.originalId; });
    var code = t.code || '';
    var fresh = steps.map(function (s, i) {
      return { tutorial_id: t.id, order: i + 1, code: s.code || (code ? code + '.' + (i + 1) : ''), title: s.title || (code ? code + '.' + (i + 1) : '단계 ' + (i + 1)), instruction: s.instruction || '', expected: s.expected || '', recovery: s.recovery || '', kind: s.kind || 'manual', sourceType: s.sourceType || '', assessmentBasis: s.assessmentBasis || '', sourceUrl: s.sourceUrl || '', practiceUrl: s.practiceUrl || '', media_id: s.media_id || '', media_caption: s.media_caption || '', extra_json: s.extra_json || '' };
    });
    var all = keep.concat(fresh).map(function (o) { return toRow_(sd.head, o); });
    ssh.getRange(2, 1, Math.max(ssh.getLastRow() - 1, 1), sd.head.length).clearContent();
    if (all.length) ssh.getRange(2, 1, all.length, sd.head.length).setValues(all);
  } finally { lock.releaseLock(); }
  log_('save', t.id, t.publish_state + ' · 단계 ' + steps.length);
  return { ok: true, id: t.id, updated_at: t.updated_at };
}

function duplicateTutorial(id, newId) {
  need_('editor');
  var d = getTutorial(id);
  d.tutorial.id = newId; d.tutorial.publish_state = '초안'; d.tutorial.title = d.tutorial.title + ' (복제)';
  return saveTutorial({ tutorial: d.tutorial, steps: d.steps });
}

// ---------- 미디어 ----------
function mediaView_(m) {
  var thumb = '';
  try { var b = DriveApp.getFileById(m.drive_file_id).getThumbnail(); if (b) thumb = 'data:image/png;base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) {}
  return { media_id: String(m.media_id), type: String(m.type), display: String(m.display), alt: String(m.alt || ''), caption: String(m.caption || ''), source: String(m.source || ''), rights: String(m.rights || ''), drive_file_id: String(m.drive_file_id), thumb: thumb, public_url: String(m.public_url || '') };
}
function uploadMedia(o) {
  need_('editor');
  if (!o.alt) throw new Error('대체 텍스트(alt)는 꼭 적어야 합니다. 화면을 못 보는 학습자가 읽습니다.');
  var bytes = Utilities.base64Decode(o.data);
  if (bytes.length > CFG.MAX_UPLOAD_MB * 1048576) throw new Error(CFG.MAX_UPLOAD_MB + 'MB 이하 파일만 올릴 수 있습니다.');
  var id = 'm-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  var file = DriveApp.getFolderById(CFG.FOLDERS.MEDIA_DRAFT).createFile(Utilities.newBlob(bytes, o.mime, id + '__' + o.name));
  var type = /gif$/i.test(o.mime) ? 'gif' : /^video\//.test(o.mime) ? 'video' : 'image';
  var row = { media_id: id, drive_file_id: file.getId(), type: type, display: type === 'video' ? 'drive-preview' : 'image', alt: o.alt, caption: o.caption || '', source: o.source || '직접 제작', rights: o.rights || '확인 필요', public_url: '', uploaded_by: me_(), uploaded_at: now_(), used_in: o.tutorialId || '' };
  tab_('media').appendRow(toRow_(MEDIA_COLS, row));
  log_('upload', id, o.name + ' ' + bytes.length + 'B');
  return mediaView_(row);
}
/** 20_미디어_초안 폴더에 직접 넣은 파일 중 아직 media 탭에 없는 것을 등록한다(대체 텍스트는 비워 둠 → 게시 검사에서 막힘). */
function scanDraftFolder() {
  need_('editor');
  var known = {};
  read_('media').rows.forEach(function (m) { known[m.drive_file_id] = 1; });
  var it = DriveApp.getFolderById(CFG.FOLDERS.MEDIA_DRAFT).getFiles(), rows = [], out = [];
  while (it.hasNext()) {
    var f = it.next(), mime = f.getMimeType();
    if (known[f.getId()] || !/^(image|video)\//.test(mime)) continue;
    if (f.getSize() > CFG.MAX_UPLOAD_MB * 1048576) continue;
    var id = 'm-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + '-' + (rows.length + 100);
    var type = /gif$/i.test(mime) ? 'gif' : /^video\//.test(mime) ? 'video' : 'image';
    var row = { media_id: id, drive_file_id: f.getId(), type: type, display: type === 'video' ? 'drive-preview' : 'image', alt: '', caption: '', source: 'Drive 폴더', rights: '확인 필요', public_url: '', uploaded_by: me_(), uploaded_at: now_(), used_in: '' };
    rows.push(toRow_(MEDIA_COLS, row)); out.push(row.media_id + ' · ' + f.getName());
  }
  if (rows.length) tab_('media').getRange(tab_('media').getLastRow() + 1, 1, rows.length, MEDIA_COLS.length).setValues(rows);
  log_('scan', 'media', rows.length + '개');
  return { added: rows.length, items: out };
}

function listMedia() {
  need_('reviewer');
  return read_('media').rows.reverse().slice(0, 60).map(mediaView_);
}
function updateMedia(id, fields) {
  need_('editor');
  var d = read_('media'), sh = tab_('media');
  var hit = d.rows.filter(function (r) { return r.media_id === id; })[0]; if (!hit) throw new Error('없는 미디어');
  ['alt', 'caption', 'source', 'rights', 'display'].forEach(function (k) { if (k in fields) hit[k] = fields[k]; });
  sh.getRange(hit._row, 1, 1, d.head.length).setValues([toRow_(d.head, hit)]);
  return mediaView_(hit);
}
function uploadResource(o) {
  need_('editor');
  var bytes = Utilities.base64Decode(o.data);
  if (bytes.length > CFG.MAX_UPLOAD_MB * 1048576) throw new Error(CFG.MAX_UPLOAD_MB + 'MB 이하 파일만 올릴 수 있습니다.');
  var folder = DriveApp.getFolderById(o.audience === '공개' ? CFG.FOLDERS.RESOURCES_PUBLIC : CFG.FOLDERS.RESOURCES_LEARNERS);
  var f = folder.createFile(Utilities.newBlob(bytes, o.mime, o.name));
  if (o.audience === '공개') f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  log_('resource', f.getId(), o.name + ' ' + o.audience);
  return { title: o.title || o.name, url: f.getUrl(), audience: o.audience };
}

// ---------- 검사·게시 ----------
function buildCatalog_() {
  var st = settings_();
  var tutorials = read_('tutorials').rows.filter(function (r) { return r.publish_state === '게시'; });
  var steps = read_('steps').rows, media = {};
  read_('media').rows.forEach(function (m) { media[m.media_id] = m; });
  var byT = {};
  steps.forEach(function (s) { (byT[s.tutorial_id] = byT[s.tutorial_id] || []).push(s); });
  var issues = [], usedMedia = {};
  var split = function (v, re) { return String(v || '').split(re).map(function (x) { return x.trim(); }).filter(String); };
  var bool = function (v) { return v === true || String(v).toUpperCase() === 'TRUE'; };
  var items = tutorials.map(function (r) {
    var ss = (byT[r.id] || []).sort(function (a, b) { return a.order - b.order; });
    var it = { id: r.id, title: r.title, description: r.description, category: r.category, tags: split(r.tags, /,/), difficulty: r.difficulty || '미지정', difficultyBasis: r.difficultyBasis || '', minutes: r.minutes === '' ? null : Number(r.minutes), timeBasis: r.timeBasis || '', mode: r.mode || 'guide', engine: r.engine || null, practiceUrl: r.practiceUrl || null, sourceUrl: r.sourceUrl || null, code: r.code };
    it.steps = ss.map(function (s) {
      var o = { title: s.title, instruction: s.instruction, expected: s.expected, recovery: s.recovery, kind: s.kind || 'manual', sourceType: s.sourceType, assessmentBasis: s.assessmentBasis, code: s.code, sourceUrl: s.sourceUrl || null, practiceUrl: s.practiceUrl || null };
      var extra = parseJ_(s.extra_json, {}); for (var k in extra) o[k] = extra[k];
      if (s.media_id) {
        var m = media[s.media_id];
        if (!m) issues.push({ level: 'error', id: r.id, msg: s.code + ': 없는 미디어 ' + s.media_id });
        else {
          if (!m.alt) issues.push({ level: 'error', id: r.id, msg: s.code + ': 이미지 대체 텍스트 없음' });
          if (String(m.rights).indexOf('확인 필요') >= 0) issues.push({ level: 'warn', id: r.id, msg: s.code + ': 이미지 권리 확인 필요' });
          usedMedia[m.media_id] = m;
          o.media = { type: m.type, alt: m.alt, caption: s.media_caption || m.caption, mediaId: m.media_id, fileId: m.drive_file_id, display: m.display };
        }
      }
      if (!o.instruction) issues.push({ level: 'error', id: r.id, msg: (s.code || '단계') + ': 지시문 없음' });
      return o;
    });
    if (!it.steps.length) issues.push({ level: 'error', id: r.id, msg: '단계가 없음' });
    if (!it.description) issues.push({ level: 'warn', id: r.id, msg: '설명 없음' });
    it.conditional = bool(r.conditional); it.status = r.status || 'NEW'; it.sourceKind = r.sourceKind || 'workspace-track';
    if (r.courseId) it.courseId = r.courseId;
    it.sourceStatus = r.sourceStatus || 'draft'; it.volumeIds = split(r.volumeIds, /,/); it.simulation = bool(r.simulation); it.scopeNote = r.scopeNote || '';
    var hints = split(r.hints, /\n/); if (hints.length) it.hints = hints;
    if (r.expected) it.expected = r.expected; if (r.recovery) it.recovery = r.recovery;
    var rights = parseJ_(r.rights_json, null), blockers = parseJ_(r.blockers_json, null), res = parseJ_(r.resources_json, null);
    if (rights) it.rights = rights; if (blockers) it.blockers = blockers; if (res && res.length) it.resources = res;
    if (blockers && blockers.length) issues.push({ level: String(st.block_unreviewed_rights).toUpperCase() === 'TRUE' ? 'error' : 'warn', id: r.id, msg: '권리 검토 미완료(blockers ' + blockers.length + '개)' });
    if (it.mode === 'practice' && !it.practiceUrl) issues.push({ level: 'error', id: r.id, msg: '브라우저 실습인데 practiceUrl 없음' });
    return it;
  });
  var codes = {}; items.forEach(function (it) { if (codes[it.code]) issues.push({ level: 'warn', id: it.id, msg: '코드 중복: ' + it.code }); codes[it.code] = 1; });
  var cats = parseJ_(st.categories_json, []);
  items.forEach(function (it) { if (cats.indexOf(it.category) < 0) cats.push(it.category); });
  var engines = {}; items.forEach(function (it) { if (it.engine) engines[it.engine] = 1; });
  var stats = parseJ_(st.stats_extra_json, {});
  stats.items = items.length; stats.practice = items.filter(function (i) { return i.mode === 'practice'; }).length; stats.guide = stats.items - stats.practice; stats.engines = Object.keys(engines).length;
  var catalog = { version: 7, stats: stats, categories: cats.filter(function (c) { return items.some(function (i) { return i.category === c; }); }), difficultyOptions: parseJ_(st.difficultyOptions_json, ['미지정']), policies: parseJ_(st.policies_json, {}), sourceHashes: parseJ_(st.sourceHashes_json, {}), items: items, volumes: parseJ_(st.volumes_json, []), epub: parseJ_(st.epub_json, null) };
  return { catalog: catalog, issues: issues, usedMedia: usedMedia };
}

function validate() {
  need_('reviewer');
  var b = buildCatalog_();
  return { items: b.catalog.items.length, errors: b.issues.filter(function (i) { return i.level === 'error'; }), warnings: b.issues.filter(function (i) { return i.level === 'warn'; }), media: Object.keys(b.usedMedia).length };
}

function publish(note) {
  need_('operator');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var b = buildCatalog_();
    var errors = b.issues.filter(function (i) { return i.level === 'error'; });
    if (errors.length) return { ok: false, errors: errors };
    // 미디어를 공개 폴더로 옮기고 링크 공개
    var pubFolder = DriveApp.getFolderById(CFG.FOLDERS.MEDIA_PUBLIC);
    var md = read_('media'), msh = tab_('media');
    Object.keys(b.usedMedia).forEach(function (id) {
      var m = b.usedMedia[id], f = DriveApp.getFileById(m.drive_file_id);
      if (!m.public_url) {
        f.moveTo(pubFolder);
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        m.public_url = 'https://lh3.googleusercontent.com/d/' + m.drive_file_id;
        var hit = md.rows.filter(function (r) { return r.media_id === id; })[0];
        if (hit) { hit.public_url = m.public_url; msh.getRange(hit._row, 1, 1, md.head.length).setValues([toRow_(md.head, hit)]); }
      }
    });
    b.catalog.items.forEach(function (it) {
      it.steps.forEach(function (s) {
        if (!s.media) return;
        var fid = s.media.fileId, isPreview = s.media.display === 'drive-preview';
        s.media = { type: isPreview ? 'drive-preview' : 'image', alt: s.media.alt, caption: s.media.caption,
          url: isPreview ? 'https://drive.google.com/file/d/' + fid + '/preview' : 'https://lh3.googleusercontent.com/d/' + fid };
      });
    });
    var json = JSON.stringify(b.catalog);
    DriveApp.getFileById(CFG.PUBLISHED_ID).setContent(json);
    var vs = read_('versions'), next = vs.rows.reduce(function (m, r) { return Math.max(m, Number(r.version) || 0); }, 0) + 1;
    var vf = DriveApp.getFolderById(CFG.FOLDERS.VERSIONS).createFile('playground-catalog.v' + next + '.json', json, 'application/json');
    tab_('versions').appendRow([next, vf.getId(), me_(), now_(), b.catalog.items.length, note || '']);
    log_('publish', 'v' + next, b.catalog.items.length + '개');
    return { ok: true, version: next, items: b.catalog.items.length, warnings: b.issues.filter(function (i) { return i.level === 'warn'; }).length };
  } finally { lock.releaseLock(); }
}

function fmt_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : String(v || ''); }
function listVersions() { need_('reviewer'); return read_('versions').rows.reverse().map(function (r) { delete r._row; r.published_at = fmt_(r.published_at); return r; }); }
function rollback(version) {
  need_('operator');
  var v = read_('versions').rows.filter(function (r) { return String(r.version) === String(version); })[0];
  if (!v || !v.file_id) throw new Error('되돌릴 버전 파일이 없습니다.');
  DriveApp.getFileById(CFG.PUBLISHED_ID).setContent(DriveApp.getFileById(v.file_id).getBlob().getDataAsString('UTF-8'));
  log_('rollback', 'v' + version, '');
  return { ok: true };
}

// ---------- 링크·메일·Classroom ----------
function makeLink(o) {
  need_('reviewer');
  var url = CFG.SITE_URL + 'index.html?tutorial=' + encodeURIComponent(o.id);
  var lid = 'l-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss');
  tab_('links').appendRow([lid, o.id, url, o.audience || '', o.channel || 'copy', me_(), now_(), o.note || '']);
  return { url: url, link_id: lid };
}
function sendLinkMail(o) {
  need_('editor');
  var to = String(o.to || '').split(/[,\s;]+/).filter(function (x) { return /@/.test(x); });
  if (!to.length) throw new Error('받는 사람 이메일을 입력하세요.');
  if (to.length > 50) throw new Error('한 번에 50명까지 보낼 수 있습니다.');
  var link = makeLink({ id: o.id, audience: to.length + '명', channel: 'mail', note: o.subject });
  var html = '<p>' + String(o.message || '').replace(/[<>&]/g, '').replace(/\n/g, '<br>') + '</p><p><a href="' + link.url + '">' + String(o.title || '튜토리얼 열기').replace(/[<>&]/g, '') + '</a></p><p style="color:#888;font-size:12px">한 걸음 서재 · 로그인한 학습자만 전체 내용을 볼 수 있습니다.</p>';
  MailApp.sendEmail({ to: me_(), bcc: to.join(','), subject: o.subject || '[한 걸음 서재] 실습 안내', htmlBody: html, name: '한 걸음 서재' });
  log_('mail', o.id, to.length + '명');
  return { ok: true, sent: to.length, remaining: MailApp.getRemainingDailyQuota() };
}
function listCourses() {
  need_('editor');
  var r = Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'], pageSize: 50 });
  return (r.courses || []).map(function (c) { return { id: c.id, name: c.name, section: c.section || '', link: c.alternateLink }; });
}
function postToClassroom(o) {
  need_('editor');
  var link = makeLink({ id: o.id, audience: 'classroom:' + o.courseId, channel: 'classroom', note: o.title });
  var mat = [{ link: { url: link.url } }];
  try {
    Classroom.Courses.CourseWorkMaterials.create({ title: o.title, description: o.text || '', materials: mat, state: 'PUBLISHED' }, o.courseId);
    log_('classroom', o.id, 'material ' + o.courseId);
    return { ok: true, kind: '수업 자료' };
  } catch (e) {
    Classroom.Courses.Announcements.create({ text: (o.title || '') + '\n' + (o.text || ''), materials: mat, state: 'PUBLISHED' }, o.courseId);
    log_('classroom', o.id, 'announcement ' + o.courseId);
    return { ok: true, kind: '공지' };
  }
}
function syncRoster(courseId) {
  need_('operator');
  var emails = [], missing = 0, token;
  do {
    var r = Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken: token });
    (r.students || []).forEach(function (s) { var em = s.profile && s.profile.emailAddress; if (em) emails.push(em.toLowerCase()); else missing++; });
    token = r.nextPageToken;
  } while (token);
  var added = addLearners({ emails: emails.join(','), group: 'classroom', source: 'classroom:' + courseId }).added;
  return { ok: true, found: emails.length, added: added, missingEmail: missing };
}

// ---------- 학습자 명단 ----------
function listLearners() { need_('editor'); return read_('learners').rows.map(function (r) { delete r._row; r.expires = r.expires ? fmt_(r.expires).slice(0, 10) : ''; r.added_at = fmt_(r.added_at); return r; }); }
function addLearners(o) {
  need_('operator');
  var have = {}; read_('learners').rows.forEach(function (r) { have[String(r.email).toLowerCase()] = 1; });
  var list = String(o.emails || '').split(/[,\s;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && !have[x]; });
  var rows = list.map(function (em) { return [em, '', o.group || '', o.source || 'manual', o.expires || '', o.note || '', now_()]; });
  if (rows.length) tab_('learners').getRange(tab_('learners').getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  log_('learners+', '', rows.length + '명');
  return { added: rows.length };
}
function removeLearner(email) {
  need_('operator');
  var d = read_('learners'); var hit = d.rows.filter(function (r) { return String(r.email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (hit) tab_('learners').deleteRow(hit._row);
  log_('learners-', email, '');
  return { ok: !!hit };
}

// ---------- AI 도우미 (Gemini, AI Studio 키) ----------
function setGeminiKey(key) { need_('operator'); PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', String(key).trim()); log_('gemini-key', '', 'set'); return { ok: true }; }
function gemini_(parts, schema) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('AI Studio에서 받은 Gemini API 키를 설정 탭에 먼저 넣어 주세요.');
  var model = settings_().gemini_model || 'gemini-3.8-flash';
  var body = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.4 } };
  if (schema) { body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = schema; }
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body), muteHttpExceptions: true });
  var j = JSON.parse(r.getContentText());
  if (r.getResponseCode() !== 200) throw new Error('Gemini 오류: ' + ((j.error && j.error.message) || r.getResponseCode()));
  return j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
}
function aiDraftSteps(o) {
  need_('editor');
  var schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { instruction: { type: 'STRING' }, expected: { type: 'STRING' }, recovery: { type: 'STRING' }, sourceType: { type: 'STRING', enum: ['read', 'action', 'input', 'click'] } }, required: ['instruction', 'expected', 'recovery', 'sourceType'] } };
  var prompt = '너는 초보자용 한국어 튜토리얼 편집자다. 아래 주제로 실습 단계를 ' + (o.count || 6) + '개 만들어라.\n' +
    '규칙: 한 단계에 행동 하나. 짧은 문장. 버튼·메뉴 이름은 실제 화면 표기를 그대로 쓰고, 확실하지 않으면 "(확인 필요)"를 붙인다. expected는 성공하면 보이는 것, recovery는 다를 때 할 일.\n' +
    '제목: ' + (o.title || '') + '\n사용 도구: ' + (o.tool || '') + '\n목표: ' + (o.goal || '');
  var steps = JSON.parse(gemini_([{ text: prompt }], schema));
  log_('ai-draft', o.title, steps.length + '단계');
  return steps.map(function (s) { s.kind = 'manual'; s.assessmentBasis = 'AI 초안 · 사람 검수 필요'; return s; });
}
function aiAltText(o) {
  need_('editor');
  var t = gemini_([{ inline_data: { mime_type: o.mime, data: o.data } }, { text: '이 튜토리얼 스크린샷의 한국어 대체 텍스트를 1문장(60자 이내)으로 써라. 화면에서 무엇을 보여 주는지만 쓴다.' }]);
  return t.trim();
}

// ---------- 설정 ----------
function getSettings() { need_('reviewer'); return settings_(); }
function setSetting(key, value) {
  need_('operator');
  var d = read_('settings'), sh = tab_('settings');
  var hit = d.rows.filter(function (r) { return r.key === key; })[0];
  if (hit) sh.getRange(hit._row, 2).setValue(value); else sh.appendRow([key, value]);
  log_('setting', key, String(value).slice(0, 100));
  return { ok: true };
}
function recentAccess(n) {
  need_('editor');
  var sh = tab_('access_log'), last = sh.getLastRow(); if (last < 2) return [];
  var k = Math.min(n || 30, last - 1);
  return sh.getRange(last - k + 1, 1, k, 8).getValues().reverse().map(function (r) { return { ts: fmt_(r[0]), email: r[1], trace: r[2], action: r[3], tutorial: r[5], result: r[6], ms: r[7] }; });
}

/** 저장소 content/<track>.json 을 초안으로 가져온다. 예: track=gw-track */
function importFromRepo(track) {
  need_('editor');
  if (!/^[a-z0-9\-]+$/.test(track)) throw new Error('트랙 이름 형식 오류');
  var r = UrlFetchApp.fetch(REPO_RAW + track + '.json', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('저장소에서 파일을 찾지 못했습니다: content/' + track + '.json');
  var items = JSON.parse(r.getContentText());
  if (!Array.isArray(items)) throw new Error('JSON은 튜토리얼 배열이어야 합니다.');
  var res = importItems(items);
  log_('import', track, res.added + '개');
  return res;
}

// 가져오기: 새 실습 트랙 JSON(아이템 배열)을 초안으로 추가
function importItems(items) {
  need_('editor');
  var added = 0;
  items.forEach(function (it) {
    var t = { id: it.id, publish_state: '초안', category: it.category, code: it.code, title: it.title, description: it.description, tags: (it.tags || []).join(', '), difficulty: it.difficulty, difficultyBasis: it.difficultyBasis, minutes: it.minutes, timeBasis: it.timeBasis, mode: it.mode, engine: it.engine || '', practiceUrl: it.practiceUrl || '', sourceUrl: it.sourceUrl || '', scopeNote: it.scopeNote || '', expected: it.expected || '', recovery: it.recovery || '', hints: (it.hints || []).join('\n'), conditional: !!it.conditional, status: it.status || 'NEW', sourceKind: it.sourceKind || '', courseId: it.courseId || '', sourceStatus: it.sourceStatus || '', volumeIds: (it.volumeIds || []).join(', '), simulation: !!it.simulation, rights_json: it.rights ? JSON.stringify(it.rights) : '', blockers_json: it.blockers ? JSON.stringify(it.blockers) : '', resources_json: it.resources ? JSON.stringify(it.resources) : '' };
    saveTutorial({ tutorial: t, steps: it.steps || [] }); added++;
  });
  return { added: added };
}
