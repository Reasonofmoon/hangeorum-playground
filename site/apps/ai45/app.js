// app.js : 쉬운 언어 점검기 화면 (확장 페이지 정책상 인라인 스크립트를 쓰지 않습니다)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const BAD = `2026 하반기 평생학습 강사 모집 안내 (예시)

예시구청 평생학습과에서는 구민의 평생학습 기회 확대를 위하여 다양한 분야의 강좌를 개설하고자 하며, 이에 강의 경험과 전문성을 갖춘 강사를 모집하고자 하오니, 관심 있는 분들의 많은 참여를 바랍니다.

금번 모집은 상기 목적에 의거하여 시행되어지며, 기 제출한 서류는 반려하지 않습니다. 신청서는 소정의 양식에 기재하여 2026. 10. 23.까지 송부하여 주시기 바랍니다. 서류 심사 결과는 10월 30일 개별 통보되며, 면접은 익일 14:00에 진행됩니다.

강사료는 시간당 50000원이며 교재비는 일금 일십만원정 범위에서 실비로 지급됩니다. 기타 문의 사항은 담당 주무관에게 전화로 문의하시기 바랍니다.

따라서 신청을 원하시는 분은 구비서류를 지참하여 필히 기한 내 방문 접수하시기 바랍니다.`;
const GOOD = `2026 하반기 평생학습 강사를 모집합니다 (예시)

신청 마감은 2026년 10월 23일입니다.
정해진 양식에 신청서를 적고, 필요한 서류를 가지고 방문 접수해 주세요.

예시구청 평생학습과는 구민에게 더 많은 평생학습 기회를 제공하려고 다양한 분야의 강좌를 엽니다.
이번 모집은 이 강좌를 가르칠, 강의 경험과 전문성을 갖춘 분을 대상으로 합니다.
관심 있는 분들의 참여를 바랍니다.

이미 낸 서류는 돌려보내지 않습니다.
서류 심사 결과는 2026년 10월 30일에 각자 알려 드립니다.
면접은 다음 날인 2026년 10월 31일 14:00에 합니다.

강사료는 시간당 50,000원입니다.
교재비는 실제로 쓴 비용을 100,000원 한도에서 지급합니다.

