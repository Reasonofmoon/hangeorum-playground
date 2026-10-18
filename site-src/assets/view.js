// view.html?path=materials/... : 보호된 자료 한 개를 로그인한 학습자에게 보여 준다.
(() => {
  'use strict';
  const p = new URLSearchParams(location.search).get('path') || '';
  const box = document.getElementById('hg-view');
  const msg = box.querySelector('.hg-gate-msg');
  const title = document.getElementById('hg-view-title');
  title.textContent = decodeURIComponent(p.split('/').pop() || '학습 자료');
  async function run() {
    if (!/^[\w\-./가-힣]+$/.test(p) || p.includes('..')) { msg.textContent = '잘못된 자료 주소입니다.'; return; }
    const auth = window.HG?.getToken();
    let res;
    try { res = await window.HG_API({ action: 'file', path: p, token: auth?.token || '', page: location.pathname }); }
    catch (e) { msg.textContent = '자료 서버에 연결하지 못했습니다. (' + e.message + ')'; return; }
    if (!res.ok) {
      msg.textContent = res.message || '학습자로 로그인하면 볼 수 있습니다.';
      if (!res.user) window.HG.renderLoginButton(box.querySelector('.hg-gate-login'));
      return;
    }
    msg.textContent = '';
    if (res.kind === 'binary') {
      msg.textContent = '이 파일(PDF·EPUB)은 학습자 Drive 자료실에서 받을 수 있습니다.';
      if (res.driveUrl) { const a = document.createElement('a'); a.href = res.driveUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Drive에서 열기 ↗'; box.append(a); }
      return;
    }
    if (/\.html$/.test(p)) {
      const base = new URL(p.replace(/[^/]*$/, ''), location.href.replace(/view\.html.*$/, '')).href;
      const f = document.createElement('iframe');
      f.style.cssText = 'width:100%;min-height:80vh;border:1px solid rgba(0,0,0,.12);border-radius:8px';
      f.title = title.textContent;
      f.srcdoc = res.text.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`).replace(/<script[\s\S]*?<\/script>/gi, '');
      box.append(f);
    } else {
      const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = res.text; box.append(pre);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
