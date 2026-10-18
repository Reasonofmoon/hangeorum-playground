// 한 걸음 서재 관문 스크립트
// 1) Google 로그인(GIS) 토큰을 관리하고
// 2) 공개 API에서 이 페이지에 필요한 데이터·본문을 받아 끼워 넣은 뒤
// 3) 원래 화면 스크립트를 순서대로 실행한다.
(() => {
  'use strict';
  const cfg = window.HG_CONFIG || {};
  const TOKEN_KEY = 'hg:idtoken';
  const meta = n => (document.querySelector(`meta[name="${n}"]`)?.content || '').split(/\s+/).filter(Boolean);
  const root = (document.querySelector('meta[name="gate-root"]')?.content) || '';
  const gateData = meta('gate-data');
  const gateScripts = meta('gate-scripts');
  const gateMain = meta('gate-main')[0] || '';
  const inFrame = window.top !== window.self;

  const decodeJwt = t => { try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { return null; } };
  function getToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY); if (!raw) return null;
      const p = decodeJwt(raw); if (!p || p.exp * 1000 < Date.now() + 30000) { localStorage.removeItem(TOKEN_KEY); return null; }
      return { token: raw, email: p.email, name: p.name, exp: p.exp };
    } catch (_) { return null; }
  }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {} }
  async function logout() { try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} await idb.clear().catch(() => {}); if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect(); location.reload(); }

  // ---- 학습자 브라우저 보관함(IndexedDB): 큰 데이터 파일을 버전(etag)과 함께 둬두고, 바뀜 때만 다시 받는다 ----
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('hg-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('files', mode); const s = t.objectStore('files'); const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
    return {
      get: k => tx('readonly', s => s.get(k)),
      put: (k, v) => tx('readwrite', s => s.put(v, k)),
      clear: () => tx('readwrite', s => s.clear()),
    };
  })();
  async function gunzipB64(b64) {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  // ---- Google 로그인 ----
  let gisReady = null;
  function loadGis() {
    if (gisReady) return gisReady;
    gisReady = new Promise((res, rej) => {
      if (!cfg.CLIENT_ID) return rej(new Error('CLIENT_ID 미설정'));
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => {
        google.accounts.id.initialize({ client_id: cfg.CLIENT_ID, callback: r => { setToken(r.credential); location.reload(); }, auto_select: true, cancel_on_tap_outside: true, use_fedcm_for_prompt: true });
        res();
      };
      s.onerror = () => rej(new Error('Google 로그인 스크립트를 불러오지 못했습니다'));
      document.head.append(s);
    });
    return gisReady;
  }
  function renderLoginButton(el) {
    if (!el) return;
    if (inFrame) { el.innerHTML = '<p class="hg-note">바깥 화면에서 로그인한 뒤 새로고침해 주세요.</p>'; return; }
    loadGis().then(() => google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko', shape: 'pill' }))
      .catch(e => { el.textContent = '로그인 준비 실패: ' + e.message; });
  }
  window.HG = { login: () => loadGis().then(() => google.accounts.id.prompt()), logout, renderLoginButton, getToken };

  // ---- 계정 표시 ----
  function renderAuth(user, level) {
    const box = document.getElementById('hg-auth'); if (!box || inFrame) return;
    box.replaceChildren();
    if (user) {
      const s = document.createElement('span'); s.textContent = (level === 'full' ? '학습자 · ' : '미등록 · ') + user.email; box.append(s);
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '로그아웃'; b.onclick = logout; box.append(b);
    } else {
      const s = document.createElement('span'); s.textContent = '미리보기 중'; box.append(s);
      const slot = document.createElement('div'); box.append(slot); renderLoginButton(slot);
    }
  }
  // ---- 계정별 워터마크 ----
  function watermark(user) {
    if (!user || inFrame) return;
    const text = `${user.email} · ${user.trace} · ${new Date().toLocaleDateString('sv-SE')}`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' transform='rotate(-18 210 110)' font-family='sans-serif' font-size='14' fill='rgba(80,80,80,0.09)'>${text.replace(/[<&]/g, '')}</text></svg>`;
    const d = document.createElement('div'); d.className = 'hg-watermark'; d.setAttribute('aria-hidden', 'true');
    d.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    document.body.append(d);
  }
  // ---- 로그인 안내(잠금) ----
  function lockMain(message, user) {
    const host = document.querySelector('.hg-gate') || document.getElementById('main') || document.body;
    let msg = host.querySelector('.hg-gate-msg'); if (!msg) { msg = document.createElement('p'); msg.className = 'hg-gate-msg'; host.prepend(msg); }
    msg.textContent = message;
    let slot = host.querySelector('.hg-gate-login'); if (!slot) { slot = document.createElement('div'); slot.className = 'hg-gate-login'; host.append(slot); }
    if (!user) renderLoginButton(slot);
    else slot.innerHTML = `<p class="hg-note">${user.email} 계정은 아직 학습자 명단에 없습니다. 운영자에게 등록을 요청해 주세요.</p>`;
  }

  // ---- API 호출 ----
  async function callApi(payload) {
    if (!cfg.API_URL) throw new Error('API 주소 미설정');
    const r = await fetch(cfg.API_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    if (!r.ok) throw new Error('API 응답 ' + r.status);
    return r.json();
  }
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('스크립트 실패: ' + src)); document.body.append(s); });
  window.HG_API = callApi;

  async function boot() {
    const auth = getToken();
    if (!gateData.length && !gateMain) {  // 보호할 것이 없는 페이지
      renderAuth(auth ? { email: auth.email } : null, auth ? 'full' : null);
      for (const s of gateScripts) await loadScript(s);
      return;
    }
    let res;
    const have = {}, stored = {};
    if (auth) {
      for (const p of gateData) { try { const v = await idb.get(p); if (v && v.owner === auth.email) { have[p] = v.etag; stored[p] = v.text; } } catch (_) {} }
    }
    const slow = setTimeout(() => { const m = document.querySelector('.hg-gate-msg'); if (m) m.textContent = '처음 한 번은 자료를 내려받느라 시간이 조금 걸립니다. 다음부터는 빠르게 열립니다…'; }, 4000);
    try {
      res = await callApi({ action: 'bundle', paths: gateData, main: gateMain, token: auth?.token || '', page: location.pathname, have });
    } catch (e) {
      clearTimeout(slow);
      lockMain('본문 서버에 연결하지 못했습니다. 잠시 뒤 새로고침해 주세요. (' + e.message + ')', null);
      return;
    }
    clearTimeout(slow);
    if (res.tokenInvalid) { try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} }
    res.files = res.files || {};
    for (const p of res.cached || []) if (stored[p] != null) res.files[p] = stored[p];
    for (const [p, z] of Object.entries(res.packed || {})) {
      try { res.files[p] = await gunzipB64(z); if (auth && res.etags?.[p]) idb.put(p, { etag: res.etags[p], text: res.files[p], owner: auth.email, at: Date.now() }).catch(() => {}); }
      catch (e) { console.warn('압축 풀기 실패', p, e); }
    }
    const user = res.user || null;
    renderAuth(user, res.level);
    if (res.level === 'full') watermark(user);
    if (gateMain) {
      if (res.main) {
        const host = document.getElementById('main');
        host.innerHTML = res.main;
      } else {
        lockMain(res.message || '이 본문은 학습자로 로그인하면 볼 수 있습니다.', user);
      }
    }
    const missing = gateData.filter(p => !(res.files && p in res.files));
    if (missing.length) {
      if (!gateMain) lockMain(res.message || '이 실습은 학습자로 로그인하면 열립니다.', user);
      return;
    }
    for (const p of gateData) {
      const url = URL.createObjectURL(new Blob([res.files[p]], { type: 'text/javascript' }));
      await loadScript(url);
    }
    for (const s of gateScripts) await loadScript(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