궁금한 점은 담당 주무관에게 전화로 물어보세요.`;
const LS = 'tutorial-platform-v7:practice:ai45';
let R = null; let undoText = null; let lastValidLimit = 60; const hidden = new Set();
let runnerState = {status:'pending', message:'예시를 불러오거나 글을 입력한 뒤 점검하세요.'};
let checkedInput = null;
const inputSnapshot = () => JSON.stringify([$('#src').value, $('#limit').value]);
function setRunnerState(status, message) { runnerState = {status, message}; checkedInput = inputSnapshot(); $('#runnerStatus').textContent = message; return {...runnerState}; }
function runnerGetState() { if (checkedInput !== null && checkedInput !== inputSnapshot()) invalidate(); return {...runnerState}; }
function persist() {
  const limit = Number($('#limit').value);
  if (Number.isInteger(limit) && limit >= 30 && limit <= 150) lastValidLimit = limit;
  try { localStorage.setItem(LS, JSON.stringify({version:7, text:$('#src').value, limit:lastValidLimit, undo:undoText})); }
  catch { toast('입력을 저장하지 못했습니다. 현재 글 TXT 저장으로 보관하세요.'); }
}
function remember() { undoText = $('#src').value; $('#undo').disabled = false; }
function invalidate() { R = null; window.__R = null; setRunnerState('pending', '현재 입력은 아직 점검하지 않았습니다. 점검하기를 누르세요.'); $('#dial').style.setProperty('--p', 0); $('#num').textContent = '-'; $('#grade').textContent = '입력 변경 · 다시 점검'; $('#stat').textContent = ''; $('#concl').textContent = ''; $('#view').textContent = '점검하기를 누르면 현재 입력을 표시합니다.'; $('#list').innerHTML = ''; $('#chips').innerHTML = ''; $('#cnt').textContent = ''; $('#aiOut').textContent = ''; $('#aiOut').style.display = 'none'; }
$('#src').addEventListener('input', () => { invalidate(); persist(); });
function toast(t) { const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (e.style.display = 'none'), 2400); }
function run() {
  const text = $('#src').value;
  clearTimeout(toast.t); $('#toast').style.display = 'none';
  $('#aiOut').textContent = ''; $('#aiOut').style.display = 'none';
  const limit = Number($('#limit').value);
  if (!Number.isInteger(limit) || limit < 30 || limit > 150) { invalidate(); setRunnerState('pending', '긴 문장 기준은 30~150 사이의 정수로 입력하세요.'); toast(runnerState.message); return; }
  if (!text.trim()) { invalidate(); $('#grade').textContent = '글을 넣어 주세요'; setRunnerState('pending', '먼저 예시 또는 연습할 글을 넣으세요.'); toast(runnerState.message); return; }
  R = PLC.analyze(text, { longLimit: limit, veryLongLimit: Math.max(90, Math.round(limit * 1.5)) }); window.__R = R; persist();
  const c = R.score >= 75 ? '#14a3a1' : R.score >= 60 ? '#ff8a3d' : '#e8473f';
  $('#dial').style.setProperty('--p', R.score); $('#dial').style.setProperty('--c', c); $('#num').textContent = R.score;
  $('#grade').textContent = R.grade; $('#grade').style.color = c;
  $('#stat').textContent = `문장 ${R.stats.sentences}개 · 평균 ${R.stats.avgLen}자 · 글자 ${R.stats.chars}자(띄어쓰기 빼고)`;
  $('#concl').textContent = R.conclusion.ok ? '결론·요청이 앞부분에 있습니다.' : '결론 위치: ' + R.conclusion.msg;
  $('#chips').innerHTML = Object.entries(PLC.TYPES).map(([k, v]) => `<button type="button" aria-pressed="${!hidden.has(k)}" class="chip t-${k}${hidden.has(k) ? ' off' : ''}" data-k="${k}">${v} ${R.stats[k]}</button>`).join('');
  render();
  setRunnerState(R.score >= 75 ? 'passed' : 'pending', `규칙 점검 ${R.score}점: ${R.score >= 75 ? '75점 이상 구간입니다.' : '표시한 표현을 고친 뒤 다시 점검하세요.'} 이 결과는 사실·의미 보존을 확인하지 않습니다. 날짜·접수 방법·조건·비용은 원문과 직접 대조하세요.`);
}
function render() {
  const text = $('#src').value; const iss = R.issues.filter((i) => !hidden.has(i.type));
  // 문장 단위(긴 문장·여러 내용)는 밑줄, 낱말 단위는 색칠. 겹치면 낱말을 안쪽에.
  const spans = iss.filter((i) => i.type === 'long' || i.type === 'multi');
  const marks = iss.filter((i) => !(i.type === 'long' || i.type === 'multi'));
  const pts = new Set([0, text.length]); [...spans, ...marks].forEach((i) => { pts.add(i.start); pts.add(i.end); });
  const cuts = [...pts].sort((a, b) => a - b); let html = '';
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k], b = cuts[k + 1]; let seg = esc(text.slice(a, b));
    const m = marks.find((i) => i.start <= a && b <= i.end); if (m) seg = `<mark class="t-${m.type}" data-i="${R.issues.indexOf(m)}" title="${esc(m.msg + ' → ' + m.suggestion)}">${seg}</mark>`;
    const s = spans.find((i) => i.start <= a && b <= i.end); if (s) seg = `<mark class="s-${s.type}" data-i="${R.issues.indexOf(s)}">${seg}</mark>`;
    html += seg;
  }
  $('#view').className = ''; $('#view').innerHTML = html || '<span class="sub">(빈 글)</span>';
  $('#cnt').textContent = `${iss.length}곳`;
  $('#list').innerHTML = iss.map((i) => `<li data-i="${R.issues.indexOf(i)}"><span class="tag t-${i.type}">${PLC.TYPES[i.type]}</span><b>${esc(i.text.length > 34 ? i.text.slice(0, 34) + '…' : i.text)}</b> ${esc(i.msg)}<span class="sg">${esc(i.suggestion)}</span></li>`).join('') || '<li>고칠 곳이 없습니다.</li>';
}
$('#chips').addEventListener('click', (e) => { const k = e.target.dataset.k; if (!k) return; hidden.has(k) ? hidden.delete(k) : hidden.add(k); run(); });
$('#list').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; const m = $(`#view mark[data-i="${li.dataset.i}"]`); if (m) { m.scrollIntoView({ block: 'center', behavior: 'smooth' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1200); } });
$('#run').onclick = run; $('#limit').oninput = $('#limit').onchange = () => { invalidate(); persist(); };
$('#sampleBad').onclick = () => { remember(); $('#src').value = BAD; $('#fixNote').textContent = ''; invalidate(); persist(); }; $('#sampleGood').onclick = () => { remember(); $('#src').value = GOOD; $('#fixNote').textContent = ''; invalidate(); persist(); };
$('#fix').onclick = () => { run(); if (!R) return; remember(); const before = R.score; const r = PLC.applyWords($('#src').value); $('#src').value = r.text; run(); $('#fixNote').textContent = `${r.count}곳을 바꿨습니다${r.skipped ? `, ${r.skipped}곳은 문법 때문에 건너뜀` : ''}. 점수 ${before} → ${R.score}. 문장 나누기와 결론 옮기기는 직접 하세요.`; window.__fix = r; };
$('#copy').onclick = async () => { run(); if (!R) return; const t = `쉬운 언어 점검 결과: ${R.score}점 (${R.grade})\n` + R.issues.map((i) => `- [${PLC.TYPES[i.type]}] ${i.text.slice(0, 40)}: ${i.msg} → ${i.suggestion}`).join('\n'); try { await navigator.clipboard.writeText(t); toast('결과를 복사했습니다'); } catch (e) { toast('복사 권한이 없어 실패했습니다'); } };
function renderDict(q) { $('#dict').innerHTML = '<table><tr><th>어려운 말</th><th>쉬운 말</th><th></th></tr>' + PLC.DICT.filter((d) => !q || d[0].includes(q) || d[1].includes(q)).map((d) => `<tr><td>${esc(d[0])}</td><td>${esc(d[1])}</td><td class="sub">${d[2] === 2 ? '바꾸기 권장' : '상황에 따라'}</td></tr>`).join('') + '</table>'; }
$('#dictN').textContent = PLC.DICT.length; renderDict(''); $('#dq').oninput = (e) => renderDict(e.target.value.trim());
$('#ai').onclick = () => {
  const text = $('#src').value; const out = $('#aiOut'); out.style.display = 'block';
  if (!text.trim()) { out.textContent = '먼저 예시 또는 연습할 글을 넣으세요.'; return; }
  out.textContent = text.trim() === BAD.trim() ? '로컬 모의 결과 — 사전에 검수한 예시 답안입니다. 실제 AI 응답이 아닙니다.\n\n' + GOOD : '로컬 낱말 규칙 결과 — 실제 AI 응답이 아닙니다. 날짜·접수 방법·조건·비용을 반드시 원문과 대조하세요.\n\n' + PLC.applyWords(text).text;
};

