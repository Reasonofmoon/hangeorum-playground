// core.js : AI 사용량·비용 보기의 계산 부분 (브라우저와 Node 시험에서 함께 씀). 네트워크 호출 없음.
(function (root) {
  'use strict';

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : (firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
    const headers = (rows.shift() || []).map((h) => h.trim());
    return { headers, rows, delim };
  }

  function toCSV(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n') + '\r\n';
  }

  // ---------- 열 이름 짐작 ----------
  const SYN = {
    date: ['date', 'day', 'timestamp', 'time', 'created', 'created_at', 'usage_date', '일자', '날짜', '사용일', '일시'],
    provider: ['provider', 'vendor', 'company', '제공자', '회사', '공급자'],
    model: ['model', 'model_name', 'model_id', 'engine', '모델', '모델명'],
    input: ['input_tokens', 'prompt_tokens', 'tokens_in', 'input', 'n_context_tokens_total', '입력토큰', '입력 토큰', '입력'],
    output: ['output_tokens', 'completion_tokens', 'tokens_out', 'output', 'n_generated_tokens_total', '출력토큰', '출력 토큰', '출력'],
  };
  const norm = (s) => String(s).toLowerCase().replace(/[\s_\-()]/g, '');
  function guessMapping(headers) {
    const m = { date: -1, provider: -1, model: -1, input: -1, output: -1 };
    for (const k of Object.keys(SYN)) {
      const cands = SYN[k].map(norm);
      let idx = headers.findIndex((h) => cands.includes(norm(h)));
      if (idx < 0) idx = headers.findIndex((h) => cands.some((c) => c.length > 3 && norm(h).includes(c)));
      m[k] = idx;
    }
    return m;
  }

  // ---------- 값 읽기 ----------
  function parseNum(v) {
    if (v == null) return NaN;
    let s = String(v).trim().replace(/[\s₩$원]/g, '');
    if (s === '') return NaN;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const pad = (n) => String(n).padStart(2, '0');
  // 반환: 'YYYY-MM-DD' 또는 null. fmt: auto | ymd | mdy | dmy | epoch
  function parseDate(v, fmt = 'auto') {
    const s = String(v ?? '').trim(); if (!s) return null;
    let m;
    if ((fmt === 'auto' || fmt === 'epoch') && /^\d{9,13}$/.test(s)) {
      const n = Number(s); const d = new Date(s.length > 10 ? n : n * 1000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    if ((fmt === 'auto' || fmt === 'ymd') && (m = s.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/))) {
      if (fmt === 'dmy') return valid(+m[3], +m[2], +m[1]);
      if (fmt === 'mdy' || fmt === 'auto') return valid(+m[3], +m[1], +m[2]);
    }
    return null;
  }
  function valid(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // mapping: {date, provider, model, input, output} 열 번호(-1 = 없음), providerFixed 문자열, dateFmt
  function mappingErrors(headers, mapping) {
    const errors = [];
    for (const [k, label] of [['date', '날짜'], ['input', '입력 토큰'], ['output', '출력 토큰']]) {
      const index = mapping?.[k];
      if (!Number.isInteger(index) || index < 0 || index >= headers.length) errors.push(label + ' 열을 지정하세요.');
    }
    for (const [k, label] of [['provider', '제공자'], ['model', '모델']]) {
      const index = mapping?.[k];
      if (!Number.isInteger(index) || index < -1 || index >= headers.length) errors.push(label + ' 열 번호가 올바르지 않습니다.');
    }
    return errors;
  }
  function normalize(parsed, mapping, source) {
    const out = [], errors = [];
    const invalidMapping = mappingErrors(parsed.headers, mapping);
    if (invalidMapping.length) return { rows: [], errors: [], mappingErrors: invalidMapping };
    parsed.rows.forEach((r, i) => {
      const date = parseDate(r[mapping.date], mapping.dateFmt || 'auto');
      const provider = mapping.provider >= 0 ? String(r[mapping.provider] || '').trim() : (mapping.providerFixed || source || '알 수 없음');
      const model = mapping.model >= 0 ? String(r[mapping.model] || '').trim() : '(모델 없음)';
      const input = parseNum(r[mapping.input]);
      const output = parseNum(r[mapping.output]);
      if (!date) { errors.push({ line: i + 2, reason: '날짜를 읽지 못함', value: r[mapping.date] }); return; }
      if ([mapping.input, mapping.output].some((k) => r[k] == null || String(r[k]).trim() === '')) { errors.push({ line: i + 2, reason: '입력 또는 출력 토큰이 비어 있음 (0은 직접 입력)', value: `${r[mapping.input] ?? ''} / ${r[mapping.output] ?? ''}` }); return; }
      if (!Number.isFinite(input) || !Number.isFinite(output)) { errors.push({ line: i + 2, reason: '토큰 수가 유한한 숫자가 아님', value: `${r[mapping.input]} / ${r[mapping.output]}` }); return; }
      if (input < 0 || output < 0) { errors.push({ line: i + 2, reason: '토큰 수는 0 이상이어야 함', value: `${input} / ${output}` }); return; }
      if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output)) { errors.push({ line: i + 2, reason: '토큰 수는 안전하게 표현할 수 있는 정수여야 함 (최대 9007199254740991)', value: `${r[mapping.input]} / ${r[mapping.output]}` }); return; }
      out.push({ date, month: date.slice(0, 7), provider: provider || '알 수 없음', model: model || '(모델 없음)', input, output, source });
    });
    return { rows: out, errors, mappingErrors: [] };
  }

  // 설정은 모두 검사한 뒤 새 객체로 돌려줍니다. 실패한 가져오기는 기존 상태를 바꾸지 않습니다.
  const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function amount(v) {
    if (v === '') return '';
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    if (typeof v === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function validateSettings(s) {
    const errors = [], value = { prices: [], budget: '', cur: 'USD', mappings: Object.create(null) };
    if (!plain(s)) return { errors: ['설정은 JSON 객체여야 합니다.'], value: null };
    if (!Array.isArray(s.prices)) errors.push('prices는 배열이어야 합니다.');
    else {
      const seen = new Set();
      s.prices.forEach((p, i) => {
        const label = `가격 ${i + 1}행`;
        if (!plain(p) || typeof p.provider !== 'string' || typeof p.model !== 'string') { errors.push(label + ': 제공자와 모델은 문자열이어야 합니다.'); return; }
        const inPrice = amount(p.inPer1M), outPrice = amount(p.outPer1M);
        const provider = p.provider.trim(), model = p.model.trim();
        if (inPrice === null || outPrice === null) errors.push(label + ': 가격은 빈 문자열 또는 0 이상 유한한 숫자여야 합니다.');
        if ((!provider || !model) && (inPrice !== '' || outPrice !== '')) errors.push(label + ': 가격이 있으면 제공자와 모델이 필요합니다.');
        const k = key(provider, model);
        if (provider && model && seen.has(k)) errors.push(label + ': 같은 제공자/모델 가격이 중복되었습니다.');
        seen.add(k);
        value.prices.push({ provider, model, inPer1M: inPrice, outPer1M: outPrice });
      });
    }
    value.budget = amount(s.budget === undefined ? '' : s.budget);
    if (value.budget === null) errors.push('예산은 빈 문자열 또는 0 이상 유한한 숫자여야 합니다.');
    if (s.cur !== undefined) {
      if (typeof s.cur !== 'string' || !s.cur.trim()) errors.push('통화 표시는 비어 있지 않은 문자열이어야 합니다.');
      else value.cur = s.cur.trim();
    }
    if (s.mappings !== undefined && !plain(s.mappings)) errors.push('mappings는 객체여야 합니다.');
    else for (const [sig, m] of Object.entries(s.mappings || {})) {
      if (!plain(m) || ['date','provider','model','input','output'].some((k) => !Number.isInteger(m[k]) || m[k] < (['date','input','output'].includes(k) ? 0 : -1) || m[k] >= sig.split('|').length) || typeof m.providerFixed !== 'string' || !['auto','ymd','mdy','dmy','epoch'].includes(m.dateFmt)) {
        errors.push(`열 맞춤 ${sig}: 열 번호·고정 제공자·날짜 형식을 확인하세요.`); continue;
      }
      value.mappings[sig] = { date:m.date, provider:m.provider, model:m.model, input:m.input, output:m.output, providerFixed:m.providerFixed, dateFmt:m.dateFmt };
    }
    return { errors, value: errors.length ? null : value };
  }

  // ---------- 가격과 비용 ----------
  const key = (p, m) => p + '\u0001' + m;
  // prices: [{provider, model, inPer1M, outPer1M}] (값이 빈 문자열이면 가격 없음)
  function priceMap(prices) { const m = new Map(); for (const p of prices) m.set(key(p.provider, p.model), p); return m; }
  function costOf(row, pm) {
    const p = pm.get(key(row.provider, row.model));
    if (!p || p.inPer1M === '' || p.outPer1M === '' || p.inPer1M == null || p.outPer1M == null) return null;
    const inputPrice = amount(p.inPer1M), outputPrice = amount(p.outPer1M);
    if (inputPrice === null || outputPrice === null) return null;
    const cost = row.input / 1e6 * inputPrice + row.output / 1e6 * outputPrice;
    return Number.isFinite(cost) && cost >= 0 ? cost : null;
  }

  function aggregate(rows, prices) {
    const pm = priceMap(prices);
    const byMonth = new Map(), byModel = new Map(), byDay = new Map(), missing = new Set();
    let total = 0, excludedRows = 0;
    for (const r of rows) {
      const c = costOf(r, pm);
      if (c === null) { missing.add(key(r.provider, r.model)); excludedRows++; }
      const cost = c ?? 0; total += cost;
      const mk = r.month;
      if (!byMonth.has(mk)) byMonth.set(mk, { month: mk, cost: 0, input: 0, output: 0, series: new Map(), firstDate:r.date, lastDate:r.date, observedDates:new Set(), excludedRows:0 });
      const M = byMonth.get(mk); M.cost += cost; M.input += r.input; M.output += r.output;
      if (r.date < M.firstDate) M.firstDate = r.date;
      if (r.date > M.lastDate) M.lastDate = r.date;
      M.observedDates.add(r.date); M.observedDays = M.observedDates.size;
      if (c === null) M.excludedRows++;
      const sk = r.provider + ' / ' + r.model; M.series.set(sk, (M.series.get(sk) || 0) + cost);
      const k2 = mk + '\u0001' + key(r.provider, r.model);
      if (!byModel.has(k2)) byModel.set(k2, { month: mk, provider: r.provider, model: r.model, input: 0, output: 0, cost: 0, priced: c !== null, requests: 0 });
      const B = byModel.get(k2); B.input += r.input; B.output += r.output; B.cost += cost; B.requests++; B.priced = B.priced && c !== null;
      byDay.set(r.date, (byDay.get(r.date) || 0) + cost);
    }
    return {
      total, excludedRows,
      months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
      models: [...byModel.values()].sort((a, b) => a.month.localeCompare(b.month) || b.cost - a.cost),
      days: [...byDay.entries()].map(([date, cost]) => ({ date, cost })).sort((a, b) => a.date.localeCompare(b.date)),
      missing: [...missing].map((k) => { const [provider, model] = k.split('\u0001'); return { provider, model }; }),
    };
  }

  function daysInMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function validatePeriod(month, asOf) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('선택한 달이 올바르지 않습니다.');
    if (asOf && (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || parseDate(asOf, 'ymd') !== asOf || !asOf.startsWith(month + '-'))) throw new Error('기준일은 선택한 달 안의 올바른 날짜여야 합니다.');
  }
  function rowsThrough(rows, month, asOf) {
    validatePeriod(month, asOf);
    return rows.filter((r) => r.month === month && (!asOf || r.date <= asOf));
  }

  // 직선 예측: 기준일까지 쓴 돈 / 지난 날 수 x 그 달 전체 날 수
  function forecast(days, month, asOf) {
    validatePeriod(month, asOf);
    const inMonth = days.filter((d) => d.date.startsWith(month));
    const lastDate = asOf || (inMonth.length ? inMonth[inMonth.length - 1].date : month + '-01');
    const elapsed = Math.max(1, Number(lastDate.slice(8, 10)));
    const total = daysInMonth(month);
    const spent = inMonth.filter((d) => d.date <= lastDate).reduce((s, d) => s + d.cost, 0);
    const perDay = spent / elapsed;
    return { month, asOf: lastDate, elapsed, totalDays: total, spent, perDay, projected: perDay * total, remainingDays: total - elapsed };
  }

  function budgetStatus(f, budget) {
    if (!(budget > 0)) return { level: 'none', text: '예산을 넣으면 알림이 켜집니다.' };
    const usedPct = f.spent / budget * 100, projPct = f.projected / budget * 100;
    if (f.spent >= budget) return { level: 'over', usedPct, projPct, text: `예산을 이미 넘었습니다 (${usedPct.toFixed(0)}%).` };
    if (f.projected > budget) {
      const dayHit = Math.ceil(budget / Math.max(f.perDay, 1e-9));
      return { level: 'warn', usedPct, projPct, dayHit, text: `이대로면 ${f.month}-${pad(Math.min(dayHit, f.totalDays))} 무렵 예산을 넘습니다 (월말 예상 ${projPct.toFixed(0)}%).` };
    }
    if (usedPct >= 80) return { level: 'near', usedPct, projPct, text: `예산의 ${usedPct.toFixed(0)}%를 썼습니다.` };
    return { level: 'ok', usedPct, projPct, text: `예산 안입니다 (월말 예상 ${projPct.toFixed(0)}%).` };
  }

  const api = { parseCSV, toCSV, guessMapping, parseNum, parseDate, mappingErrors, normalize, amount, validateSettings, priceMap, costOf, aggregate, daysInMonth, validatePeriod, rowsThrough, forecast, budgetStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CostCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
