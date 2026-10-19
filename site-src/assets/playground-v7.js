(() => {
  'use strict';
  const catalog = window.PLAYGROUND_CATALOG;
  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };
  if (!catalog || catalog.version !== 7 || !Array.isArray(catalog.items)) {
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = '목록 데이터를 불러오지 못했습니다. 책과 수업 메뉴에서 원문을 볼 수 있습니다.';
    return;
  }
  const items = catalog.items;
  const byId = new Map(items.map(item => [item.id, item]));
  const key = 'tutorial-platform-v7:playground';
  const kindLabels = {manual:'직접 확인 · 자동 판정 없음',automatic:'실행기의 조건 확인',practice:'가상 공간에서 조작'};
  const categoryStyles = {'파일 관리':['file','▤'],'문서 작성':['document','¶'],'웹 제작':['web','</>'],'출판 준비':['publishing','▥'],'AI 도구':['ai','✳'],'디자인':['design','◒'],'구글 워크스페이스':['gws','G']};
  const total = item => item.stepCount || item.steps.length;
  // **굵게**, `코드` 만 안전하게 표시 (HTML은 쓰지 않음)
  function rich(el, text) {
    el.replaceChildren();
    const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const part of parts) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) el.append(node('strong','',part.slice(2,-2)));
      else if (/^`[^`]+`$/.test(part)) el.append(node('code','',part.slice(1,-1)));
      else el.append(document.createTextNode(part));
    }
  }
  function mediaNode(m) {
    if (!m || !m.url) return null;
    const fig = node('figure','step-media');
    let el;
    if (m.type === 'drive-preview') { el = node('iframe'); el.src = m.url; el.title = m.alt || '미리보기'; el.loading = 'lazy'; el.referrerPolicy = 'strict-origin-when-cross-origin'; }
    else { el = node('img'); el.src = m.url; el.alt = m.alt || ''; el.loading = 'lazy'; el.decoding = 'async'; el.draggable = false; el.addEventListener('contextmenu', e => e.preventDefault()); }
    fig.append(el); if (m.caption) fig.append(node('figcaption','',m.caption)); return fig;
  }
  let state = {version:7,last:null,entries:{}};
  let current = null;
  let frame = null;
  let timer = null;
  let lastRunnerState = '';
  let lastListURL = '';
  let observedRunnerURL = '';
  let mobileTab = 'guide';
  const filterNames = ['q','category','mode','difficulty','time'];
  const boundedIndex = (n, max) => Number.isInteger(n) && n >= 0 ? Math.min(n, Math.max(0,max-1)) : 0;
  const warning = text => { $('storage-warning').hidden = false; $('storage-warning').textContent = text; };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && raw.version === 7 && raw.entries && typeof raw.entries === 'object') {
      if (byId.has(raw.last)) state.last = raw.last;
      for (const item of items) {
        const entry = raw.entries[item.id];
        if (!entry || typeof entry !== 'object') continue;
        state.entries[item.id] = {step:boundedIndex(entry.step,item.steps.length),read:[],visited:true};
        if (Array.isArray(entry.read)) state.entries[item.id].read = [...new Set(entry.read.filter(n => Number.isInteger(n) && n >= 0 && n < item.steps.length))];
      }
    }
  } catch (_) { warning('이 브라우저의 v7 기록을 읽을 수 없어 새 상태로 시작했습니다. 현재 화면에서 연습할 수 있습니다.'); }
  function save() {
    try { localStorage.setItem(key,JSON.stringify(state)); }
    catch (_) { warning('진도를 브라우저에 저장하지 못했습니다. 현재 화면에서 연습은 가능하지만 새로고침하면 복원되지 않을 수 있습니다.'); }
    updateResume();
  }
  function updateResume() {
    const entry = byId.get(state.last);
    $('header-resume').href = entry ? urlFor(entry.id) : '#catalog';
    $('header-resume').textContent = entry ? '이어서 해보기 ↗' : '실습 둘러보기 ↗';
  }
  function currentParams() { return new URL(location.href).searchParams; }
  function urlFor(id, params = currentParams()) {
    const url = new URL('index.html',location.href);
    for (const name of filterNames) if (params.get(name)) url.searchParams.set(name,params.get(name));
    if (id) url.searchParams.set('tutorial',id);
    return url.pathname + url.search + (id ? '' : '#catalog');
  }
  function safeLocal(value) {
    if (typeof value !== 'string') return null;
    const url = new URL(value,location.href);
    if (url.origin !== location.origin || !/^(?:apps|lessons|supplements)\//.test(value) || value.includes('..')) return null;
    return url.href;
  }
  function navigate(url, focus = true) {
    history.pushState({},'',url);
    renderRoute();
    if (focus) { $('main').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
  }
  function applyFilters() {
    const params = new URLSearchParams();
    const q = $('query').value.trim().slice(0,200);
    if(q) params.set('q',q);
    const currentCategory = currentParams().get('category');
    if(currentCategory) params.set('category',currentCategory);
    for(const [id,name] of [['mode-filter','mode'],['difficulty-filter','difficulty'],['time-filter','time']]) if($(id).value) params.set(name,$(id).value);
    history.pushState({},'',urlFor(null,params));
    renderRoute();
  }
  function clearFilters() { history.pushState({},'',urlFor(null,new URLSearchParams())); renderRoute(); }
  function badge(text,cls) { return node('span','badge '+cls,text); }
  function timeLabel(item) { return item.minutes === null ? '시간 미산정' : '약 '+item.minutes+'분 · 추정'; }
  function renderCategories(category) {
    $('categories').replaceChildren();
    for(const name of ['',...catalog.categories]) {
      const count = name ? items.filter(item=>item.category === name).length : items.length;
      const b = node('button','category-button'); b.type='button'; b.dataset.category=name; b.setAttribute('aria-pressed',String(name === category));
      const icon=node('span','category-icon',name ? (categoryStyles[name]?.[1] || '◒') : '▦'); icon.setAttribute('aria-hidden','true');
      b.append(icon,node('span','',name || '전체 튜토리얼'),node('span','category-count',count));
      b.addEventListener('click',()=>{const params=currentParams();params.delete('tutorial');if(name)params.set('category',name);else params.delete('category');history.pushState({},'',urlFor(null,params));renderRoute();});
      $('categories').append(b);
    }
    requestAnimationFrame(()=>{const bar=$('categories'),active=bar.querySelector('[aria-pressed="true"]');if(active && bar.scrollWidth>bar.clientWidth){const a=active.getBoundingClientRect(),r=bar.getBoundingClientRect();if(a.left<r.left || a.right>r.right)bar.scrollLeft+=a.left-r.left-8;}});
  }
  function renderCard(item) {
    const card=node('article','tutorial-card'); card.dataset.tutorial=item.id;
    const style=categoryStyles[item.category] || ['art','◒'];
    const visual=node('div','card-visual cat-'+style[0]); visual.setAttribute('aria-hidden','true');visual.append(node('span','card-symbol',style[1]),node('span','card-code',item.code));
    const body=node('div','card-body'); const badges=node('div','badges'); badges.append(badge(item.mode === 'practice'?'브라우저 실습':'외부 도구 가이드',item.mode));if(item.conditional)badges.append(badge('조건부 검수','conditional'));
    const h=node('h4');const a=node('a','',item.title); a.href=urlFor(item.id);a.dataset.openTutorial=item.id;h.append(a);
    const foot=node('div','card-footer'); const meta=node('span','',item.difficulty+' · '+timeLabel(item));meta.title=item.difficultyBasis+' '+item.timeBasis;
    const enter=node('a','',state.entries[item.id]?'이어서 →':'살펴보기 →');enter.href=urlFor(item.id);enter.dataset.openTutorial=item.id;enter.setAttribute('aria-label',item.title+' '+(state.entries[item.id]?'이어서 보기':'살펴보기'));
    foot.append(meta,enter);body.append(badges,h,node('p','',item.description),foot);
    if(state.entries[item.id])body.append(node('p','card-resume','단계 '+(state.entries[item.id].step+1)+' / '+total(item)+'에서 이어가기'));
    card.append(visual,body); return card;
  }
  function renderList() {
    current = null;
    clearInterval(timer);timer=null;frame=null;$('runner-host').replaceChildren();
    $('browse-view').hidden=false;$('detail-view').hidden=true;document.title='튜토리얼 플레이그라운드 · 한 걸음 서재';
    const params=currentParams();const q=(params.get('q') || '').slice(0,200); const category=catalog.categories.includes(params.get('category'))?params.get('category'):'';
    $('query').value=q;for(const [id,name] of [['mode-filter','mode'],['difficulty-filter','difficulty'],['time-filter','time']])$(id).value=params.get(name)||'';
    const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim();
    const terms=normalize(q).split(' ').filter(Boolean);
    const result=items.filter(item=>{
      if(category && item.category !== category)return false;
      if($('mode-filter').value && item.mode !== $('mode-filter').value)return false;
      if($('difficulty-filter').value && item.difficulty !== $('difficulty-filter').value)return false;
      const time=$('time-filter').value;
      if(time === 'unknown' && item.minutes !== null)return false;
      if(time === 'short' && (item.minutes === null || item.minutes>5))return false;
      if(time === 'medium' && (item.minutes === null || item.minutes<6 || item.minutes>10))return false;
      if(time === 'long' && (item.minutes === null || item.minutes<11))return false;
      const searchable=normalize([item.title,item.description,item.code,...item.tags].join(' '));return terms.every(term=>searchable.includes(term));
    });
    renderCategories(category);$('cards').replaceChildren(...result.map(renderCard));$('empty-state').hidden=result.length>0;
    $('results-title').textContent=category || '모든 튜토리얼';$('result-count').textContent=result.length+'개 / 전체 '+items.length+'개';
    lastListURL=urlFor(null,params);updateResume();
  }
  function displayRunnerStatus(result) {
    if(!current || !result || !['pending','passed','manual'].includes(result.status))return;
    const message=String(result.message||'현재 입력을 실행기에서 다시 확인하세요.').slice(0,1600);
    const signature=result.status+'|'+message;
    if(signature===lastRunnerState)return;
    lastRunnerState=signature;
    $('runner-feedback').dataset.status=result.status;
    const prefix={pending:'확인 전 또는 수정 필요',passed:'현재 실행기의 조건 확인',manual:'직접 대조가 필요한 항목'}[result.status];
    $('runner-feedback').textContent=prefix+' · '+message;
    $('detail-status').textContent='안내 '+(state.entries[current.id].step+1)+' / '+current.steps.length+'\n'+prefix;
  }
  function runnerAPI() { try{return frame?.contentWindow?.PlaygroundRunner || null;}catch(_){return null;} }
  function setRunnerButtons(disabled) { for(const id of ['load-example','check-result','retry-runner','reset-runner'])$(id).disabled=disabled; }
  function pollRunner() {
    const api=runnerAPI();if(!api)return;
    // The trusted runner also has its own mission controls. Keep the surrounding
    // instructions and resumable URL aligned when those controls change route.
    try {
      const locationURL=frame.contentWindow.location.href;
      if(locationURL!==observedRunnerURL){
        observedRunnerURL=locationURL;
        const actual=new URL(locationURL);
        let found=null;
        for(const item of items.filter(i=>i.engine===current.engine)){
          const index=item.steps.findIndex((s,i)=>{if(!s.practiceUrl)return false;const u=new URL(s.practiceUrl,location.href);return u.pathname===actual.pathname && (u.hash===actual.hash || (i===0 && u.hash.replace(/\/a\d+$/,'')===actual.hash));});
          if(index>=0){found={item,index};break;}
        }
        if(found){
          const id=found.item.id;
          if(!state.entries[id])state.entries[id]={step:found.index,read:[],visited:true};
          const changed=state.entries[id].step!==found.index;
          state.entries[id].step=found.index;
          if(id!==current.id){history.pushState({},'',urlFor(id));renderDetail(found.item);return;}
          if(changed){save();renderStep(false);}
        }
      }
    } catch (_) {}
    setRunnerButtons(false);
    try{displayRunnerStatus(api.getState());}catch(_){$('runner-feedback').textContent='현재 상태를 읽지 못했습니다. 실습 안의 결과 확인을 사용하세요.';}
  }
  function updateStepRoute(step) {
    if(!frame || !current || !step.practiceUrl)return;
    const target=safeLocal(step.practiceUrl);if(!target)return;
    try{const next=new URL(target);const actual=new URL(frame.contentWindow.location.href);if(actual.pathname===next.pathname && actual.hash!==next.hash)frame.contentWindow.location.hash=next.hash;}catch(_){}
  }
  function renderStep(syncRoute=true) {
    if(!current)return;
    const entry=state.entries[current.id];entry.step=boundedIndex(entry.step,current.steps.length);const step=current.steps[entry.step];
    $('step-list').replaceChildren();current.steps.forEach((s,i)=>{const li=node('li');const b=node('button',entry.read.includes(i)?'was-read':'',i+1);b.type='button';b.setAttribute('aria-label','단계 '+(i+1)+': '+s.title);if(i===entry.step)b.setAttribute('aria-current','step');b.addEventListener('click',()=>{entry.step=i;save();renderStep();});li.append(b);$('step-list').append(li);});
    $('step-counter').textContent='단계 '+(entry.step+1)+' / '+total(current)+' · 읽음 '+entry.read.length;
    $('step-kind').textContent=kindLabels[step.kind]||kindLabels.manual;$('step-title').textContent=step.title;rich($('step-instruction'),step.instruction);
    rich($('step-expected'),step.expected || '');$('expected-block').hidden=!step.expected;
    {let box=$('hg-step-extra');if(!box){box=node('div','hg-step-extra');box.id='hg-step-extra';$('step-instruction').after(box);}box.replaceChildren();const mn=mediaNode(step.media);if(mn)box.append(mn);
      if(current.locked && entry.step===current.steps.length-1){const lock=node('div','hg-lock');lock.append(node('strong','','여기까지 미리보기입니다 ('+current.steps.length+' / '+total(current)+'단계)'),node('p','','나머지 단계와 원문, 실습 화면은 학습자로 로그인하면 열립니다.'));const slot=node('div');lock.append(slot);box.append(lock);if(window.HG)window.HG.renderLoginButton(slot);}}
    rich($('step-recovery'),step.recovery || '원문 수업에서 전체 설명과 예시를 확인해 보세요. 읽음 표시는 결과 통과를 뜻하지 않습니다.');$('recovery-details').open=false;
    let source=$('step-source');if(!source){source=node('a','step-source');source.id='step-source';$('active-step').append(source);}source.href=safeLocal(step.sourceUrl || current.sourceUrl)||'library.html';source.textContent=step.excerpted?'이 단계의 전체 원문 보기 ↗':'이 단계의 원문 보기 ↗';
    $('step-prev').disabled=entry.step===0;$('step-next').textContent=entry.step===current.steps.length-1?'이 단계 읽음 표시':'읽고 다음 →';
    $('detail-status').textContent='안내 '+(entry.step+1)+' / '+total(current)+(current.locked?' (미리보기)':'')+'\n읽음 기록 '+entry.read.length+'개';
    if(syncRoute)updateStepRoute(step);
    lastRunnerState='';if(current.mode==='practice')pollRunner();
  }
  function setTab(tab,focus=false) {
    mobileTab=tab;$('workspace').dataset.mobileTab=tab;
    for(const t of ['guide','practice']){$('tab-'+t).setAttribute('aria-selected',String(t===tab));$('tab-'+t).tabIndex=t===tab?0:-1;}
    if(focus)$('tab-'+tab).focus();
  }
  function renderDetail(item) {
    const same=current?.id===item.id && frame;
    current=item;state.last=item.id;
    if(!state.entries[item.id])state.entries[item.id]={step:0,read:[],visited:true};save();
    $('browse-view').hidden=true;$('detail-view').hidden=false;document.title=item.title+' · 플레이그라운드';
    $('detail-category').textContent=item.category;$('detail-title').textContent=item.title;$('detail-description').textContent=item.description;
    $('detail-meta').textContent=item.difficulty+' · '+timeLabel(item)+' · '+total(item)+'개 안내 단계'+(item.locked?' · 미리보기 '+item.steps.length+'단계':'');
    {let rb=$('hg-resources');if(!rb){rb=node('div','hg-resources');rb.id='hg-resources';$('detail-boundary').after(rb);}rb.replaceChildren();const rs=Array.isArray(item.resources)?item.resources.filter(r=>r&&r.url&&/^https:\/\//.test(r.url)):[];
      if(rs.length){rb.append(node('h3','','참고 자료'));const ul=node('ul');for(const r of rs){const li=node('li');const a=node('a','',r.title||r.url);a.href=r.url;a.target='_blank';a.rel='noopener';li.append(a);ul.append(li);}rb.append(ul);}rb.hidden=!rs.length;}$('detail-meta').title=item.difficultyBasis+' '+item.timeBasis;
    $('detail-badges').replaceChildren(badge(item.mode==='practice'?'브라우저 실습 · 교육용 모형':'외부 도구 가이드',item.mode));if(item.conditional)$('detail-badges').append(badge('조건부 검수 · 재배포 권리 확인 필요','conditional'));
    $('source-link').href=safeLocal(item.sourceUrl)||'library.html';$('guide-source').href=$('source-link').href;
    $('detail-boundary').textContent=item.mode==='practice' ? item.scopeNote+' v7에서는 현재 입력과 위치를 이 브라우저에 저장합니다. 원문(v6)의 저장 안내와 다를 수 있습니다. 실제 파일·서비스 작업이나 전체 숙련 판정은 아닙니다.' : '외부 도구에서 따라 하는 원문 가이드입니다. 이 화면에서는 해당 프로그램을 실행하거나 작업 성공을 판정하지 않습니다.';
    $('guide-only').hidden=item.mode==='practice';$('runner-toolbar').hidden=item.mode!=='practice';$('runner-host').hidden=item.mode!=='practice';$('runner-feedback').hidden=item.mode!=='practice';
    $('practice-title').textContent=item.mode==='practice'?'직접 해보기':'외부 도구에서 따라 하기';$('practice-eyebrow').textContent=item.mode==='practice'?'PRACTICE':'EXTERNAL GUIDE';
    renderStep(false);setTab(mobileTab);
    if(!same){clearInterval(timer);timer=null;frame=null;$('runner-host').replaceChildren();lastRunnerState='';observedRunnerURL='';}
    if(item.mode==='practice' && !same){
      setRunnerButtons(true);$('runner-feedback').dataset.status='pending';$('runner-feedback').textContent='실습 화면을 불러오는 중입니다.';
      frame=node('iframe');frame.id='practice-frame';frame.title=item.title+' 교육용 실습';frame.referrerPolicy='no-referrer';
      // This outer frame runs only trusted shipped app code. User HTML is handled
      // exclusively by web/engine.js and its inner opaque sandbox="" preview.
      const entry=state.entries[item.id];const url=safeLocal(item.steps[entry.step]?.practiceUrl || item.practiceUrl);
      if(url){frame.src=url;frame.addEventListener('load',()=>{pollRunner();});$('runner-host').append(frame);timer=setInterval(pollRunner,700);}
      else{$('runner-feedback').textContent='실습 주소를 확인하지 못했습니다. 원문 수업을 열어 주세요.';}
    }
  }
  function renderRoute() {
    const id=currentParams().get('tutorial');
    if(id && byId.has(id))renderDetail(byId.get(id));
    else{renderList();if(id){$('announcement').textContent='없는 튜토리얼 주소입니다. 전체 목록을 표시합니다.';warning('요청한 튜토리얼을 찾을 수 없어 목록을 표시합니다. 검색으로 다시 찾아 주세요.');}}
  }
  async function action(name) {
    const api=runnerAPI();if(!api || typeof api[name]!=='function')return;
    const captured=current?.id;
    try{await api[name]();if(current?.id===captured){lastRunnerState='';pollRunner();}}
    catch(_){$('runner-feedback').dataset.status='pending';$('runner-feedback').textContent='동작을 마치지 못했습니다. 입력을 확인하거나 실습 안의 버튼으로 다시 시도하세요.';}
  }
  for(const value of catalog.difficultyOptions || [...new Set(items.map(i=>i.difficulty))]){const option=node('option','',typeof value==='string'?value:value.label);option.value=typeof value==='string'?value:value.value;$('difficulty-filter').append(option);}
  $('stat-total').textContent=catalog.stats.items;$('stat-practice').textContent=catalog.stats.practice;
  $('search-form').addEventListener('submit',event=>{event.preventDefault();applyFilters();});
  $('query').addEventListener('search',()=>{if(!$('query').value)applyFilters();});
  for(const id of ['mode-filter','difficulty-filter','time-filter'])$(id).addEventListener('change',applyFilters);
  $('clear-filters').addEventListener('click',clearFilters);$('empty-reset').addEventListener('click',clearFilters);
  document.addEventListener('click',event=>{const link=event.target.closest('a[data-open-tutorial],#header-resume');if(!link || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !link.href.includes('tutorial='))return;event.preventDefault();navigate(link.href);});
  $('back-to-list').addEventListener('click',()=>{navigate(lastListURL||urlFor(null),false);$('catalog').scrollIntoView();$('query').focus({preventScroll:true});});
  $('step-prev').addEventListener('click',()=>{if(current){state.entries[current.id].step--;save();renderStep();}});
  $('step-next').addEventListener('click',()=>{if(!current)return;const e=state.entries[current.id];if(!e.read.includes(e.step))e.read.push(e.step);e.step=Math.min(e.step+1,current.steps.length-1);save();renderStep();$('announcement').textContent='읽음 기록을 저장했습니다. 실습 결과 판정과는 별개입니다.';});
  $('load-example').addEventListener('click',()=>action('loadExample'));$('check-result').addEventListener('click',()=>action('check'));
  $('retry-runner').addEventListener('click',()=>action('reset'));
  $('reset-runner').addEventListener('click',()=>{if(confirm('현재 실행기의 입력과 시도를 초기화할까요? 이미 본 도움 기록은 남을 수 있습니다. 다른 실행기의 입력은 지우지 않습니다.'))action('reset');});
  for(const tab of ['guide','practice']){$('tab-'+tab).addEventListener('click',()=>setTab(tab));$('tab-'+tab).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setTab(event.key==='Home'?'guide':event.key==='End'?'practice':tab==='guide'?'practice':'guide',true);}});}
  $('reset-all').addEventListener('click',()=>{
    if(!confirm('이 사이트의 v7 실습 입력·진도·도움 기록을 모두 삭제할까요? 기존 v4/v6 기록과 다른 사이트의 기록은 유지합니다.'))return;
    clearInterval(timer);timer=null;$('runner-host').replaceChildren();frame=null;current=null;
    try{const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k && k.startsWith('tutorial-platform-v7:'))keys.push(k);}keys.forEach(k=>localStorage.removeItem(k));}
    catch(_){warning('브라우저가 저장소 삭제를 허용하지 않았습니다. 브라우저 사이트 데이터 설정에서 직접 확인해 주세요.');return;}
    state={version:7,last:null,entries:{}};history.replaceState({},'',urlFor(null,new URLSearchParams()));renderRoute();$('announcement').textContent='이 사이트의 v7 기록을 삭제했습니다.';
  });
  window.addEventListener('popstate',()=>{renderRoute();$('main').focus({preventScroll:true});});
  window.addEventListener('pagehide',()=>clearInterval(timer));
  window.addEventListener('pageshow',event=>{if(event.persisted){renderRoute();if(current?.mode==='practice'){clearInterval(timer);timer=setInterval(pollRunner,700);}}});
  renderRoute();
})();
