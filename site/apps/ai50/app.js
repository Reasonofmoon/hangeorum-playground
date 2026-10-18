const C = window.CostCore, $ = (id) => document.getElementById(id);
const LS = 'tutorial-platform-v7:practice:ai50';
const PALETTE = ['#14a098', '#f08a3c', '#3c7dd9', '#9b59b6', '#e0b400', '#2e9e5b', '#d9534f', '#8a94a6'];
const EXAMPLE_PRICES = [ // 가짜 모델 전용 연습 값 (실제 가격 아님)
  { provider: '예시클라우드', model: 'ex-chat-large', inPer1M: 2.5, outPer1M: 10 },
  { provider: '예시클라우드', model: 'ex-chat-mini', inPer1M: 0.15, outPer1M: 0.6 },
  { provider: '가나다AI', model: 'gana-pro', inPer1M: 1, outPer1M: 4 },
  { provider: '가나다AI', model: 'gana-lite', inPer1M: 0.1, outPer1M: 0.4 },
];
const freshState = () => ({ sources: [], prices: [], budget: '', cur: 'USD', mappings: Object.create(null) });
let state = freshState();
let pending = [];
let restoreError = ''; let restoredSelection = null; let restoredDraft = null; let readyToSave = false; let resetting = false;
let runnerState = {status:'pending', message:'예제나 CSV를 불러온 뒤 현재 계산 검사를 누르세요.'};
let checkedInput = null;
function runnerSnapshot() { return JSON.stringify([settingsValue(), state.sources.map(s=>[s.name,s.content,s.mapping]), pending.map(s=>[s.name,s.content,s.mapping]), ...[...document.querySelectorAll('input:not([type=file]),select')].map(e=>[e.id,e.dataset.i,e.dataset.k,e.value])]); }
function setRunnerState(status, message) { runnerState = {status, message}; checkedInput = runnerSnapshot(); $('runnerStatus').textContent = message; return {...runnerState}; }
function invalidateRunner() { runnerState = {status:'pending', message:'입력 또는 자료가 바뀌었습니다. 현재 계산 검사를 다시 누르세요.'}; checkedInput = null; $('runnerStatus').textContent = runnerState.message; }
function runnerGetState() { if (checkedInput !== null && checkedInput !== runnerSnapshot()) invalidateRunner(); return {...runnerState}; }
function settingsValue() { return {prices:state.prices,budget:state.budget,cur:state.cur,mappings:state.mappings}; }
function draftSnapshot(field) {
  if (!field || !field.matches('input')) return null;
  if (field.closest('#priceTable') && ['provider','model','inPer1M','outPer1M'].includes(field.dataset.k)) return {target:'price',index:Number(field.dataset.i),key:field.dataset.k,value:field.value};
  if (field.closest('#mapping') && field.dataset.k === 'providerFixed') return {target:'mapping',index:[...document.querySelectorAll('#mapping .map')].indexOf(field.closest('.map')),key:'providerFixed',value:field.value};
  if (['cur','asOf'].includes(field.id)) return {target:'field',key:field.id,value:field.value};
  return null;
}
function restoreDraft(draft) {
  if (!draft || typeof draft.value !== 'string') return;
  let field;
  if (draft.target === 'price' && Number.isInteger(draft.index) && draft.index >= 0 && ['provider','model','inPer1M','outPer1M'].includes(draft.key)) field = $('priceTable').querySelector(`input[data-i="${draft.index}"][data-k="${draft.key}"]`);
  if (draft.target === 'mapping' && Number.isInteger(draft.index) && draft.index >= 0 && draft.key === 'providerFixed') field = document.querySelectorAll('#mapping .map')[draft.index]?.querySelector('[data-k="providerFixed"]');
  if (draft.target === 'field' && ['cur','asOf'].includes(draft.key)) field = $(draft.key);
  if (field) { field.value = draft.value; field.dataset.runnerDraft = 'true'; field.focus({preventScroll:true}); $('runnerStatus').textContent='편집 중이던 입력까지 복원했습니다. 현재 계산 검사를 누르면 입력을 반영하고 다시 검사합니다.'; }
}
function readSource(v, pendingItem = false) {
  if (!v || typeof v.name !== 'string' || typeof v.content !== 'string' || !v.mapping || typeof v.mapping !== 'object') throw new Error('저장된 CSV 형식 오류');
  const parsed = C.parseCSV(v.content), sig = parsed.headers.join('|');
  if (!parsed.headers.length || ['date','provider','model','input','output'].some(k => !Number.isInteger(v.mapping[k]) || v.mapping[k] < -1 || v.mapping[k] >= parsed.headers.length) || typeof v.mapping.providerFixed !== 'string' || !['auto','ymd','mdy','dmy','epoch'].includes(v.mapping.dateFmt)) throw new Error('저장된 열 맞춤 오류');
  const n = C.normalize(parsed,v.mapping,v.name);
  if (!pendingItem && n.mappingErrors.length) throw new Error(n.mappingErrors.join(' '));
  return pendingItem ? {id:Date.now()+Math.random(),name:v.name,content:v.content,parsed,sig,mapping:{...v.mapping},remembered:true} : {name:v.name,content:v.content,mapping:{...v.mapping},rows:n.rows,errors:n.errors};
}
try {
  const raw=localStorage.getItem(LS);
  if(raw) {
    const v=JSON.parse(raw); if(v.version!==7) throw new Error('저장 버전 오류');
    const checked=C.validateSettings(v.settings); if(checked.errors.length) throw new Error(checked.errors.join(' '));
    if(!Array.isArray(v.sources)||!Array.isArray(v.pending)) throw new Error('저장된 목록 오류');
    const sources=v.sources.map(s=>readSource(s)), waiting=v.pending.map(s=>readSource(s,true));
    if(v.selection && (typeof v.selection.month!=='string'||typeof v.selection.asOf!=='string')) throw new Error('저장된 기간 오류');
    state={...freshState(),...checked.value,sources}; pending=waiting; restoredSelection=v.selection; restoredDraft=v.draft;
  }
} catch(err) { restoreError='저장된 실습을 적용하지 않았습니다: '+err.message; }
function save(draftNode = document.activeElement) {
  if(!readyToSave||resetting) return;
  invalidateRunner();
  try {
    const sources=state.sources.map(s=>({name:s.name,content:s.content,mapping:s.mapping}));
    const waiting=pending.map(s=>({name:s.name,content:s.content,mapping:s.mapping}));
    localStorage.setItem(LS,JSON.stringify({version:7,settings:settingsValue(),sources,pending:waiting,selection:{month:$('month').value,asOf:$('asOf').value},draft:draftSnapshot(draftNode)}));
    $('persistenceStatus').textContent='현재 실습 입력을 이 브라우저에 저장했습니다. 설정 JSON에는 가격·예산·열 맞춤만 포함되며 CSV 본문은 포함되지 않습니다.';
  } catch { $('persistenceStatus').textContent='브라우저 저장에 실패했습니다. CSV와 설정 JSON을 내려받아 보관하세요.'; }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + esc(state.cur);
const big = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
$('cur').value = state.cur; $('budget').value = state.budget;
const status = (id, message, error = false) => { $(id).textContent = message; $(id).className = error ? 'note err' : 'note'; };
if (restoreError) status('settingsStatus', restoreError, true);

// ---------- 1. 불러오기 + 열 맞추기 ----------
$('files').addEventListener('change', async (e) => { for (const f of e.target.files) addPending(f.name, await f.text()); e.target.value = ''; });
$('sampleA').addEventListener('click', () => addPending('example-cloud-usage.csv', window.SAMPLES['example-cloud-usage.csv'], '예시클라우드'));
$('sampleB').addEventListener('click', () => addPending('ganada-ai-daily.csv', window.SAMPLES['ganada-ai-daily.csv'], '가나다AI'));

function addPending(name, text, providerHint) {
  const parsed = C.parseCSV(text);
  if (!parsed.headers.length) { status('loadStatus', name + ': 머리글을 찾지 못했습니다. CSV 첫 줄을 확인하세요.', true); return; }
  const sig = parsed.headers.join('|');
  const m = state.mappings[sig] || { ...C.guessMapping(parsed.headers), providerFixed: providerHint || name.replace(/\.[^.]+$/, ''), dateFmt: 'auto' };
  if (state.sources.some((s) => s.name !== name && s.content === text)) { status('loadStatus', name + ': 같은 내용의 CSV가 이미 적용되어 추가하지 않았습니다.', true); return; }
  pending = pending.filter((p) => p.name !== name);
  pending.push({ id: Date.now() + Math.random(), name, parsed, mapping: { ...m }, sig, content: text, remembered: !!state.mappings[sig] });
  status('loadStatus', state.sources.some((s) => s.name === name) ? name + ': 적용하면 같은 이름의 기존 파일을 교체합니다.' : name + ': 필수 열과 미리 보기를 확인한 뒤 적용하세요.');
  renderMapping();
}
function renderMapping() {
  $('mapping').innerHTML = pending.map((p) => {
    const opt = (sel, allowNone = true) => (allowNone ? `<option value="-1"${sel < 0 ? ' selected' : ''}>(없음)</option>` : '') + p.parsed.headers.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h)}</option>`).join('');
    const prev = C.normalize({ headers: p.parsed.headers, rows: p.parsed.rows.slice(0, 5) }, p.mapping, p.name);
    return `<div class="map" data-id="${p.id}">
      <b>${esc(p.name)}</b> <span class="muted">${p.parsed.rows.length}행 · 머리글 ${p.parsed.headers.length}개${p.remembered ? ' · 지난번 맞춤 그대로' : ' · 자동 짐작'}</span>
      <div class="grid" style="margin-top:8px">
        <label>날짜 열 (필수)<select data-k="date">${opt(p.mapping.date)}</select></label>
        <label>날짜 형식<select data-k="dateFmt">${['auto', 'ymd', 'mdy', 'dmy', 'epoch'].map((f) => `<option${f === p.mapping.dateFmt ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
        <label>제공자 열 (없으면 아래 고정 값)<select data-k="provider">${opt(p.mapping.provider)}</select></label>
        <label>제공자 고정 값<input type="text" data-k="providerFixed" value="${esc(p.mapping.providerFixed)}"></label>
        <label>모델 열<select data-k="model">${opt(p.mapping.model)}</select></label>
        <label>입력 토큰 열 (필수)<select data-k="input">${opt(p.mapping.input)}</select></label>
        <label>출력 토큰 열 (필수)<select data-k="output">${opt(p.mapping.output)}</select></label>
      </div>
      <table style="margin-top:8px"><tr><th>날짜</th><th>제공자</th><th>모델</th><th class="num">입력</th><th class="num">출력</th></tr>
      ${prev.rows.map((r) => `<tr><td>${r.date}</td><td>${esc(r.provider)}</td><td>${esc(r.model)}</td><td class="num">${r.input.toLocaleString()}</td><td class="num">${r.output.toLocaleString()}</td></tr>`).join('')}
      ${prev.errors.map((e) => `<tr><td colspan="5" class="err">${e.line}번째 레코드: ${esc(e.reason)} (${esc(e.value)})</td></tr>`).join('')}</table>
      ${prev.mappingErrors.length ? `<p class="err">${prev.mappingErrors.map(esc).join(' ')}</p>` : ''}
      <div class="row"><button class="o" data-act="apply"${prev.mappingErrors.length ? ' disabled' : ''}>적용</button><button class="g" data-act="cancel">취소</button></div></div>`;
  }).join('');
  save();
}
$('mapping').addEventListener('change', (e) => {
  const box = e.target.closest('.map'); if (!box) return;
  const p = pending.find((x) => String(x.id) === box.dataset.id); const k = e.target.dataset.k;
  p.mapping[k] = ['providerFixed', 'dateFmt'].includes(k) ? e.target.value : Number(e.target.value);
  renderMapping();
});
$('mapping').addEventListener('click', (e) => {
  const act = e.target.dataset.act; if (!act) return;
  const box = e.target.closest('.map'); const p = pending.find((x) => String(x.id) === box.dataset.id);
  if (act === 'apply') {
    const res = C.normalize(p.parsed, p.mapping, p.name);
    if (res.mappingErrors.length) { status('loadStatus', res.mappingErrors.join(' '), true); return; }
    if (state.sources.some((s) => s.name !== p.name && s.content === p.content)) { status('loadStatus', p.name + ': 같은 내용의 CSV가 이미 적용되어 추가하지 않았습니다.', true); pending = pending.filter((x) => x !== p); renderMapping(); return; }
    state.mappings[p.sig] = { ...p.mapping }; save();
    const replacement = state.sources.findIndex((s) => s.name === p.name);
    const source = { name: p.name, content: p.content, mapping: {...p.mapping}, rows: res.rows, errors: res.errors };
    if (replacement >= 0) state.sources[replacement] = source; else state.sources.push(source);
    status('loadStatus', `${p.name}: ${replacement >= 0 ? '기존 파일 교체' : '적용'} · 유효 ${res.rows.length}행 · 제외 ${res.errors.length}행.`, res.errors.length > 0);
    ensurePriceRows();
  }
  pending = pending.filter((x) => x !== p);
  renderMapping(); refresh();
});
function renderSources() {
  $('sources').innerHTML = state.sources.map((s, i) => `<div><span class="src">${esc(s.name)}: ${s.rows.length}행${s.errors.length ? ` <span class="err">(제외 ${s.errors.length}행)</span>` : ''}<button data-i="${i}">빼기</button></span>${s.errors.length ? `<details><summary class="err">제외 ${s.errors.length}행의 이유 보기</summary><p class="muted">번호는 머리글을 포함한 논리 CSV 레코드 순서입니다. 따옴표 안 줄바꿈이 있으면 파일의 물리 줄 번호와 다릅니다.</p><ul>${s.errors.map((e) => `<li>${e.line}번째 레코드: ${esc(e.reason)} (${esc(e.value)})</li>`).join('')}</ul></details>` : ''}</div>`).join('');
}
$('sources').addEventListener('click', (e) => { if (e.target.dataset.i == null) return; state.sources.splice(Number(e.target.dataset.i), 1); refresh(); });
const allRows = () => state.sources.flatMap((s) => s.rows);
$('resetAll').addEventListener('click', () => {
  invalidateRunner();
  resetting = true; state = freshState(); pending = []; last = null;
  let message = 'AI50의 v7 사용량, 대기 파일, 가격표, 예산, 열 맞춤, 검사 결과를 초기화했습니다. 다른 실습과 v6 기록은 유지됩니다.';
  try { localStorage.removeItem(LS); } catch { message += ' 브라우저 저장소 삭제에 실패했습니다.'; }
  $('cur').value = 'USD'; $('budget').value = ''; $('asOf').value = ''; $('files').value = ''; $('impSettings').value = '';
  status('settingsStatus', ''); status('loadStatus', message); renderMapping(); refresh(); resetting = false; $('persistenceStatus').textContent='저장된 실습 입력을 초기화했습니다.';
});

// ---------- 2. 가격표 ----------
function ensurePriceRows() {
  const have = new Set(state.prices.map((p) => p.provider + '\u0001' + p.model));
  for (const r of allRows()) { const k = r.provider + '\u0001' + r.model; if (!have.has(k)) { have.add(k); state.prices.push({ provider: r.provider, model: r.model, inPer1M: '', outPer1M: '' }); } }
  save();
}
function renderPrices(missing) {
  const miss = new Set(missing.map((m) => m.provider + '\u0001' + m.model));
  $('priceTable').innerHTML = `<tr><th>제공자</th><th>모델</th><th class="num">입력 100만 토큰당</th><th class="num">출력 100만 토큰당</th><th></th></tr>` +
    state.prices.map((p, i) => `<tr class="${miss.has(p.provider + '\u0001' + p.model) ? 'miss' : ''}"><td><input aria-label="가격 ${i+1} 제공자" type="text" data-i="${i}" data-k="provider" value="${esc(p.provider)}"></td><td><input aria-label="가격 ${i+1} 모델" type="text" data-i="${i}" data-k="model" value="${esc(p.model)}"></td>
      <td class="num"><input aria-label="가격 ${i+1} 입력 100만 토큰당" type="number" step="any" min="0" data-i="${i}" data-k="inPer1M" value="${esc(p.inPer1M)}"></td><td class="num"><input aria-label="가격 ${i+1} 출력 100만 토큰당" type="number" step="any" min="0" data-i="${i}" data-k="outPer1M" value="${esc(p.outPer1M)}"></td>
      <td>${miss.has(p.provider + '\u0001' + p.model) ? '<span class="err">가격 없음/오류: 비용 합계에서 제외</span>' : ''} <button class="g" data-del="${i}">삭제</button></td></tr>`).join('');
}
$('priceTable').addEventListener('change', (e) => {
  const i = e.target.dataset.i; if (i == null) return; const k = e.target.dataset.k;
  const numeric = ['inPer1M', 'outPer1M'].includes(k);
  const value = numeric ? C.amount(e.target.value) : e.target.value.trim();
  if (numeric && (value === null || e.target.validity?.badInput)) { status('settingsStatus', '가격은 0 이상 유한한 숫자로 입력하세요. 이전 값을 유지했습니다.', true); refresh(); return; }
  const candidate = { ...state, prices: state.prices.map((p, n) => n === Number(i) ? { ...p, [k]: value } : p) };
  const checked = C.validateSettings(candidate);
  if (checked.errors.length) { status('settingsStatus', '이전 가격표를 유지했습니다: ' + checked.errors.join(' '), true); refresh(); return; }
  state.prices = checked.value.prices;
  status('settingsStatus', '가격표를 반영했습니다. 빈 가격은 비용 합계에서 제외합니다.');
  save(); refresh();
});
$('priceTable').addEventListener('click', (e) => { if (e.target.dataset.del == null) return; state.prices.splice(Number(e.target.dataset.del), 1); save(); refresh(); });
$('addPrice').addEventListener('click', () => { state.prices.push({ provider: '', model: '', inPer1M: '', outPer1M: '' }); save(); refresh(); });
$('fillExample').addEventListener('click', () => {
  for (const ex of EXAMPLE_PRICES) { const p = state.prices.find((x) => x.provider === ex.provider && x.model === ex.model); if (p) { p.inPer1M = ex.inPer1M; p.outPer1M = ex.outPer1M; } else state.prices.push({ ...ex }); }
  save(); refresh();
});
$('cur').addEventListener('change', () => { state.cur = $('cur').value.trim() || 'USD'; save(); refresh(); });
$('expSettings').addEventListener('click', () => download('ai-cost-settings.json', JSON.stringify({ prices: state.prices, budget: state.budget, cur: state.cur, mappings: state.mappings }, null, 2), 'application/json'));
$('impSettings').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const v = C.validateSettings(JSON.parse(await f.text())); if (v.errors.length) throw new Error(v.errors.join(' ')); Object.assign(state, v.value); $('cur').value = state.cur; $('budget').value = state.budget; ensurePriceRows(); save(); refresh(); status('settingsStatus', '설정을 검증하여 가져왔습니다. 사용량은 그대로 유지했습니다.'); }
  catch (err) { status('settingsStatus', '설정을 적용하지 않았습니다. 이전 상태를 유지합니다: ' + err.message, true); }
  e.target.value = '';
});