$('#undo').onclick = () => { if (undoText === null) return; $('#src').value = undoText; undoText = null; $('#undo').disabled = true; $('#fixNote').textContent = '이전 글로 되돌렸습니다. 다시 점검하세요.'; invalidate(); persist(); };
$('#download').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#src').value], {type:'text/plain;charset=utf-8'})); a.download = 'ai45-practice-text.txt'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
$('#reset').onclick = () => { $('#src').value = ''; $('#limit').value = '60'; lastValidLimit = 60; undoText = null; hidden.clear(); $('#undo').disabled = true; $('#fixNote').textContent = ''; $('#dq').value = ''; renderDict(''); invalidate(); try { localStorage.removeItem(LS); toast('AI45의 v7 입력·결과·되돌리기만 지웠습니다. 다른 실습과 v6 기록은 유지됩니다.'); } catch { toast('저장소 삭제에 실패했습니다.'); } };
try { const raw = localStorage.getItem(LS); if (raw) { const v = JSON.parse(raw); if (v.version !== 7 || typeof v.text !== 'string' || !(v.undo === null || typeof v.undo === 'string')) throw new Error('형식'); lastValidLimit=Number.isInteger(v.limit)&&v.limit>=30&&v.limit<=150?v.limit:60; $('#src').value=v.text; $('#limit').value=String(lastValidLimit); undoText=v.undo; $('#undo').disabled=undoText===null; invalidate(); if(v.limit!==lastValidLimit) toast('저장된 문장 기준을 60자로 복구했습니다. 입력한 글은 유지했습니다.'); } } catch { toast('저장된 입력 형식이 잘못되어 복원하지 않았습니다. 실습 초기화로 지울 수 있습니다.'); }
window.PlaygroundRunner = Object.freeze({
  loadExample() { $('#sampleBad').click(); return runnerGetState(); },
  check() { run(); return runnerGetState(); },
  reset() { $('#reset').click(); return runnerGetState(); },
  getState: runnerGetState
});
