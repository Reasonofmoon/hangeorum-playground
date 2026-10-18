/* Pure state/condition engine. No DOM, storage, network, or executed lesson code. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PublishingEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  const clone = value => JSON.parse(JSON.stringify(value));
  function createModel(lesson) {
    const g = lesson.scenarios.guided, t = lesson.scenarios.transfer;
    const sentences = g.description.match(/[^.!?]+[.!?]+/g) || [g.description, ''];
    const first = normalize(sentences[0]), second = normalize(sentences.slice(1).join(' '));
    const fields = {};
    function field(key, label, type, options, initial) {
      fields[key] = {key, label, type, options: options || [], initial: initial || ''};
      return key;
    }
    field('scope', '작업 범위', 'select', ['출판 준비 초안', '실제 등록']);
    field('goal', '완료 목표', 'text');
    field('language', '본문 언어 답안', 'select', [g.language, 'Korean']);
    field('languageDate', '지원 언어 확인일', 'text');
    field('title', '제목', 'text'); field('subtitle', '부제', 'text'); field('author', '가상 저자명', 'text');
    field('description1', '설명 첫 문장', 'textarea'); field('description2', '설명 다음 문장', 'textarea');
    field('errorCopy', '오류 카드 — 소개문 편집', 'textarea', [], g.description + '\nGuaranteed success in 7 days.');
    field('errorReason', '수정 이유', 'select', ['짧아서 삭제', '원고에 없는 결과 약속']);
    field('asset1', '자료 1', 'text'); field('asset2', '자료 2', 'text'); field('asset3', '자료 3', 'text');
    field('rightsStatus', '표지 사진 확인 상태', 'select', ['확인 완료', '미확인']);
    field('rightsEvidence', '확인할 자료', 'text');
    field('rightsAction', '표지 사진 다음 조치', 'select', ['사용 가능', '사용 보류']);
    field('aiA', '사례 A 경위', 'select', ['AI 생성', 'AI 보조']);
    field('aiB', '사례 B 경위', 'select', ['AI 보조', 'AI 생성']);
    field('aiImage', '내부 그림 경위', 'select', ['사람 작성', 'AI 보조', 'AI 생성']);
    field('aiNext', '실제 출판 전 할 일', 'text');
    field('version', '검토 대상 카드', 'select', ['balcony_v01.epub', 'balcony_v02.epub']);
    field('reviewRecord', '검토 기록 첫 줄', 'text');
    field('tocIssue', '목차 문제 기록', 'textarea');
    field('fontSize', '글자 크기 모형', 'select', ['보통', '크게'], '보통');
    field('reflowDecision', '줄 흐름 판정', 'select', ['줄바꿈 변경만으로는 오류 아님', '줄 수 변화는 모두 오류']);
    field('previewDevice', '미리보기 모형', 'select', ['큰 화면 카드', '휴대폰 카드']);
    field('imageIssue', '그림 문제 기록', 'textarea');
    field('fixedVersion', '수정본 카드', 'select', ['balcony_v01.epub', 'balcony_v02.epub']);
    field('imageStatus', '그림 문제 상태', 'select', ['해결', '실제 검토 대기']);
    field('transferTitle', '새 책 제목', 'text'); field('transferSubtitle', '새 책 부제', 'text'); field('transferAuthor', '새 책 가상 저자명', 'text');
    field('transferDescription', '새 책 설명 — 두 문장', 'textarea');
    field('transferDecision', '새 책 준비 판정', 'select', ['준비 완료', '준비 보류']);
    field('transferReason', '판단 이유', 'textarea'); field('transferOpen', '미해결 항목', 'textarea');
    field('doneItems', '완료한 항목', 'textarea'); field('openItems', '미해결 항목', 'textarea');
    field('finalStatus', '최종 상태', 'select', ['출판 준비 완료', lesson.snapshots.final.decision]);
    const controls = {
      KP01: ['scope', 'goal'], KP02: ['language', 'languageDate'], KP03: ['title'], KP04: ['subtitle'],
      KP05: ['author'], KP06: ['description1', 'description2'], KP07: ['errorCopy', 'errorReason'],
      KP08: ['asset1', 'asset2', 'asset3'], KP09: ['rightsStatus', 'rightsEvidence', 'rightsAction'],
      KP10: ['aiA', 'aiB'], KP11: ['aiImage', 'aiNext'], KP12: ['version', 'reviewRecord'],
      KP13: ['tocIssue'], KP14: ['fontSize', 'reflowDecision'], KP15: ['previewDevice', 'imageIssue'],
      KP16: ['fixedVersion', 'imageStatus'], KP17: ['transferTitle', 'transferSubtitle', 'transferAuthor', 'transferDescription', 'transferDecision', 'transferReason', 'transferOpen'],
      KP18: ['doneItems', 'openItems', 'finalStatus']
    };
    const rules = {};
    const exact = (code, key, expected) => rules[code] = {kind: 'auto', fields: [key], test: s => normalize(s.values[key]) === normalize(expected)};
    const self = (code, keys, test) => rules[code] = {kind: 'self', fields: keys || [], test: test || (() => true)};
    self('KP01.1'); exact('KP01.2', 'scope', '출판 준비 초안'); exact('KP01.3', 'goal', '점검 기록 묶음');
    self('KP02.1'); exact('KP02.2', 'language', g.language); exact('KP02.3', 'languageDate', lesson.verification.checkedAt);
    self('KP03.1'); exact('KP03.2', 'title', g.title); self('KP03.3', ['title'], s => normalize(s.values.title) === g.title);
    self('KP04.1'); exact('KP04.2', 'subtitle', g.subtitle); self('KP04.3', ['subtitle'], s => normalize(s.values.subtitle) === g.subtitle);
    self('KP05.1'); exact('KP05.2', 'author', g.author); self('KP05.3', ['author'], s => normalize(s.values.author) === g.author);
    exact('KP06.1', 'description1', first); exact('KP06.2', 'description2', second);
    self('KP06.3', ['description1', 'description2'], s => normalize(s.values.description1 + ' ' + s.values.description2) === normalize(g.description));
    self('KP07.1'); exact('KP07.2', 'errorCopy', g.description); exact('KP07.3', 'errorReason', '원고에 없는 결과 약속');
    exact('KP08.1', 'asset1', '영어 본문 / 가상 저자 직접 작성'); exact('KP08.2', 'asset2', '표지 사진 / 출처 미확인'); exact('KP08.3', 'asset3', '내부 화분 그림 / AI 생성');
    exact('KP09.1', 'rightsStatus', '미확인'); exact('KP09.2', 'rightsEvidence', '출처와 이용 허락 범위'); exact('KP09.3', 'rightsAction', '사용 보류');
    self('KP10.1'); exact('KP10.2', 'aiA', 'AI 보조'); exact('KP10.3', 'aiB', 'AI 생성');
    self('KP11.1'); exact('KP11.2', 'aiImage', 'AI 생성'); exact('KP11.3', 'aiNext', '최신 AI 생성 신고 항목 확인');
    self('KP12.1'); exact('KP12.2', 'version', 'balcony_v01.epub'); exact('KP12.3', 'reviewRecord', 'balcony_v01.epub / 모형 검토');
    rules['KP13.1'] = {kind: 'auto', fields: ['tocVisits'], test: s => s.tocVisits.includes('Choosing Pots')};
    rules['KP13.2'] = {kind: 'auto', fields: ['tocVisits'], test: s => s.tocVisits.includes('Watering Record')};
    self('KP13.3', ['tocIssue'], s => !!normalize(s.values.tocIssue) && s.tocVisits.includes('Watering Record'));
    exact('KP14.1', 'fontSize', '크게'); self('KP14.2', ['fontSize'], s => s.values.fontSize === '크게'); exact('KP14.3', 'reflowDecision', '줄바꿈 변경만으로는 오류 아님');
    exact('KP15.1', 'previewDevice', '휴대폰 카드'); self('KP15.2', ['previewDevice'], s => s.values.previewDevice === '휴대폰 카드');
    exact('KP15.3', 'imageIssue', '그림 1 / 휴대폰 모형 / 설명 글씨 식별 어려움');
    exact('KP16.1', 'fixedVersion', 'balcony_v02.epub');
    rules['KP16.2'] = {kind: 'auto', fields: ['fixedVersion', 'fixedArrival'], test: s => s.values.fixedVersion === 'balcony_v02.epub' && s.fixedArrival === 'Watering Record'};
    exact('KP16.3', 'imageStatus', '실제 검토 대기');
    exact('KP17.1', 'transferTitle', t.title); exact('KP17.2', 'transferAuthor', t.author);
    self('KP17.3', ['transferDescription', 'transferReason', 'transferOpen', 'transferSubtitle'], s => !!normalize(s.values.transferDescription) && !!normalize(s.values.transferReason) && !!normalize(s.values.transferOpen) && normalize(s.values.transferSubtitle) === t.subtitle);
    exact('KP17.4', 'transferDecision', t.expectedStatus);
    exact('KP18.1', 'doneItems', '메타데이터 초안·자료 목록·AI 경위·모형 검토');
    exact('KP18.2', 'openItems', '표지 권리·실제 EPUB 미리보기·최신 정책 재확인'); exact('KP18.3', 'finalStatus', lesson.snapshots.final.decision);
    const all = lesson.steps.flatMap(s => s.microActions);
    if (all.length !== 55 || Object.keys(rules).length !== all.length || all.some(a => !rules[a.code])) throw new Error('출판 행동 계약이 바뀌었습니다. 엔진 매핑 검토가 필요합니다.');
    function initialState() {
      return {values: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.initial])),
        self: {}, confirmed: {}, hints: {}, answers: {}, transfer: {}, transferChecked: {},
        tocVisits: [], tocArrival: '', fixedArrival: '', independentAttempts: [], independentSubmitted: false};
    }
    function evaluate(state, code) {
      const rule = rules[code];
      if (!rule) return {ok: false, kind: 'unknown', ready: false};
      const ready = !!rule.test(state);
      return {kind: rule.kind, ready, ok: ready && (rule.kind !== 'self' || state.self[code] === true)};
    }
    function setValue(state, key, value) {
      if (!fields[key]) throw new Error('Unknown field');
      state.values[key] = String(value).slice(0, 5000);
      for (const [code, rule] of Object.entries(rules)) if (rule.fields.includes(key)) {
        delete state.confirmed[code]; delete state.self[code];
      }
      if (key === 'fixedVersion') {state.fixedArrival = ''; delete state.confirmed['KP16.2'];}
      if (key.startsWith('transfer')) state.independentSubmitted = false;
    }
    function visitToc(state, item, fixed) {
      if (!g.content.includes(item)) throw new Error('Unknown TOC item');
      if (fixed) {
        if (!state.values.fixedVersion) return false;
        state.fixedArrival = item === 'Watering Record' && state.values.fixedVersion !== 'balcony_v02.epub' ? 'Observing Light' : item;
        delete state.confirmed['KP16.2'];
      } else {
        state.tocArrival = item === 'Watering Record' ? 'Observing Light' : item;
        if (!state.tocVisits.includes(item)) state.tocVisits.push(item);
      }
      return true;
    }
    function confirm(state, code) {
      const result = evaluate(state, code);
      if (result.ok) state.confirmed[code] = result.kind;
      else delete state.confirmed[code];
      return result;
    }
    function completed(state, code) {return !!state.confirmed[code] && evaluate(state, code).ok;}
    function parseRoute(hash) {
      const fallback = {step: 0, action: 0, valid: false};
      if (!hash || hash === '#kdp-preflight') return {...fallback, valid: true};
      for (let i = 0; i < lesson.steps.length; i++) {
        const step = lesson.steps[i];
        if (hash === '#kdp-preflight/' + step.id) return {step: i, action: 0, valid: true};
        const j = step.microActions.findIndex(a => a.deepLink === hash);
        if (j >= 0) return {step: i, action: j, valid: true};
      }
      return fallback;
    }
    function resetMission(state, step) {
      const blank = initialState();
      for (const key of controls[step.code]) setValue(state, key, blank.values[key]);
      for (const action of step.microActions) {delete state.self[action.code]; delete state.confirmed[action.code];}
      delete state.transfer[step.id]; delete state.transferChecked[step.id];
      if (step.code === 'KP13') {state.tocVisits = []; state.tocArrival = '';}
      if (step.code === 'KP16') state.fixedArrival = '';
      if (step.code === 'KP17') state.independentSubmitted = false;
    }
    function submitIndependent(state) {
      const required = ['transferTitle', 'transferAuthor', 'transferDescription', 'transferDecision', 'transferReason', 'transferOpen'];
      if (required.some(k => !normalize(state.values[k]))) return {submitted: false, message: '부제를 제외한 답안과 판단 이유·미해결 항목을 먼저 작성하세요.'};
      const attempt = {assisted: !!state.hints['kp-17'], values: Object.fromEntries(controls.KP17.map(k => [k, state.values[k]])), number: (state.independentAttempts.at(-1)?.number || 0) + 1};
      if(state.independentAttempts.length>=100)state.independentAttempts.shift();
      state.independentAttempts.push(attempt); state.independentSubmitted = true;
      for (const code of ['KP17.1', 'KP17.2', 'KP17.4']) confirm(state, code);
      // The first attempt keeps its original help status. Revealing examples means
      // any later attempt is assisted, including after undo/reset/reload.
      state.hints['kp-17'] = lesson.steps[16].hints.length + 1;
      return {submitted: true, attempt};
    }
    function persistentSnapshot(state, route, sourceSha256) {
      const hints = {};
      for (const step of lesson.steps) if (Number.isInteger(state.hints[step.id]) && state.hints[step.id] > 0) hints[step.id] = Math.min(state.hints[step.id], step.hints.length + 1);
      return {sourceSha256, route: parseRoute(route).valid ? route : lesson.steps[0].microActions[0].deepLink, hints};
    }
    function restoreState(raw) {
      if(!raw||typeof raw!=='object')throw Error('저장 상태');
      const state=initialState(), codes=Object.keys(rules), ids=lesson.steps.map(s=>s.id);
      for(const [key,field] of Object.entries(fields)){const value=raw.values?.[key];if(typeof value!=='string'||value.length>5000||(field.type==='select'&&value!==''&&!field.options.includes(value)))throw Error('입력 형식');state.values[key]=value;}
      for(const code of codes)state.self[code]=raw.self?.[code]===true;
      for(const step of lesson.steps){const n=raw.hints?.[step.id]||0;if(!Number.isInteger(n)||n<0||n>step.hints.length+1)throw Error('힌트 형식');state.hints[step.id]=n;state.answers[step.id]=raw.answers?.[step.id]===true;const text=raw.transfer?.[step.id]||'';if(typeof text!=='string'||text.length>5000)throw Error('새 조건 답안');state.transfer[step.id]=text;state.transferChecked[step.id]=raw.transferChecked?.[step.id]===true;}
      if(!Array.isArray(raw.tocVisits)||raw.tocVisits.length>g.content.length||raw.tocVisits.some(x=>!g.content.includes(x)))throw Error('목차 기록');state.tocVisits=[...new Set(raw.tocVisits)];
      for(const key of ['tocArrival','fixedArrival']){if(raw[key]!==''&&!g.content.includes(raw[key]))throw Error('도착 기록');state[key]=raw[key];}
      if(!Array.isArray(raw.independentAttempts)||raw.independentAttempts.length>100)throw Error('제출 기록');
      state.independentAttempts=raw.independentAttempts.map((a,i)=>{if(!a||!Number.isSafeInteger(a.number)||a.number<1)throw Error('시도 번호');const values={};for(const key of controls.KP17){const value=a.values?.[key];if(typeof value!=='string'||value.length>5000)throw Error('제출 답안');values[key]=value;}return {number:a.number,assisted:a.assisted===true,values};});
      state.independentSubmitted=raw.independentSubmitted===true&&state.independentAttempts.length>0;
      for(const code of codes)if(raw.confirmed?.[code]===rules[code].kind&&evaluate(state,code).ok)state.confirmed[code]=rules[code].kind;
      return state;
    }
    return {fields, controls, rules, initialState, evaluate, setValue, visitToc, confirm, completed, parseRoute, resetMission, submitIndependent, persistentSnapshot, restoreState};
  }
  return {createModel, normalize, clone};
});