// ---------- 3. 대시보드 ----------
$('budget').addEventListener('input', () => { const v = C.amount($('budget').value); if (v === null || $('budget').validity?.badInput) { status('settingsStatus', '예산은 0 이상 유한한 숫자로 입력하세요. 이전 값을 유지했습니다.', true); $('budget').value = state.budget; return; } state.budget = v; save(); refresh(); });
$('month').addEventListener('change', () => { $('asOf').value = ''; refresh(); });
$('asOf').addEventListener('change', refresh);
let last = null;
function refresh() {
  renderSources();
  const rows = allRows();
  const agg = C.aggregate(rows, state.prices); last = agg;
  renderPrices(agg.missing);
  const months = agg.months.map((m) => m.month);
  const cur = $('month').value;
  $('month').innerHTML = months.map((m) => `<option${m === cur ? ' selected' : ''}>${m}</option>`).join('');
  if (!months.includes(cur) && months.length) { $('month').value = months[months.length - 1]; $('asOf').value = ''; }
  const month = $('month').value;
  if (!month) { $('alert').className = 'alert none'; $('alert').textContent = '데이터를 불러오면 계산합니다.'; for (const id of ['cards','chartMonthly','chartDaily','modelTable','legend','monthlyCoverage','periodStatus']) $(id).innerHTML = ''; save(); return; }
  const asOf = $('asOf').value || null;
  let f;
  try { f = C.forecast(agg.days, month, asOf); }
  catch (err) { $('alert').className = 'alert over'; $('alert').textContent = err.message; $('cards').innerHTML = ''; $('chartDaily').innerHTML = ''; $('modelTable').innerHTML = ''; $('periodStatus').textContent = '기준일을 수정하면 선택 기간의 계산을 다시 표시합니다.'; drawMonthly(agg, Number(state.budget)); save(); return; }
  if (!asOf) $('asOf').value = f.asOf;
  const budget = Number(state.budget);
  const st = C.budgetStatus(f, budget);
  $('alert').className = 'alert ' + st.level;
  const selected = C.aggregate(C.rowsThrough(rows, month, f.asOf), state.prices);
  $('alert').textContent = (selected.missing.length ? `이 기간의 가격 없음/오류 ${selected.missing.length}개 모델, ${selected.excludedRows}행은 비용 합계에서 제외했습니다. 아래 수치는 부분 합계입니다. ` : '') + st.text;
  $('periodStatus').textContent = `카드·모델 표·일별 차트: ${month}-01 ~ ${f.asOf}. 유효 ${selected.models.reduce((n,m) => n+m.requests,0)}행 중 가격 없음/오류 ${selected.excludedRows}행 비용 제외. 기록이 없는 날의 사용량은 확인되지 않으며 예측은 월초부터 기준일까지의 달력 일수로 나눕니다.`;
  $('modelHeading').textContent = `모델별 (${month}-01 ~ ${f.asOf})`;
  $('cards').innerHTML = `<div><small>${month} 쓴 돈 (${f.asOf.slice(5)}까지)</small><b>${money(f.spent)}</b></div>
    <div><small>하루 평균 (${f.elapsed}일)</small><b>${money(f.perDay)}</b></div>
    <div><small>월말 예상 (${f.totalDays}일)</small><b>${money(f.projected)}</b></div>
    <div><small>예산 대비</small><b>${budget > 0 ? (f.projected / budget * 100).toFixed(0) + '% 예상' : '예산 없음'}</b></div>`;
  drawMonthly(agg, budget); drawDaily(agg, f, budget);
  const ms = selected.models; const tot = ms.reduce((s, m) => s + m.cost, 0);
  $('modelTable').innerHTML = `<tr><th>제공자</th><th>모델</th><th class="num">기록 수</th><th class="num">입력 토큰</th><th class="num">출력 토큰</th><th class="num">비용</th><th class="num">비중</th></tr>` +
    ms.map((m) => `<tr class="${m.priced ? '' : 'miss'}"><td>${esc(m.provider)}</td><td>${esc(m.model)}</td><td class="num">${m.requests}</td><td class="num">${m.input.toLocaleString()}</td><td class="num">${m.output.toLocaleString()}</td><td class="num">${m.priced ? money(m.cost) : '<span class="err">가격 없음</span>'}</td><td class="num">${tot > 0 ? (m.cost / tot * 100).toFixed(1) + '%' : '-'}</td></tr>`).join('') +
    `<tr><th colspan="5">${selected.excludedRows ? '가격 확인된 부분 합계' : '합계'}</th><th class="num">${money(tot)}</th><th></th></tr>`;
  save();
}

