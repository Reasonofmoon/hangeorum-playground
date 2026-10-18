(() => {
  'use strict';
  const lesson = window.WEB_LESSON;
  const engine = window.WebPracticeEngine;
  const $ = id => document.getElementById(id);
  if (!lesson || !engine) {
    $('step-status').textContent = '수업 데이터 또는 판정 파일을 읽지 못했습니다. lesson.js, engine.js, app.js를 같은 폴더에 두세요.';
    $('step-status').className = 'status error';
    return;
  }
  const storageKey = 'tutorial-platform-v7:practice:web';
  const version = String(lesson.contentVersion);
  const progressVersion = version + '@' + String(window.WEB_LESSON_SHA256 || 'unversioned');
  const osPredicates = new Set(['folder', 'plain-text', 'save-html', 'extension', 'open-local']);
  const allowedLevels = ['안내 수행', '힌트 사용 수행', '정답 참조 수행', '독립 수행', '실제 기기 자가확인', '개념 응답 확인'];
  const clampCount = value => Number.isSafeInteger(value) && value > 0 ? Math.min(value, 99999) : 0;
  let storageAvailable = true;
  let reentered = false;
  let storedSession = null, restoreError = '', runnerCheck = null;
  let record = {version: progressVersion, mission: lesson.steps[0].id, passes: {}, help: {guided: {hints: 0, answers: 0}, transfer: {hints: 0, answers: 0}}};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw && raw.length > 12000000) throw new Error('저장 용량');
    const session = JSON.parse(raw || 'null');
    const saved = session && session.version === 7 ? session.record : null;
    storedSession = session;
    if (saved && saved.version === progressVersion) {
      reentered = true;
      if (lesson.steps.some(step => step.id === saved.mission)) record.mission = saved.mission;
      const keys = lesson.steps.flatMap(step => [step.id, ...step.microActions.map(micro => micro.id)]).concat(['guided-result', 'repair-result', 'transfer-result', 'concept']);
      for (const key of keys) {
        const pass = saved.passes && saved.passes[key];
        if (pass && allowedLevels.includes(pass.level)) record.passes[key] = {count: clampCount(pass.count), level: pass.level};
      }
      for (const mode of ['guided', 'transfer']) {
        const help = saved.help && saved.help[mode];
        if (help) record.help[mode] = {hints: clampCount(help.hints), answers: clampCount(help.answers)};
      }
    }
  } catch (_) { restoreError = '저장된 실습 형식이 맞지 않아 시작 코드로 복구했습니다.'; storedSession = null; }
  const recoveryEmpty = () => ({injected: false, savedBroken: false, previewBroken: false, observed: false, fixed: false, savedFixed: false, previewFixed: false});
  const freshAttempt = () => ({source: lesson.codeText.starter, saved: null, preview: null, saveCount: 0, refreshCount: 0, lastValidGuided: null, undo: [], recovery: recoveryEmpty(), read: false, self: new Set(), currentPass: new Set(), hintOpen: new Set(), microOpen: false, answerOpen: false, reason: '', reasonConfirmed: false, resultChecked: false});
  const attempts = {guided: freshAttempt(), transfer: freshAttempt()};
  let mode = 'guided';
  let stepIndex = 0;
  let microIndex = null;
  let conceptChecked = false;
  function decodeAttempt(value) {
    if (!value || typeof value !== 'object') throw new Error('시도 형식');
    const a = freshAttempt();
    const bounded = (v,nullable=false) => {if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>65536)throw new Error('코드 길이');return v;};
    a.source=bounded(value.source);a.saved=bounded(value.saved,true);a.preview=bounded(value.preview,true);a.lastValidGuided=bounded(value.lastValidGuided,true);
    for(const k of ['saveCount','refreshCount']){if(!Number.isSafeInteger(value[k])||value[k]<0||value[k]>1000000)throw new Error('시도 횟수');a[k]=value[k];}
    for(const k of Object.keys(a.recovery))a.recovery[k]=value.recovery?.[k]===true;
    for(const k of ['read','microOpen','answerOpen','reasonConfirmed','resultChecked'])a[k]=value[k]===true;
    if(typeof value.reason!=='string'||value.reason.length>700)throw new Error('설명');a.reason=value.reason;
    const keys=new Set(lesson.steps.flatMap(s=>[s.id,...s.microActions.map(m=>m.id)]).concat(['guided-result','repair-result','transfer-result','concept']));
    for(const k of ['self','currentPass','hintOpen']){if(!Array.isArray(value[k])||value[k].length>200||value[k].some(x=>!keys.has(x)))throw new Error('행동 기록');a[k]=new Set(value[k]);}
    if(!Array.isArray(value.undo)||value.undo.length>50)throw new Error('되돌리기 기록');
    a.undo=value.undo.map(v=>{const decoded=decodeAttempt({...value,...v,undo:[],self:[],currentPass:[],hintOpen:[]});return{source:decoded.source,saved:decoded.saved,preview:decoded.preview,saveCount:decoded.saveCount,refreshCount:decoded.refreshCount,lastValidGuided:decoded.lastValidGuided,recovery:decoded.recovery};});
    return a;
  }
  try {
    if(storedSession && storedSession.version===7 && storedSession.record?.version===progressVersion){
      const guided=decodeAttempt(storedSession.attempts?.guided),transfer=decodeAttempt(storedSession.attempts?.transfer);
      attempts.guided=guided;attempts.transfer=transfer;
      if(storedSession.check && ['step','result'].includes(storedSession.check.kind)&&typeof storedSession.check.key==='string')runnerCheck={kind:storedSession.check.kind,key:storedSession.check.key};
    }
  }catch(_){restoreError='저장된 입력 형식이 맞지 않아 시작 코드로 복구했습니다. 과거 확인 이력과 도움 이력은 별도로 남습니다.';runnerCheck=null;}
  const attempt = () => attempts[mode];
  const scenario = () => lesson.scenarios[mode];
  const step = () => lesson.steps[stepIndex];
  const inspect = source => engine.inspect(source == null ? '' : source, scenario());
  const has = (result, id) => result.safe && !!result.checks.find(check => check.id === id && check.pass);
  const hasAll = (result, ids) => ids.every(id => has(result, id));
  const assistance = (which = mode) => record.help[which].answers ? '정답 참조 수행' : record.help[which].hints ? '힌트 사용 수행' : which === 'transfer' ? '독립 수행' : '안내 수행';
  const isSelfAction = () => osPredicates.has(step().expected.predicate) || (step().expected.predicate === 'transfer' && microIndex === 0);

  function persist() {
    const encode=a=>({...a,self:[...a.self],currentPass:[...a.currentPass],hintOpen:[...a.hintOpen]});
    try { const serialized=JSON.stringify({version:7,record,attempts:{guided:encode(attempts.guided),transfer:encode(attempts.transfer)},route:location.hash,check:runnerCheck,mobile:$('layout').dataset.mobile,conceptAnswers:lesson.conceptQuestions.map(q=>{const v=document.querySelector('input[name="'+q.id+'"]:checked');return v?Number(v.value):null;})});if(serialized.length>12000000)throw new Error('저장 용량');localStorage.setItem(storageKey,serialized); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
    $('storage-notice').hidden = storageAvailable;
    if (!storageAvailable) {
      $('storage-notice').textContent = '이 브라우저에서 진행 기록을 저장할 수 없습니다. 현재 탭에서는 계속 연습할 수 있습니다.';
    }
  }
  function message(id, text, kind = '') {
    $(id).textContent = text;
    $(id).className = 'status' + (kind ? ' ' + kind : '');
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function snapshot() {
    const a = attempt();
    const next = {source: a.source, saved: a.saved, preview: a.preview, saveCount: a.saveCount, refreshCount: a.refreshCount, lastValidGuided: a.lastValidGuided, recovery: {...a.recovery}};
    if (a.undo.length && sameWorkState(a.undo[a.undo.length - 1], next)) return;
    a.undo.push(next);
    if (a.undo.length > 50) a.undo.shift();
  }
  function sameWorkState(left, right) {
    return left.source === right.source && left.saved === right.saved && left.preview === right.preview && left.saveCount === right.saveCount && left.refreshCount === right.refreshCount && left.lastValidGuided === right.lastValidGuided && Object.keys(left.recovery).every(key => left.recovery[key] === right.recovery[key]);
  }
  function resetResultNotice() {
    runnerCheck = null;
    attempt().resultChecked = false;
    $('condition-checks').replaceChildren();
    message('result-status', '현재 내용이 바뀌었습니다. 저장과 새로고침 후 결과를 다시 확인하세요.');
    message('step-status', '현재 행동을 수행하고 확인하세요.');
    renderRecord();
  }
  function updateSource(value, previous = attempt().source) {
    const a = attempt();
    const before = inspect(previous);
    a.source = value;
    const after = inspect(value);
    if (mode === 'guided') {
      // Retain the last complete guided source across incomplete per-key edits.
      // Only its exact educational closing-h1 replacement starts this experiment.
      if (before.passed) a.lastValidGuided = previous;
      if (a.lastValidGuided !== null && after.safe && !has(after, 'h1Pair') && value === a.lastValidGuided.replace(/<\/h1\s*>/i, '<h1>')) {
        a.recovery = recoveryEmpty();
        a.recovery.injected = true;
      }
      if (after.passed) a.lastValidGuided = value;
      if (a.recovery.observed) {
        a.recovery.fixed = hasAll(after, ['heading', 'h1Pair', 'tagPairs', 'structure']);
        a.recovery.savedFixed = false;
        a.recovery.previewFixed = false;
      }
    }
    resetResultNotice();
    renderState();
  }
  function saveCode() {
    snapshot();
    const a = attempt();
    a.saved = a.source;
    a.saveCount++;
    const result = inspect(a.saved);
    if (a.recovery.injected && result.safe && !has(result, 'h1Pair')) a.recovery.savedBroken = true;
    if (a.recovery.observed && a.recovery.fixed && result.passed) a.recovery.savedFixed = true;
    resetResultNotice();
    renderState();
    $('buffer-status').textContent = '앱 안 저장을 마쳤습니다. 실제 디스크 파일은 바뀌지 않았습니다. 이제 미리보기를 새로고침하세요.';
  }
  function refreshPreview() {
    const a = attempt();
    if (a.saved === null) { message('result-status', '먼저 앱 안 저장을 눌러 미리볼 내용을 저장하세요.', 'error'); return; }
    snapshot();
    a.preview = a.saved;
    a.refreshCount++;
    const result = inspect(a.preview);
    if (a.recovery.savedBroken && result.safe && !has(result, 'h1Pair')) a.recovery.previewBroken = true;
    if (a.recovery.savedFixed && result.passed && a.source === a.saved) a.recovery.previewFixed = true;
    resetResultNotice();
    renderPreview();
    renderState();
    message('result-status', result.safe ? '저장한 내용으로 미리보기를 갱신했습니다. 화면과 현재 행동의 조건을 확인하세요.' : '미리보기를 차단했습니다.\n' + result.issues.join('\n'), result.safe ? '' : 'error');
  }
  function renderPreview() {
    const a = attempt();
    // The iframe sandbox is never altered. Only the engine's guarded HTML reaches srcdoc.
    // Replace the preview browsing context so srcdoc refreshes do not add entries
    // to the browser's joint history and intercept lesson Back/Forward navigation.
    const oldFrame=$('preview-frame'), frame=oldFrame.cloneNode(false);
    frame.removeAttribute('srcdoc');
    if (a.preview === null) {
      oldFrame.replaceWith(frame);
      $('preview-title').textContent = '아직 새로고침하지 않았습니다';
      return;
    }
    const result = inspect(a.preview);
    frame.srcdoc = result.html;
    oldFrame.replaceWith(frame);
    $('preview-title').textContent = result.safe ? (result.title || '(title이 없습니다)') : '허용되지 않은 코드 · 미리보기 차단';
  }
  function recordPass(key, level) {
    const existing = record.passes[key];
    record.passes[key] = {count: Math.min(99999, (existing ? existing.count : 0) + 1), level};
    attempt().currentPass.add(key);
    persist();
    renderRecord();
  }
  function markHelp(kind) {
    record.help[mode][kind] = Math.min(99999, record.help[mode][kind] + 1);
    // Assistance already seen remains part of subsequent attempts and undo history.
    persist();
    renderState();
    renderRecord();
  }
  function openMicroHelp() {
    if (!attempt().microOpen) {
      attempt().microOpen = true;
      markHelp('hints');
    }
    renderMicro();
  }
  function renderMicro() {
    const current = step();
    const hidden = current.microActionsCountAsHint && !attempt().microOpen;
    $('show-micro-help').hidden = !hidden;
    $('micro-list').hidden = hidden;
    $('micro-list').replaceChildren();
    if (hidden) return;
    current.microActions.forEach((micro, index) => {
      const item = element('li', undefined, index === microIndex ? 'active' : '');
      item.id = micro.id;
      const link = element('a', micro.code);
      link.href = micro.deepLink;
      item.append(link, element('p', micro.action), element('p', '예상: ' + micro.expected, 'micro-detail'), element('p', '다르면: ' + micro.recovery, 'micro-detail'));
      $('micro-list').append(item);
    });
  }
  function renderGoal() {
    const s = scenario();
    $('goal-heading').textContent = s.heading;
    const rows = [['연습 파일', s.folder + '/' + s.fileName], ['탭 제목', s.tabTitle], ['본문 제목', s.heading], ['소개 문단', s.paragraph], ['소제목', s.listHeading], [s.listType === 'ol' ? '번호 목록' : '글머리표', s.items.join(s.listType === 'ol' ? ' → ' : ' · ')]];
    $('goal-list').replaceChildren();
    rows.forEach(([label, text]) => $('goal-list').append(element('dt', label), element('dd', text)));
    $('goal-change').hidden = !s.newCondition;
    $('goal-change').textContent = s.newCondition || '';
  }
  function renderState() {
    const a = attempt();
    const r = a.recovery;
    const dirty = a.saved === null || a.source !== a.saved;
    const stale = a.preview === null || a.preview !== a.saved;
    $('mode-label').textContent = mode === 'guided' ? '안내 과제' : '독립 과제';
    $('guided-mode').setAttribute('aria-pressed', String(mode === 'guided'));
    $('transfer-mode').setAttribute('aria-pressed', String(mode === 'transfer'));
    $('working-file').textContent = scenario().fileName + ' · 앱 안 작업';
    $('edit-state').textContent = dirty ? '저장 전 변경' : '앱 안 저장됨';
    $('preview-state').textContent = a.preview === null ? '미리보기 전' : stale ? '저장한 내용보다 이전 화면' : dirty ? '편집 중 · 이전 저장 내용' : '마지막 저장 내용';
    $('buffer-status').textContent = '앱 안 저장 ' + a.saveCount + '회 · 미리보기 새로고침 ' + a.refreshCount + '회 · 실제 파일 저장은 자가확인';
    $('undo').disabled = !a.undo.length;
    $('refresh-preview').disabled = a.saved === null;
    $('recovery-panel').hidden = mode !== 'guided';
    $('inject-error').disabled = mode !== 'guided' || !inspect(a.source).passed;
    const previewCheck = inspect(a.preview);
    $('observe-error').disabled = !(r.previewBroken && a.preview === a.saved && a.saved === a.source && previewCheck.safe && !has(previewCheck, 'h1Pair'));
    $('recovery-status').textContent = ['오류 만들기 ' + (r.injected ? '확인' : '대기'), '오류 저장 ' + (r.savedBroken ? '확인' : '대기'), '오류 새로고침 ' + (r.previewBroken ? '확인' : '대기'), '관찰 ' + (r.observed ? '확인' : '대기'), '수정 ' + (r.fixed ? '확인' : '대기'), '수정 저장 ' + (r.savedFixed ? '확인' : '대기'), '복구 새로고침 ' + (r.previewFixed ? '확인' : '대기')].join(' → ');
    $('transfer-reason-panel').hidden = mode !== 'transfer';
    const help = record.help[mode];
    $('help-level').textContent = '힌트 ' + help.hints + '회 · 정답 ' + help.answers + '회';
    $('result-level').textContent = assistance();
    $('show-answer').hidden = a.answerOpen;
    $('hide-answer').hidden = !a.answerOpen;
    $('answer-code').hidden = !a.answerOpen;
    $('answer-code').textContent = a.answerOpen ? lesson.codeText[mode === 'guided' ? 'guidedAnswer' : 'transferAnswer'] : '';
  }
  function renderStep() {
    const current = step();
    const a = attempt();
    const action = microIndex === null ? null : current.microActions[microIndex];
    $('step-select').value = current.id;
    $('step-code').textContent = microIndex === null ? current.code : current.microActions[microIndex].code;
    $('step-phase').textContent = current.phase;
    $('step-title').textContent = current.title;
    $('step-instruction').textContent = action ? action.action : current.action.instruction;
    if (current.code === 'WB15' && (!action || action.code === 'WB15.2')) $('step-instruction').textContent += ' 앱 안에서는 2. 앱 안 저장 → 3. 미리보기 새로고침 뒤 저장·새로고침한 오류 관찰 확인 버튼을 눌러 관찰을 기록하세요.';
    if (current.code === 'WB13') $('step-instruction').textContent += ' 이 실습 앱에서는 2. 앱 안 저장 후 3. 미리보기 새로고침 버튼을 누르세요. 브라우저 전체 새로고침은 v7에 저장된 편집 상태를 복원합니다.';
    $('step-expected').textContent = action ? action.expected : current.expected.text;
    $('step-location').textContent = action ? action.location : current.location.text;
    $('step-count').textContent = (stepIndex + 1) + ' / ' + lesson.steps.length + ' 미션';
    $('previous-step').disabled = stepIndex === 0;
    $('next-step').disabled = stepIndex === lesson.steps.length - 1;
    $('read-panel').hidden = current.expected.predicate !== 'read-goal';
    $('read-confirm').checked = a.read;
    $('self-panel').hidden = !isSelfAction();
    const key = microIndex === null ? current.id : current.microActions[microIndex].id;
    $('self-confirm').checked = a.self.has(key);
    $('self-label').textContent = (microIndex === null ? current.expected.text : current.microActions[microIndex].expected) + ' (직접 확인)';
    $('check-step').textContent = isSelfAction() ? '자가확인 기록' : '이 행동 확인';
    const hintOpen = a.hintOpen.has(current.id);
    $('hint-panel').hidden = !hintOpen;
    $('hint-panel').replaceChildren();
    if (hintOpen) current.hints.forEach((hint, i) => $('hint-panel').append(element('p', (i + 1) + '. ' + hint)));
    $('hint-button').textContent = hintOpen ? '힌트 다시 보기' : '힌트 보기';
    renderMicro();
    renderGoal();
    renderState();
  }
  function routeFrom(value) {
    const raw = String(value || '').trim();
    let match = /^WB(\d{1,2})(?:\.(\d{1,2}))?$/i.exec(raw);
    if (match) return {id: 'wb-' + match[1].padStart(2, '0'), micro: match[2] ? Number(match[2]) - 1 : null};
    match = /^#?html-intro\/(wb-\d{2})(?:\/a(\d{2}))?$/.exec(raw);
    if (match) return {id: match[1], micro: match[2] ? Number(match[2]) - 1 : null};
    return null;
  }
  function go(id, micro = null) {
    const index = lesson.steps.findIndex(s => s.id === id);
    if (index < 0 || (micro !== null && (!Number.isInteger(micro) || micro < 0 || micro >= lesson.steps[index].microActions.length))) {
      $('route-error').textContent = '미션 코드를 찾을 수 없습니다. WB01–WB18 또는 WB18.12처럼 입력하세요.';
      $('route-error').hidden = false;
      return;
    }
    $('route-error').hidden = true;
    stepIndex = index;
    microIndex = micro;
    const nextMode = step().expected.predicate === 'transfer' ? 'transfer' : 'guided';
    if (nextMode !== mode) {
      attempt().answerOpen = false;
      mode = nextMode;
      $('code-editor').value = attempt().source;
      $('transfer-reason').value = attempt().reason;
      $('reason-confirm').checked = attempt().reasonConfirmed;
      renderPreview();
      resetResultNotice();
    }
    record.mission = id;
    persist();
    if (micro !== null && step().microActionsCountAsHint) openMicroHelp();
    renderStep();
    const old = record.passes[micro === null ? step().id : step().microActions[micro].id];
    message('step-status', old ? '이전 확인 이력: ' + old.level + '. 현재 행동을 수행하고 다시 확인하세요.' : '현재 행동을 수행하고 확인하세요.');
    renderRecord();
  }
  function navigate(id, micro = null) {
    const hash = '#' + lesson.lessonId + '/' + id + (micro === null ? '' : '/a' + String(micro + 1).padStart(2, '0'));
    if (location.hash === hash) go(id, micro); else location.hash = hash;
  }
  function evaluateStep(commit = true) {
    const a = attempt();
    const current = step();
    const p = current.expected.predicate;
    const source = inspect(a.source);
    const saved = inspect(a.saved);
    const preview = inspect(a.preview);
    const synced = a.saved !== null && a.preview !== null && a.source === a.saved && a.saved === a.preview && a.refreshCount > 0;
    const key = microIndex === null ? current.id : current.microActions[microIndex].id;
    let pass = false;
    let detail = current.expected.text;
    if (isSelfAction()) {
      pass = a.self.has(key);
      detail = '실제 기기 자가확인입니다. 앱은 파일이나 프로그램을 검사하지 않았습니다.';
    } else {
      switch (p) {
        case 'read-goal': pass = a.read; break;
        case 'starter-code': pass = hasAll(source, ['doctype', 'lang', 'charset', 'structure', 'h1Pair', 'tagPairs']); break;
        case 'edit-title': pass = has(source, 'title'); break;
        case 'edit-heading': pass = hasAll(source, ['heading', 'h1Pair']); break;
        case 'edit-paragraph': pass = has(source, 'paragraph'); break;
        case 'edit-list': pass = microIndex === null ? hasAll(source, ['listType', 'items', 'order']) : has(source, 'item-' + (microIndex + 1)); break;
        case 'save-edits': pass = a.saved !== null && a.saved === a.source && saved.passed; detail = '안내 조건의 수정 내용이 앱 안 저장본에 있습니다. 미리보기 갱신과 실제 파일 저장은 별도입니다.'; break;
        case 'refresh': pass = synced && preview.passed; break;
        case 'inject-error': pass = a.recovery.injected && source.safe && !has(source, 'h1Pair'); break;
        case 'observe-error': pass = microIndex === 0 ? a.recovery.savedBroken && a.saved === a.source && saved.safe && !has(saved, 'h1Pair') : a.recovery.observed && synced && preview.safe && !has(preview, 'h1Pair'); detail = microIndex === 0 ? '오류 코드의 앱 안 저장을 확인했습니다.' : '오류 저장 → 새로고침 → 관찰 확인이 필요합니다.'; break;
        case 'repair-tag': pass = a.recovery.observed && a.recovery.fixed && hasAll(source, ['heading', 'h1Pair', 'tagPairs', 'structure']); break;
        case 'verify-repair': pass = microIndex === 0 ? a.recovery.savedFixed && a.saved === a.source && saved.passed : a.recovery.previewFixed && synced && preview.passed; detail = '오류 관찰 뒤 수정·저장·새로고침한 복구 결과를 확인합니다.'; break;
        case 'transfer':
          if (microIndex === null) pass = synced && preview.passed && a.reason.trim().length > 0 && a.reasonConfirmed;
          else if (microIndex >= 1 && microIndex <= 4) pass = has(source, ['title', 'heading', 'paragraph', 'listHeading'][microIndex - 1]);
          else if (microIndex === 5) pass = has(source, 'listOpen');
          else if (microIndex === 6) pass = hasAll(source, ['listClose', 'tagPairs']);
          else if (microIndex >= 7 && microIndex <= 9) pass = has(source, 'item-' + (microIndex - 6));
          else if (microIndex === 10) pass = a.saved !== null && a.saved === a.source && saved.passed;
          else if (microIndex === 11) pass = synced && preview.passed;
          detail = microIndex === null ? '앱 안 새 조건 결과와 설명 자가확인입니다. 실제 reading.html 저장·열기는 별도로 직접 확인해야 합니다.' : current.microActions[microIndex].expected + ' 앱 안 조건만 확인합니다.';
          break;
      }
    }
    if (!pass) {
      if(commit)message('step-status', '아직 확인되지 않았습니다.\n' + detail + (source.safe ? '' : '\n' + source.issues.join('\n')), 'error');
      return {status:'pending',message:detail};
    }
    const level = isSelfAction() ? '실제 기기 자가확인' : assistance();
    if(commit){recordPass(key, level);message('step-status', '확인됨 · ' + level + '\n' + detail, 'success');if(p === 'verify-repair' && microIndex !== 0)recordPass('repair-result', level);}
    return {status:isSelfAction()||p==='read-goal'||(p==='transfer'&&microIndex===null)?'manual':'passed',message:detail};
  }
  function checkResult() {
    const a = attempt();
    const result = inspect(a.preview);
    const synced = a.saved !== null && a.preview !== null && a.source === a.saved && a.saved === a.preview && a.refreshCount > 0;
    const reason = mode !== 'transfer' || (a.reason.trim().length > 0 && a.reasonConfirmed);
    a.resultChecked = true;
    $('condition-checks').replaceChildren();
    const checks = [{id: 'saved-refreshed', label: '현재 편집 내용 저장·새로고침', pass: synced}, ...result.checks];
    if (mode === 'transfer') checks.push({id: 'reason', label: '새 구조를 고른 이유 작성·자가확인', pass: reason});
    checks.forEach(check => {
      const li = element('li', (check.pass ? '✓ ' : '○ ') + check.label, check.pass ? 'pass' : 'fail');
      li.dataset.check = check.id;
      $('condition-checks').append(li);
    });
    const pass = synced && result.passed && reason;
    message('result-status', pass ? '현재 결과 조건 확인 · ' + assistance() + '\n앱 안 HTML 구조와 내용을 확인했습니다. 실제 파일 저장·배포 또는 전문 숙련을 뜻하지 않습니다.' : '아직 결과 조건을 충족하지 못했습니다.\n' + (!synced ? '현재 편집 내용을 앱 안 저장한 뒤 미리보기를 새로고침하세요.\n' : '') + (!result.safe ? result.issues.join('\n') : '아래 조건에서 남은 항목을 확인하세요.'), pass ? 'success' : 'error');
    if (pass) recordPass(mode + '-result', assistance());
    runnerCheck={kind:'result',key:mode};persist();
    renderRecord();
  }
  function renderRecord() {
    const rows = lesson.steps.map(s => {
      const pass = record.passes[s.id];
      const node = element('span', s.code + (pass ? ' · 이전 확인: ' + pass.level : ' · 미확인'), pass ? 'pass' : '');
      return node;
    });
    $('progress-list').replaceChildren(...rows);
    const a = attempt();
    const result = inspect(a.preview);
    const currentComplete = a.resultChecked && a.source === a.saved && a.saved === a.preview && result.passed && (mode !== 'transfer' || (a.reason.trim().length > 0 && a.reasonConfirmed));
    $('current-record').textContent = (mode === 'guided' ? '안내 과제' : '독립 과제') + ' 현재 시도: ' + (currentComplete ? '결과 조건 확인' : '결과 다시 확인 필요') + ' · ' + assistance() + ' · 개념 문항: ' + (conceptChecked ? '응답·설명 확인함' : '이번 접속에서 미확인');
  }
  function renderConcepts() {
    lesson.conceptQuestions.forEach((q, index) => {
      const field = element('fieldset');
      field.id = q.id;
      field.append(element('legend', (index + 1) + '. ' + q.question));
      q.options.forEach((option, i) => {
        const label = element('label');
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = q.id; radio.value = String(i); radio.id = q.id + '-' + i;
        label.append(radio, element('span', option));
        field.append(label);
      });
      const explanation = element('p', '', 'explanation');
      explanation.id = q.id + '-explanation'; explanation.hidden = true;
      field.append(explanation);
      $('concept-questions').append(field);
    });
  }
  $('lesson-title').textContent = lesson.title;
  $('lesson-meta').textContent = lesson.steps.length + '미션 · ' + lesson.steps.reduce((n, s) => n + s.microActions.length, 0) + '개 단일 행동 · 책의 코드로 이동';
  $('version-note').textContent = '수업 데이터 ' + version + ' · 최종 검수 데이터 반영';
  $('offline-task').textContent = lesson.offlineTask.prompt + ' (' + lesson.offlineTask.assessment + ')';
  lesson.steps.forEach(s => { const option = element('option', s.code + ' · ' + s.title); option.value = s.id; $('step-select').append(option); });
  $('code-editor').value = attempts.guided.source;
  renderConcepts();
  if (reentered) {
    $('reentry-notice').hidden = false;
    $('reentry-notice').textContent = 'v7에 저장한 코드·앱 안 저장본·미리보기·미션·도움 기록을 복원했습니다. 실제 디스크 파일은 별도이며 현재 조건을 다시 검사할 수 있습니다.';
  }
  $('route-form').addEventListener('submit', event => {
    event.preventDefault();
    const route = routeFrom($('route-input').value);
    if (route) {
      const valid = lesson.steps.find(s => s.id === route.id);
      if (valid && (route.micro === null || valid.microActions[route.micro])) navigate(route.id, route.micro);
      else go(route.id, route.micro);
    } else go('invalid');
  });
  $('step-select').addEventListener('change', () => navigate($('step-select').value));
  $('previous-step').addEventListener('click', () => navigate(lesson.steps[stepIndex - 1].id));
  $('next-step').addEventListener('click', () => navigate(lesson.steps[stepIndex + 1].id));
  $('guided-mode').addEventListener('click', () => navigate('wb-01'));
  $('transfer-mode').addEventListener('click', () => navigate('wb-18'));
  $('code-editor').addEventListener('input', () => {
    if ($('code-editor').value === attempt().source) return;
    snapshot();
    updateSource($('code-editor').value);
    renderRecord();
  });
  $('save-code').addEventListener('click', saveCode);
  $('refresh-preview').addEventListener('click', refreshPreview);
  $('load-starter').addEventListener('click', () => {
    snapshot();
    attempt().recovery = recoveryEmpty();
    updateSource(lesson.codeText.starter);
    attempt().lastValidGuided = null;
    $('code-editor').value = attempt().source;
    renderRecord();
  });
  $('undo').addEventListener('click', () => {
    const a = attempt();
    let old = a.undo.pop();
    while (old && sameWorkState(old, a)) old = a.undo.pop();
    if (!old) return;
    Object.assign(a, old);
    $('code-editor').value = a.source;
    resetResultNotice(); renderPreview(); renderState(); renderRecord();
    message('step-status', '이전 작업 상태로 되돌렸습니다. 이미 본 힌트와 정답 참조 기록은 유지됩니다.');
  });
  $('reset-attempt').addEventListener('click', () => {
    attempts[mode] = freshAttempt();
    $('code-editor').value = attempt().source;
    $('transfer-reason').value = ''; $('reason-confirm').checked = false;
    resetResultNotice(); renderPreview(); renderStep(); renderRecord();
    message('step-status', '시작 코드로 현재 시도를 다시 시작합니다. 이전 통과 이력과 이미 본 도움 기록은 남아 있습니다.');
  });
  $('inject-error').addEventListener('click', () => {
    if (!inspect(attempt().source).passed) return;
    snapshot();
    updateSource(attempt().source.replace(/<\/h1\s*>/i, '<h1>'));
    $('code-editor').value = attempt().source;
    message('step-status', '제목 뒤 닫는 h1 태그에 오류를 만들었습니다. 앱 안 저장 → 미리보기 새로고침 → 오류 관찰 확인 순서로 진행하세요.');
  });
  $('observe-error').addEventListener('click', () => {
    const a = attempt();
    const result = inspect(a.preview);
    if (!(a.recovery.previewBroken && a.source === a.saved && a.saved === a.preview && result.safe && !has(result, 'h1Pair'))) return;
    snapshot(); a.recovery.observed = true; renderState();
    message('step-status', '저장·새로고침한 오류의 관찰을 기록했습니다. 코드의 제목 뒤 닫는 태그를 고치고 다시 저장·새로고침하세요.');
  });
  $('hint-button').addEventListener('click', () => { attempt().hintOpen.add(step().id); markHelp('hints'); renderStep(); });
  $('show-micro-help').addEventListener('click', openMicroHelp);
  $('show-answer').addEventListener('click', () => { attempt().answerOpen = true; markHelp('answers'); renderState(); });
  $('hide-answer').addEventListener('click', () => { attempt().answerOpen = false; renderState(); });
  $('read-confirm').addEventListener('change', () => {
    attempt().read = $('read-confirm').checked;
    attempt().currentPass.delete(step().id);
    step().microActions.forEach(micro => attempt().currentPass.delete(micro.id));
    message('step-status', '확인 표시를 바꿨습니다. 현재 행동을 다시 확인하세요.');
    renderRecord();
  });
  $('self-confirm').addEventListener('change', () => {
    const key = microIndex === null ? step().id : step().microActions[microIndex].id;
    if ($('self-confirm').checked) attempt().self.add(key); else attempt().self.delete(key);
    attempt().currentPass.delete(key);
    message('step-status', '확인 표시를 바꿨습니다. 현재 행동을 다시 확인하세요.');
    renderRecord();
  });
  $('transfer-reason').addEventListener('input', () => { attempt().reason = $('transfer-reason').value; attempt().reasonConfirmed = false; $('reason-confirm').checked = false; resetResultNotice(); renderRecord(); });
  $('reason-confirm').addEventListener('change', () => { attempt().reasonConfirmed = $('reason-confirm').checked; resetResultNotice(); renderRecord(); });
  $('check-step').addEventListener('click', () => {evaluateStep();runnerCheck={kind:'step',key:step().id+':'+microIndex};persist();});
  $('check-result').addEventListener('click', checkResult);
  $('concept-form').addEventListener('submit', event => {
    event.preventDefault();
    let answered = 0, correct = 0;
    lesson.conceptQuestions.forEach(q => {
      const selected = document.querySelector('input[name="' + q.id + '"]:checked');
      const explanation = $(q.id + '-explanation');
      explanation.hidden = false;
      if (selected) {
        answered++;
        const pass = Number(selected.value) === q.correctIndex;
        if (pass) correct++;
        explanation.textContent = (pass ? '맞았습니다. ' : '다시 비교하세요. ') + q.explanation;
      } else explanation.textContent = '아직 응답하지 않았습니다. 답을 고른 뒤 확인하세요.';
    });
    conceptChecked = answered === lesson.conceptQuestions.length;
    message('concept-status', '응답 ' + answered + '/' + lesson.conceptQuestions.length + ' · 정답 ' + correct + '/' + lesson.conceptQuestions.length + '. 설명을 읽고 다시 비교하세요.', conceptChecked && correct === answered ? 'success' : '');
    if (conceptChecked) recordPass('concept', '개념 응답 확인');
    renderRecord();
  });
  $('concept-form').addEventListener('change', () => { conceptChecked = false; renderRecord(); });
  for (const view of ['guide', 'work', 'both']) $('show-' + view).addEventListener('click', () => {
    $('layout').dataset.mobile = view;
    for (const item of ['guide', 'work', 'both']) $('show-' + item).setAttribute('aria-pressed', String(item === view));
  });
  window.addEventListener('hashchange', () => {
    const route = routeFrom(location.hash);
    if (route) go(route.id, route.micro); else go('invalid');
  });
  function runnerState(){
    if(!runnerCheck)return{status:'pending',message:'현재 행동 또는 저장·갱신한 HTML 결과를 확인하세요.'};
    if(runnerCheck.kind==='step'&&runnerCheck.key===step().id+':'+microIndex)return evaluateStep(false);
    if(runnerCheck.kind==='result'&&runnerCheck.key===mode){const a=attempt(),r=inspect(a.preview);const pass=a.resultChecked&&a.source===a.saved&&a.saved===a.preview&&a.refreshCount>0&&r.passed&&(mode!=='transfer'||(a.reason.trim().length>0&&a.reasonConfirmed));return{status:pass?'passed':'pending',message:pass?'앱 안 HTML 구조와 내용을 확인했습니다. 실제 파일 저장·배포와 설명의 의미는 자동 판정하지 않습니다.':'현재 코드를 앱 안 저장하고 미리보기를 갱신한 뒤 다시 검사하세요. 독립 과제는 구조를 고른 이유와 자기 대조도 필요합니다.'};}
    return{status:'pending',message:'현재 미션을 다시 확인하세요.'};
  }
  window.PlaygroundRunner=Object.freeze({
    loadExample(){snapshot();attempt().recovery=recoveryEmpty();updateSource(lesson.codeText.starter);attempt().saved=null;attempt().preview=null;attempt().lastValidGuided=null;$('code-editor').value=attempt().source;renderPreview();renderState();persist();message('step-status','현재 과제의 시작 HTML을 불러왔습니다. 안내에 따라 바꾸고 저장·갱신·확인하세요.');return runnerState();},
    check(){const result=evaluateStep();runnerCheck={kind:'step',key:step().id+':'+microIndex};persist();return result;},
    reset(){try{localStorage.removeItem(storageKey);}catch(_){}attempts.guided=freshAttempt();attempts.transfer=freshAttempt();record.passes={};record.help={guided:{hints:0,answers:0},transfer:{hints:0,answers:0}};runnerCheck=null;conceptChecked=false;$('concept-form').reset();$('code-editor').value=attempt().source;$('transfer-reason').value='';$('reason-confirm').checked=false;resetResultNotice();renderPreview();renderStep();renderRecord();persist();message('step-status','v7 웹 실습의 저장 입력과 기록을 초기화했습니다. 현재 미션에서 다시 시작하세요.');return runnerState();},
    getState:runnerState
  });
  document.addEventListener('input',()=>{runnerCheck=null;persist();});
  document.addEventListener('change',()=>{runnerCheck=null;persist();});
  document.addEventListener('click',()=>persist());
  window.addEventListener('pagehide',persist);
  const storedRoute=storedSession&&storedSession.version===7?routeFrom(storedSession.route):null;
  const initial = routeFrom(location.hash)||storedRoute;
  if (initial) go(initial.id, initial.micro);
  else { go(record.mission); if (location.hash) go('invalid'); }
  $('code-editor').value=attempt().source;$('transfer-reason').value=attempt().reason;renderPreview();renderStep();
  if(storedSession&&Array.isArray(storedSession.conceptAnswers))lesson.conceptQuestions.forEach((q,i)=>{const n=storedSession.conceptAnswers[i];if(Number.isInteger(n)&&n>=0&&n<q.options.length)$(q.id+'-'+n).checked=true;});
  if(storedSession&&['guide','work','both'].includes(storedSession.mobile))$('show-'+storedSession.mobile).click();
  if(restoreError){$('reentry-notice').hidden=false;$('reentry-notice').textContent=restoreError;}
  persist();
})();
