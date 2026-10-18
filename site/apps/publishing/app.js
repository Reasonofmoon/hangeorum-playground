(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const lesson = window.PUBLISHING_LESSON, build = window.PUBLISHING_BUILD;
  if (!lesson || !build || !window.PublishingEngine) {
    $('dataset-notice').textContent = '실습 파일을 읽지 못했습니다. lesson.js와 engine.js가 같은 폴더에 있는지 확인하세요.';
    return;
  }
  const engine = PublishingEngine.createModel(lesson), clone = PublishingEngine.clone;
  let state = engine.initialState(), route, history = [], feedback = null, inputGroup = null;
  const storageKey = 'tutorial-platform-v7:practice:publishing';
  let storedSession=null, restoreError='';
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function button(text, id, fn, cls) {const node = el('button', text, cls); node.type = 'button'; if (id) node.id = id; node.addEventListener('click', fn); return node;}
  function paragraph(parent, text, cls) {parent.append(el('p', text, cls));}
  function remember() {
    try {const serialized=JSON.stringify({version:7,sourceSha256:build.sourceSha256,state,route:location.hash,history:history.slice(-10),conceptAnswers,conceptResults});if(serialized.length>5000000)throw Error('저장 용량');localStorage.setItem(storageKey,serialized);$('storage-notice').textContent='입력·자동 조건·자기 확인·힌트·위치를 이 브라우저의 localStorage(v7 출판 준비)에 저장합니다. 되돌리기는 최근 10개 작업, 독립 제출은 최근 100회까지 복원합니다. 초기화는 이 실습의 기록만 지웁니다.'+(restoreError?' '+restoreError:'');}
    catch (_) {$('storage-notice').textContent = '이 브라우저에서는 입력 저장을 사용할 수 없습니다. 현재 탭에서는 계속 실습할 수 있으나 새로고침하면 입력이 사라질 수 있습니다.';}
  }
  let savedRoute = '';
  try {
    const raw = localStorage.getItem(storageKey);
    if(raw&&raw.length>5000000)throw Error('저장 용량');
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.version===7 && saved.sourceSha256 === build.sourceSha256) {
      const clean=engine.restoreState(saved.state);
      if(!Array.isArray(saved.history)||saved.history.length>10)throw Error('되돌리기 기록');
      const restoredHistory=saved.history.map(engine.restoreState);
      state=clean;history=restoredHistory;storedSession=saved;
      if (typeof saved.route === 'string' && engine.parseRoute(saved.route).valid) savedRoute = saved.route;
    }
  } catch (_) {state=engine.initialState();history=[];restoreError='저장 형식이 맞지 않아 시작 화면으로 복구했습니다.';}
  if (!location.hash && savedRoute) historyReplace(savedRoute);
  function historyReplace(hash) {window.history.replaceState(null, '', hash);}
  function current() {const step = lesson.steps[route.step]; return {step, action: step.microActions[route.action]};}
  function pushUndo() {history.push(clone(state)); if (history.length > 80) history.shift(); $('undo-button').disabled = false;}
  function change(fn, rerender = true) {pushUndo(); fn(); feedback = null; inputGroup = null; if (rerender) render();}
  function go(i, j = 0) {location.hash = lesson.steps[i].microActions[j].deepLink;}
  function setFeedback(kind, text) {feedback = {kind, text}; showFeedback();}
  function showFeedback() {const box = $('feedback'); box.className = 'feedback' + (feedback ? ' ' + feedback.kind : ''); box.textContent = feedback ? feedback.text : '';}
  function renderNav() {
    const nav = $('mission-nav'); nav.replaceChildren();
    let auto = 0, self = 0;
    for (const step of lesson.steps) {
      const all = step.microActions.every(a => engine.completed(state, a.code));
      const link = el('a', null, 'mission-link' + (all ? ' done' : ''));
      link.href = step.microActions[0].deepLink;
      if (step === current().step) link.setAttribute('aria-current', 'step');
      link.append(el('span', step.code, 'code'), el('span', step.title)); nav.append(link);
      for (const action of step.microActions) if (engine.completed(state, action.code)) {
        if (engine.rules[action.code].kind === 'auto') auto++; else self++;
      }
    }
    $('progress').textContent = `v7 실습 기록: 자동 조건 ${auto} · 자기 확인 ${self} / ${lesson.microActionCount}행동`;
    $('mission-select').value = String(route.step);
  }
  function renderGuide() {
    const {step, action} = current(), parent = $('guide-content'); parent.replaceChildren();
    const independent = step.microActionsVisibility === 'hint-only';
    $('guide-title').textContent = independent ? '새 조건만 읽고 직접 해보기' : '한 행동씩 따라가기';
    if (independent) {
      paragraph(parent, step.independentTask.prompt, 'independent-prompt');
      paragraph(parent, step.independentTask.initialState, 'small');
      paragraph(parent, '답안을 제출한 뒤 정답과 비교합니다. 현재 과제 힌트 미사용 표시는 이 앱의 KP17 힌트만 집계합니다. 이전 수업·서재·원문에서 본 도움은 포함하지 않으므로 독립 수행 증거는 아닙니다.', 'small');
    }
    if (!independent || state.hints[step.id]) {
      const list = el('ol', null, 'action-list');
      step.microActions.forEach((a, j) => {
        const item = el('li', null, 'action-item' + (j === route.action ? ' active' : ''));
        const link = el('a', a.code, 'action-link'); link.href = a.deepLink;
        if (j === route.action) link.setAttribute('aria-current', 'step');
        item.append(link, el('p', a.action));
        item.append(el('div', engine.completed(state, a.code) ? (engine.rules[a.code].kind === 'self' ? '자기 확인 기록됨' : '자동 조건 확인됨') : '아직 확인 전', 'action-state'));
        list.append(item);
      }); parent.append(list);
    }
    if (!independent) {
      paragraph(parent, '정상 결과: ' + action.expected, 'normal-result');
      const recovery = el('details', null, 'recovery'); recovery.append(el('summary', '막혔을 때 돌아오는 방법'), el('p', action.recovery)); parent.append(recovery);
    }
    $('hint-state').textContent = state.hints[step.id] ? '힌트·해설 열람 이력 있음' : '힌트 미사용';
    $('hint-button').textContent = independent && !state.hints[step.id] ? '행동 안내 열기 (힌트로 기록)' : '힌트 더 보기';
    const hints = $('hint-content'); hints.replaceChildren();
    step.hints.slice(0, Math.min(state.hints[step.id] || 0, step.hints.length)).forEach(text => paragraph(hints, text, 'hint'));
    $('hint-button').disabled = (state.hints[step.id] || 0) >= step.hints.length;
  }
  function sourceCard(title, lines) {const card = el('div', null, 'source-card'); card.append(el('h4', title)); lines.forEach(line => paragraph(card, line)); return card;}
  function renderScenario() {
    const parent = $('scenario'), {step} = current(), code = step.code, g = lesson.scenarios.guided;
    parent.replaceChildren();
    if (['KP02','KP03','KP04','KP05','KP06'].includes(code)) {
      const card = sourceCard('가상 표지 · 제목면 · 내용 카드', [g.title, g.subtitle, g.author + ' · ' + g.language, g.content.join(' / ')]);
      card.children[1].className = 'book-title'; parent.append(card);
      if (code === 'KP02') paragraph(parent, '이 판의 공식자료 확인일: ' + lesson.verification.checkedAt, 'small');
    } else if (code === 'KP01') parent.append(sourceCard('이번 연습의 범위', ['독립 교육용 모형 · KDP 실제 화면 아님', '계정 생성·세금·은행·제출·결제는 제외합니다.']));
    else if (code === 'KP07') parent.append(sourceCard('오류 문장이 섞인 모형 카드', ['원래 내용 설명 두 문장을 남기고 아래 편집 칸에서 수정하세요.']));
    else if (code === 'KP08' || code === 'KP09') parent.append(sourceCard('제공된 자료 경위', g.assets.map(a => a.name + ' / ' + a.provenance)));
    else if (code === 'KP10') parent.append(sourceCard('사례 A · 사례 B', ['A: 사람이 쓴 본문을 AI로 오탈자 교정했습니다.', 'B: AI가 만든 초안을 사람이 크게 고쳤습니다.']));
    else if (code === 'KP11') parent.append(sourceCard('내부 그림 경위', ['AI가 화분 그림을 생성했습니다.', '그림 권리 확인은 제작 경위 기록과 별도입니다.']));
    else if (code === 'KP12') parent.append(sourceCard('가상 파일 목록', ['balcony_v01.epub', 'balcony_v02.epub', '실제 EPUB 파일은 열지 않습니다.']));
    else if (code === 'KP13') parent.append(sourceCard('목차 이동 모형 · balcony_v01.epub', ['아래 항목을 누르고 도착 제목을 비교하세요.']));
    else if (code === 'KP14') parent.append(sourceCard('글자 크기 관찰', ['교육용 문장의 줄 흐름을 바꿔 봅니다. 실제 Kindle 렌더링 결과가 아닙니다.']));
    else if (code === 'KP15') parent.append(sourceCard('그림 1 · 텍스트 관찰 카드', ['원본 이미지가 제공되지 않아 원고에 있는 오류 관찰 문장으로 연습합니다. 실제 기기 캡처가 아닙니다.']));
    else if (code === 'KP16') parent.append(sourceCard('수정본 검토 모형', ['가상 수정본을 선택하고 목차를 다시 누르세요. 다른 항목의 검토는 별도로 남습니다.']));
    else if (code === 'KP18') parent.append(sourceCard('학습과 실제 출판을 구분하는 기록', ['이번 작업은 준비 기록과 모형 검토입니다.', '실제 계정·파일 업로드·제출·결제: 미실행.']));
  }
  function renderField(key, parent) {
    const def = engine.fields[key], label = el('label', null, 'field'); label.htmlFor = 'field-' + key;
    label.append(el('span', def.label, 'field-label'));
    const input = el(def.type === 'textarea' ? 'textarea' : def.type === 'select' ? 'select' : 'input');
    input.id = 'field-' + key; input.name = key; input.autocomplete = 'off';
    if (def.type === 'text') input.type = 'text';
    if (def.type !== 'select') {input.maxLength = 5000; input.spellcheck = false;}
    if (def.type === 'select') {
      const blank = el('option', '선택하세요'); blank.value = ''; input.append(blank);
      def.options.forEach(v => {const o = el('option', v); o.value = v; input.append(o);});
    }
    input.value = state.values[key];
    if (def.type === 'select') input.addEventListener('change', () => change(() => engine.setValue(state, key, input.value)));
    else {
      input.addEventListener('focus', () => {inputGroup = null;});
      input.addEventListener('input', () => {
        if (inputGroup !== key) {pushUndo(); inputGroup = key;}
        engine.setValue(state, key, input.value); feedback = null; showFeedback();
        renderGuide(); renderVerify(); if (current().step.code === 'KP17') renderTransfer();
      });
      input.addEventListener('blur', () => {inputGroup = null; renderNav();});
    }
    label.append(input); parent.append(label);
    if (key === 'transferSubtitle') paragraph(parent, '제공된 조건에 부제가 없으면 이 칸을 비워 두세요.', 'small');
  }
  function renderToc(parent, fixed) {
    const row = el('div', null, 'toc'); row.setAttribute('aria-label', fixed ? '수정본 목차' : '오류 시나리오 목차');
    lesson.scenarios.guided.content.forEach((name, i) => {
      const b = button(name, (fixed ? 'fixed-toc-' : 'toc-') + i, () => change(() => engine.visitToc(state, name, fixed)), 'secondary');
      if (fixed && !state.values.fixedVersion) b.disabled = true;
      row.append(b);
    }); parent.append(row);
    const arrival = el('div', null, 'arrival'); arrival.id = fixed ? 'fixed-arrival' : 'toc-arrival'; arrival.setAttribute('aria-live', 'polite');
    arrival.append(el('strong', '도착 카드'), el('p', (fixed ? state.fixedArrival : state.tocArrival) || '목차를 누르면 도착 제목이 여기에 표시됩니다.')); parent.append(arrival);
  }
  function renderWorkspace() {
    const {step} = current(), parent = $('workspace-fields'); parent.replaceChildren();
    $('workspace-location').textContent = step.location.text;
    renderScenario();
    for (const key of engine.controls[step.code]) {
      if (key === 'tocIssue') renderToc(parent, false);
      renderField(key, parent);
      if (key === 'fixedVersion') renderToc(parent, true);
      if (key === 'fontSize') {
        const card = el('p', lesson.scenarios.guided.description.split('. ').slice(1).join('. '), 'reflow-card' + (state.values.fontSize === '크게' ? ' large' : ''));
        card.id = 'reflow-card'; parent.append(card);
      }
      if (key === 'previewDevice' && state.values.previewDevice === '휴대폰 카드') {
        const card = el('div', null, 'observation-card'); card.id = 'phone-observation';
        card.append(el('h4', '휴대폰 모형 · 그림 1'), el('p', '[화분 그림 관찰 대상]', 'illustration-label'), el('p', '작은 글씨가 뭉개짐'));
        parent.append(card);
      }
    }
  }
  function checkbox(parent, text, checked, fn, id) {
    const label = el('label', null, 'self-check'), input = el('input'); input.type = 'checkbox'; input.checked = checked; if (id) input.id = id;
    input.addEventListener('change', () => fn(input.checked)); label.append(input, el('span', text)); parent.append(label);
  }
  function renderVerify() {
    const {step, action} = current(), parent = $('verification-controls'); parent.replaceChildren();
    if (step.code === 'KP17') {renderIndependent(parent); return;}
    const kind = engine.rules[action.code].kind;
    paragraph(parent, kind === 'self' ? '이 행동은 직접 읽기·대조한 사실을 스스로 확인합니다. 앱이 내용의 의미를 판정하지 않습니다.' : '자동 검사: 제공된 문자열·선택값 또는 모형 클릭 상태를 비교합니다.', 'check-explanation');
    if (kind === 'self') checkbox(parent, action.expected + ' — 직접 확인했어요.', !!state.self[action.code], checked => change(() => {state.self[action.code] = checked; delete state.confirmed[action.code];}), 'action-self-check');
    parent.append(button(kind === 'self' ? '현재 행동 자기 확인 기록' : '현재 행동 확인', 'check-action', () => {
      pushUndo(); const result = engine.confirm(state, action.code);
      feedback = result.ok ? {kind:'ok', text: (result.kind === 'self' ? '자기 확인을 기록했습니다. ' : '자동 조건이 맞습니다. ') + action.expected}
        : {kind:'fail', text: '아직 확인되지 않았습니다. ' + (result.kind === 'self' && result.ready ? '직접 확인한 뒤 확인란을 선택하세요.' : action.recovery)};
      render(); $('feedback').focus();
    }));
  }
  function renderIndependent(parent) {
    parent.append(button('새 조건 답안 제출', 'submit-independent', () => {
      pushUndo(); const result = engine.submitIndependent(state); if (result.submitted) remember();
      feedback = result.submitted ? {kind:'info', text:`${result.attempt.number}번째 ${result.attempt.assisted ? '도움받은' : '현재 과제 힌트 미사용'} 시도를 기록했습니다. 아래 해설과 자신의 이유를 비교하세요.`} : {kind:'fail', text:result.message};
      render(); $('feedback').focus();
    }));
    if (state.independentAttempts.length) paragraph(parent, '시도 기록: ' + state.independentAttempts.map(a => `${a.number}회 ${a.assisted ? '도움받음' : '현재 과제 힌트 미사용'}`).join(' · '), 'small');
    if (!state.independentSubmitted) return;
    const card = el('div', null, 'answer-panel'), t = lesson.scenarios.transfer;
    card.append(el('h4', '제출 후 비교 — 예시 답안'));
    paragraph(card, `${t.title} / 부제 없음 / ${t.author} / ${t.language}`);
    paragraph(card, t.descriptionExample);
    paragraph(card, t.expectedStatus + ': ' + t.blockers.join(' · '));
    const exactOK = ['KP17.1','KP17.2','KP17.4'].every(c => engine.evaluate(state,c).ok) && !state.values.transferSubtitle.trim();
    paragraph(card, exactOK ? '자동 비교: 제목·부제·저자·준비 상태가 조건과 일치합니다.' : '자동 비교: 제목·부제·저자·준비 상태 중 조건과 다른 값이 있습니다. 수정 후 다시 제출하세요.');
    paragraph(card, '설명의 두 문장에 초보자의 관찰·선 연습이 담겼는지, 표지 출처와 목차 오류 두 항목을 이유에 포함했는지는 직접 비교하세요.');
    checkbox(card, '설명·판단 이유·미해결 항목을 예시와 비교했어요. (의미 기준 자기 점검)', !!state.self['KP17.3'], checked => change(() => {state.self['KP17.3'] = checked; engine.confirm(state, 'KP17.3');}), 'independent-self-check');
    parent.append(card);
  }
  function renderTransfer() {
    const {step} = current(), parent = $('transfer-content'); parent.replaceChildren();
    const hidden = step.code === 'KP17' && !state.independentSubmitted;
    $('transfer-panel').hidden = hidden; if (hidden) return;
    paragraph(parent, step.transferTask.question);
    const answer = el('textarea'); answer.id = 'transfer-response'; answer.setAttribute('aria-label', '새 조건에 대한 내 생각'); answer.maxLength = 5000; answer.value = state.transfer[step.id] || '';
    answer.addEventListener('input', () => {state.transfer[step.id] = answer.value; state.transferChecked[step.id] = false;}); parent.append(answer);
    parent.append(button('내 답을 쓴 뒤 해설 보기', 'reveal-transfer', () => {
      if (!String(state.transfer[step.id] || '').trim()) {setFeedback('fail', '새 조건에 대한 내 생각을 먼저 적으세요.'); $('feedback').focus(); return;}
      state.answers[step.id] = true; state.hints[step.id] = Math.max(state.hints[step.id] || 0, step.hints.length); remember(); render();
    }, 'secondary'));
    if (state.answers[step.id]) {
      const card = el('div', null, 'answer-panel'); paragraph(card, step.transferTask.answer); paragraph(card, step.transferTask.grading, 'small');
      checkbox(card, '내 판단과 이유를 해설과 비교했어요. (자기 점검)', !!state.transferChecked[step.id], checked => {state.transferChecked[step.id] = checked;}, 'transfer-self-check'); parent.append(card);
    }
  }
  const conceptAnswers = {}, conceptResults = {};
  if(storedSession){lesson.conceptQuestions.forEach((q,i)=>{const n=storedSession.conceptAnswers?.[i];if(q.options&&Number.isInteger(n)&&n>=0&&n<q.options.length){conceptAnswers[i]=n;if(typeof storedSession.conceptResults?.[i]==='boolean')conceptResults[i]=n===q.correctIndex;}});}
  function renderConcepts() {
    $('concept-panel').hidden = current().step.code !== 'KP18';
    const parent = $('concept-content'); parent.replaceChildren();
    if ($('concept-panel').hidden) return;
    lesson.conceptQuestions.forEach((q, i) => {
      const card = el('div', null, 'question'); card.append(el('h4', (i + 1) + '. ' + q.question));
      if (!q.options) {paragraph(card,q.answer); parent.append(card); return;}
      q.options.forEach((text, j) => {
        const label = el('label'), input = el('input'); input.type = 'radio'; input.name = 'concept-' + i; input.value = String(j); input.checked = conceptAnswers[i] === j;
        input.id = 'concept-' + i + '-option-' + j;
        input.addEventListener('change', () => {conceptAnswers[i] = j; delete conceptResults[i]; const old=$('concept-feedback-'+i);if(old)old.remove();}); label.append(input,el('span',text)); card.append(label);
      });
      card.append(button('선택 확인', 'check-concept-' + i, () => {conceptResults[i] = conceptAnswers[i] === q.correctIndex; renderConcepts();$('check-concept-'+i).focus({preventScroll:true});}, 'secondary'));
      if (Object.prototype.hasOwnProperty.call(conceptResults,i)) {const result=el('p',(conceptResults[i] ? '자동 비교: 맞습니다. ' : '자동 비교: 다시 생각해 보세요. ') + q.explanation,'normal-result');result.id='concept-feedback-'+i;result.setAttribute('role','status');card.append(result);}
      parent.append(card);
    });
  }
  function render() {
    const focusedId = document.activeElement && document.activeElement.id;
    const {step, action} = current();
    $('phase').textContent = `${step.phase} · ${route.step + 1} / ${lesson.stepCount} 미션`;
    $('mission-title').textContent = step.code + ' · ' + step.title;
    $('mission-why').textContent = step.why;
    $('current-route').textContent = action.deepLink;
    $('undo-button').disabled = history.length === 0;
    $('previous-button').disabled = route.step === 0 && route.action === 0;
    $('next-button').disabled = route.step === lesson.steps.length - 1 && route.action === step.microActions.length - 1;
    renderNav(); renderGuide(); renderWorkspace(); renderVerify(); renderTransfer(); renderConcepts(); showFeedback();
    if (focusedId && $(focusedId)) $(focusedId).focus({preventScroll:true});
  }
  function readRoute() {
    route = engine.parseRoute(location.hash);
    feedback = route.valid ? null : {kind:'info',text:'찾을 수 없는 행동 코드입니다. 첫 미션으로 돌아왔습니다.'};
    if (!route.valid || !location.hash || location.hash === '#kdp-preflight') historyReplace(lesson.steps[route.step].microActions[route.action].deepLink);
    inputGroup = null; remember(); render();
  }
  $('lesson-title').textContent = lesson.title;
  $('dataset-notice').classList.toggle('draft', build.provisional);
  $('dataset-notice').textContent = build.provisional ? '교정 전 초안 데이터 · 구현 검토 중 · 실제 KDP와 Kindle Previewer 미검증' : '최종 제공 데이터 · 독립 교육용 모형 · 실제 KDP와 Kindle Previewer 미검증';
  $('version-label').textContent = `데이터 ${lesson.contentVersion} · 공식자료 확인일 ${lesson.verification.checkedAt} · 엔진 ${build.engine}`;
  lesson.steps.forEach((s,i) => {const o = el('option',s.code + ' ' + s.title);o.value = String(i);$('mission-select').append(o);});
  $('mission-select').addEventListener('change', e => go(Number(e.target.value)));
  $('hint-button').addEventListener('click', () => {const s=current().step; state.hints[s.id] = Math.min((state.hints[s.id] || 0) + 1,s.hints.length); remember(); render();});
  $('undo-button').addEventListener('click', () => {
    if (!history.length) return;
    const prior = history.pop(); prior.hints = state.hints; prior.answers = state.answers; prior.independentAttempts = state.independentAttempts;
    state = prior; feedback = {kind:'info',text:'직전 입력 또는 확인을 되돌렸습니다. 이미 본 힌트·해설과 제출 시도 기록은 유지됩니다.'}; inputGroup = null; render();
  });
  $('reset-button').addEventListener('click', () => change(() => engine.resetMission(state,current().step)));
  $('previous-button').addEventListener('click', () => route.action ? go(route.step,route.action-1) : go(route.step-1,lesson.steps[route.step-1].microActions.length-1));
  $('next-button').addEventListener('click', () => route.action + 1 < current().step.microActions.length ? go(route.step,route.action+1) : go(route.step+1));
  $('show-record').addEventListener('click', () => {
    const lines = ['독립 교육용 모형의 준비 기록','실제 출판 상태: 미실행','데이터: '+lesson.contentVersion,'가상 도서만 사용',''];
    for (const step of lesson.steps) {
      lines.push(step.code+' '+step.title);
      for (const key of engine.controls[step.code]) lines.push(engine.fields[key].label+': '+(state.values[key] || '(빈칸)'));
      lines.push('행동 확인: '+step.microActions.map(a => a.code+' '+(engine.completed(state,a.code) ? engine.rules[a.code].kind === 'self' ? '자기 확인' : '자동 조건 확인' : '미확인')).join(' / '));
      lines.push('도움: '+(state.hints[step.id] ? '힌트/해설 열람' : '힌트 미사용'),'');
    }
    lines.push('현재 v01 도착: '+state.tocArrival,'현재 수정본 도착: '+state.fixedArrival,'독립 과제 제출: '+state.independentAttempts.map(a=>a.number+'회 '+(a.assisted?'도움받음':'현재 과제 힌트 미사용')).join(' / '));
    $('record-text').value = lines.join('\n'); $('record-dialog').showModal();
  });
  $('close-record').addEventListener('click', () => $('record-dialog').close());
  document.querySelector('.skip').addEventListener('click', event => {event.preventDefault();$('workspace-title').focus();});
  window.addEventListener('hashchange', readRoute);
  function runnerState(){
    const {action}=current(),result=engine.evaluate(state,action.code);
    if(result.kind==='self')return{status:'manual',message:'이 행동은 읽기·의미 대조에 대한 자기 확인입니다. 자동 성공으로 판정하지 않습니다.'};
    return{status:engine.completed(state,action.code)?'passed':'pending',message:engine.completed(state,action.code)?'현재 모형의 문자열·선택·이동 조건을 확인했습니다. 실제 출판 검증은 아닙니다.':'현재 행동의 입력을 바꾸고 확인하세요. '+action.recovery};
  }
  window.PlaygroundRunner=Object.freeze({
    loadExample(){change(()=>engine.resetMission(state,current().step));feedback={kind:'info',text:'현재 미션의 시작 예시와 조건 카드를 불러왔습니다. 직접 입력하고 확인하세요.'};render();remember();return runnerState();},
    check(){if(current().step.code==='KP17')$('submit-independent').click();else $('check-action').click();remember();return runnerState();},
    reset(){try{localStorage.removeItem(storageKey);}catch(_){}state=engine.initialState();history=[];for(const key of Object.keys(conceptAnswers))delete conceptAnswers[key];for(const key of Object.keys(conceptResults))delete conceptResults[key];feedback={kind:'info',text:'v7 출판 준비의 저장 입력과 기록을 초기화했습니다. 현재 미션에서 다시 시작합니다.'};render();remember();return runnerState();},
    getState:runnerState
  });
  document.addEventListener('input',remember);
  document.addEventListener('change',remember);
  document.addEventListener('click',remember);
  window.addEventListener('pagehide',remember);
  readRoute();
})();