function seriesColors(agg) { const names = [...new Set(agg.months.flatMap((m) => [...m.series.keys()]))].sort(); return new Map(names.map((n, i) => [n, PALETTE[i % PALETTE.length]])); }
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const s of [1, 2, 2.5, 5, 10]) if (s * p >= v) return s * p; return 10 * p; }
function drawMonthly(agg, budget) {
  const W = 560, H = 300, L = 62, R = 16, T = 30, B = 40; const colors = seriesColors(agg);
  const max = niceMax(Math.max(budget > 0 ? budget : 0, ...agg.months.map((m) => m.cost)) * 1.1);
  const y = (v) => T + (H - T - B) * (1 - v / max); const n = agg.months.length; const bw = Math.min(70, (W - L - R) / n * 0.6);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif" font-size="12">`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#eee6da"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#6b7686">${v.toFixed(v < 10 ? 1 : 0)}</text>`; }
  agg.months.forEach((m, i) => {
    const cx = L + (W - L - R) * (i + 0.5) / n; let acc = 0;
    for (const [name, v] of [...m.series.entries()].sort()) { const y0 = y(acc), y1 = y(acc + v); s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${colors.get(name)}"><title>${esc(name)}: ${v.toFixed(2)}</title></rect>`; acc += v; }
    s += `<text x="${cx}" y="${y(acc) - 5}" text-anchor="middle" font-weight="700" fill="#22324a">${acc.toFixed(2)}</text><text x="${cx}" y="${H - B + 18}" text-anchor="middle" fill="#22324a">${m.month}</text>`;
  });
  if (budget > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(budget)}" y2="${y(budget)}" stroke="#d9534f" stroke-width="2" stroke-dasharray="6 4"/><text x="${W - R}" y="${y(budget) - 5}" text-anchor="end" fill="#d9534f" font-weight="700">예산 ${budget}</text>`;
  s += `<text x="10" y="17" fill="#6b7686">단위: ${esc(state.cur)}</text></svg>`;
  $('chartMonthly').innerHTML = s;
  $('legend').innerHTML = [...colors.entries()].map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('');
  $('monthlyCoverage').innerHTML = '월별 차트는 불러온 각 달 전체 기록입니다. 기간·기록일 수가 다르면 총액을 같은 기간의 비용처럼 비교하지 마세요.<br>' + agg.months.map((m) => `${m.month}: ${m.firstDate} ~ ${m.lastDate}, 기록 ${m.observedDays}일${m.excludedRows ? ` · 가격 없음/오류 ${m.excludedRows}행 비용 제외` : ''}`).join('<br>');
}
function drawDaily(agg, f, budget) {
  const W = 560, H = 300, L = 62, R = 16, T = 30, B = 40; const N = f.totalDays;
  const days = agg.days.filter((d) => d.date.startsWith(f.month) && d.date <= f.asOf);
  const cum = []; let acc = 0; for (let d = 1; d <= Number(f.asOf.slice(8)); d++) { const key = f.month + '-' + String(d).padStart(2, '0'); acc += (days.find((x) => x.date === key)?.cost || 0); cum.push([d, acc]); }
  const max = niceMax(Math.max(f.projected, budget > 0 ? budget : 0, acc) * 1.1);
  const x = (d) => L + (W - L - R) * (d - 1) / (N - 1), y = (v) => T + (H - T - B) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif" font-size="12">`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#eee6da"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#6b7686">${v.toFixed(v < 10 ? 1 : 0)}</text>`; }
  for (const d of [1, 5, 10, 15, 20, 25, N]) s += `<text x="${x(d)}" y="${H - B + 18}" text-anchor="middle" fill="#6b7686">${d}일</text>`;
  if (budget > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(budget)}" y2="${y(budget)}" stroke="#d9534f" stroke-width="2" stroke-dasharray="6 4"/><text x="${L + 4}" y="${y(budget) - 5}" fill="#d9534f" font-weight="700">예산 ${budget}</text>`;
  if (cum.length) {
    s += `<polyline fill="none" stroke="#14a098" stroke-width="3" points="${cum.map(([d, v]) => `${x(d)},${y(v)}`).join(' ')}"/>`;
    s += `<line x1="${x(cum.length)}" y1="${y(acc)}" x2="${x(N)}" y2="${y(f.projected)}" stroke="#f08a3c" stroke-width="2.5" stroke-dasharray="7 5"/>`;
    s += `<circle cx="${x(cum.length)}" cy="${y(acc)}" r="4.5" fill="#14a098"/><circle cx="${x(N)}" cy="${y(f.projected)}" r="4.5" fill="#f08a3c"/>`;
    s += `<text x="${x(N) - 4}" y="${y(f.projected) - 8}" text-anchor="end" fill="#b85c00" font-weight="700">예상 ${f.projected.toFixed(2)}</text>`;
    s += `<text x="${x(cum.length)}" y="${y(acc) + 18}" text-anchor="middle" fill="#0d7d77" font-weight="700">${acc.toFixed(2)}</text>`;
    if (budget > 0 && f.projected > budget && acc < budget) { const dHit = cum.length + (budget - acc) / Math.max(f.perDay, 1e-9); s += `<circle cx="${x(dHit)}" cy="${y(budget)}" r="6" fill="none" stroke="#d9534f" stroke-width="2"/>`; }
  }
  s += `<text x="10" y="17" fill="#6b7686">단위: ${esc(state.cur)}</text></svg>`;
  $('chartDaily').innerHTML = s;
}

// ---------- 내보내기 ----------
function download(name, text, type = 'text/csv') {
  window.__lastExport = { name, text };
  const blob = new Blob([type === 'text/csv' ? '\uFEFF' + text : text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('expSummary').addEventListener('click', () => {
  if (!last) return;
  const rows = [['month', 'provider', 'model', 'input_tokens', 'output_tokens', 'cost', 'currency', 'priced', 'observed_start', 'observed_end', 'observed_days']];
  for (const m of last.models) { const coverage = last.months.find((x) => x.month === m.month); rows.push([m.month, m.provider, m.model, m.input, m.output, m.priced ? m.cost.toFixed(4) : '', state.cur, m.priced ? 'yes' : 'no', coverage.firstDate, coverage.lastDate, coverage.observedDays]); }
  download('ai-cost-summary.csv', C.toCSV(rows));
});
$('expRows').addEventListener('click', () => {
  const pm = C.priceMap(state.prices); const rows = [['date', 'provider', 'model', 'input_tokens', 'output_tokens', 'cost', 'source']];
  for (const r of allRows()) { const c = C.costOf(r, pm); rows.push([r.date, r.provider, r.model, r.input, r.output, c === null ? '' : c.toFixed(6), r.source]); }
  download('ai-usage-normalized.csv', C.toCSV(rows));
});
$('expSvg').addEventListener('click', () => {
  const a = $('chartMonthly').innerHTML.replace('<svg viewBox', '<svg x="0" y="0" width="560" height="300" viewBox');
  const b = $('chartDaily').innerHTML.replace('<svg viewBox', '<svg x="580" y="0" width="560" height="300" viewBox');
  download('ai-cost-charts.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="300">${a}${b}</svg>`, 'image/svg+xml');
});
refresh(); renderMapping();
if(restoredSelection) { if([...$('month').options].some(o=>o.value===restoredSelection.month)) $('month').value=restoredSelection.month; $('asOf').value=restoredSelection.asOf; refresh(); }
readyToSave = true;
restoreDraft(restoredDraft);

// 부모 플레이그라운드도 아래 API를 호출합니다. 통과 여부는 현재 CSV와 계산을 재검증합니다.
document.addEventListener('input', e => { invalidateRunner(); save(e.target); });
document.addEventListener('change', e => { delete e.target.dataset.runnerDraft; invalidateRunner(); }, true);
function checkRunner() {
  const invalid = [...document.querySelectorAll('input')].find(e => !e.checkValidity());
  if (invalid) return setRunnerState('pending', '입력 형식이나 범위를 확인하세요. 가격·예산은 0 이상 유한한 숫자여야 합니다.');
  // 복원된 편집 값을 먼저 검증합니다. change가 거절하여 이전 값으로 돌아가도 통과시켜서는 안 됩니다.
  const visiblePrices = state.prices.map(p => ({...p}));
  for (const field of $('priceTable').querySelectorAll('input[data-i][data-k]')) {
    const index = Number(field.dataset.i), key = field.dataset.k;
    if (visiblePrices[index] && ['provider','model','inPer1M','outPer1M'].includes(key)) visiblePrices[index][key] = ['inPer1M','outPer1M'].includes(key) ? C.amount(field.value) : field.value.trim();
  }
  const visibleSettings = C.validateSettings({...settingsValue(), prices:visiblePrices});
  if (visibleSettings.errors.length) return setRunnerState('pending', '현재 가격 입력을 수정하세요: ' + visibleSettings.errors.join(' '));
  const restored = document.querySelector('[data-runner-draft="true"]');
  if (restored) restored.dispatchEvent(new Event('change', {bubbles:true}));
  const active = document.activeElement;
  if (active && active.isConnected && active.matches('input:not([type=file]),select')) active.dispatchEvent(new Event('change', {bubbles:true}));
  if (pending.length) return setRunnerState('pending', `아직 적용하지 않은 CSV가 ${pending.length}개 있습니다. 열 맞춤을 확인한 뒤 적용하거나 취소하세요.`);
  if (!state.sources.length) return setRunnerState('pending', '먼저 예제 또는 CSV를 불러와 적용하세요.');
  const checked = C.validateSettings(settingsValue());
  if (checked.errors.length) return setRunnerState('pending', '설정 오류: ' + checked.errors.join(' '));
  const rows = [];
  for (const source of state.sources) {
    const normalized = C.normalize(C.parseCSV(source.content), source.mapping, source.name);
    if (normalized.mappingErrors.length || normalized.errors.length) return setRunnerState('pending', `${source.name}: 열 맞춤 오류 ${normalized.mappingErrors.length}개, 제외된 행 ${normalized.errors.length}개가 있습니다. 원본 CSV를 고쳐 같은 이름으로 다시 적용하세요.`);
    rows.push(...normalized.rows);
  }
  if (!rows.length) return setRunnerState('pending', '유효한 사용량 행이 없습니다. 날짜와 입력·출력 토큰을 확인하세요.');
  const agg = C.aggregate(rows, checked.value.prices);
  if (agg.missing.length || agg.excludedRows) return setRunnerState('pending', `가격이 없거나 계산할 수 없는 모델이 ${agg.missing.length}개 있습니다. 제외된 ${agg.excludedRows}행의 가격을 채우세요.`);
  if (!Number.isFinite(agg.total)) return setRunnerState('pending', '비용 합계가 표현 가능한 범위를 넘었습니다. 토큰과 가격을 줄이세요.');
  const month = $('month').value, asOf = $('asOf').value;
  let selected, forecast;
  try { selected = C.rowsThrough(rows, month, asOf); forecast = C.forecast(agg.days, month, asOf); }
  catch (error) { return setRunnerState('pending', error.message); }
  if (!selected.length) return setRunnerState('pending', '선택한 달과 기준일에 사용량이 없습니다. 기간을 수정하세요.');
  if (![forecast.spent, forecast.projected, forecast.perDay].every(Number.isFinite)) return setRunnerState('pending', '기간 계산이 표현 가능한 범위를 넘었습니다. 토큰과 가격을 줄이세요.');
  refresh();
  return setRunnerState('passed', `입력·계산 검사 통과: CSV ${state.sources.length}개, 유효 ${rows.length}행, 선택 기간 ${selected.length}행. 제외 행·누락 가격 없이 계산했습니다. 가상 가격으로 연습한 결과이며 실제 청구액이나 사용 기록의 진위를 확인한 것은 아닙니다.`);
}
function loadRunnerExample() {
  $('resetAll').click();
  $('sampleA').click();
  const apply = $('mapping').querySelector('[data-act="apply"]');
  if (apply && !apply.disabled) apply.click();
  $('fillExample').click();
  setRunnerState('pending', '묶음에 포함된 예제 A와 가상 가격을 불러왔습니다. 예산·가격·기간을 바꿔 보고 현재 계산 검사를 누르세요.');
  return runnerGetState();
}
$('checkResult').addEventListener('click', checkRunner);
$('readyExample').addEventListener('click', loadRunnerExample);
window.PlaygroundRunner = Object.freeze({
  loadExample: loadRunnerExample,
  check: checkRunner,
  reset() { $('resetAll').click(); return runnerGetState(); },
  getState: runnerGetState
});
