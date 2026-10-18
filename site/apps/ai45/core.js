// core.js : 쉬운 언어 점검기 규칙 (브라우저 window.PLC, Node module.exports, 확장 팝업 공용)
// 쉬운 언어 원칙(독자가 찾고, 이해하고, 쓸 수 있게)을 이 도구 나름의 규칙으로 옮긴 것입니다. 표준 문서의 문장을 옮겨 오지 않았습니다.
(function (root) {
  'use strict';
  // 어려운 말 → 쉬운 말. level 2 = 바꾸기 권장, 1 = 상황에 따라
  const DICT = [
    ['금일', '오늘', 2], ['익일', '다음 날', 2], ['명일', '내일', 2], ['작일', '어제', 2], ['전일', '전날', 2],
    ['금번', '이번', 2], ['금회', '이번', 2], ['차기', '다음', 1], ['익월', '다음 달', 2], ['당월', '이번 달', 2],
    ['동월', '같은 달', 2], ['익년', '다음 해', 2], ['동년', '같은 해', 2], ['당해', '그해', 2], ['익주', '다음 주', 2],
    ['차주', '다음 주', 2], ['내주', '다음 주', 2], ['상기', '위', 2], ['하기와 같이', '아래와 같이', 2], ['기 제출한', '이미 낸', 2],
    ['기제출한', '이미 낸', 2], ['기 제출', '이미 낸', 2], ['기 납부한', '이미 낸', 2], ['기 신청한', '이미 신청한', 2], ['소정의', '정해진', 2],
    ['소요되는', '드는', 2], ['소요됩니다', '듭니다', 2], ['내방', '방문', 2], ['내원', '방문', 1], ['송부', '보냄', 2],
    ['회신', '답장', 1], ['기재', '적기', 2], ['기입', '적기', 2], ['수령', '받기', 2], ['수취', '받기', 2],
    ['교부', '내줌', 2], ['개최합니다', '엽니다', 2], ['개최', '열기', 1], ['요망', '바람', 2], ['득하여', '얻어', 2], ['득한', '얻은', 2],
    ['상이한', '다른', 2], ['상이', '다름', 2], ['동일한', '같은', 1], ['의거하여', '따라', 2], ['의거', '따라', 2],
    ['준하여', '따라', 2], ['에 한하여', '만', 2], ['에 한해', '만', 2], ['일체', '모두', 1], ['일절', '전혀', 1],
    ['별첨', '따로 붙임', 2], ['첨부', '붙임', 1], ['사료됨', '생각함', 2], ['사료됩니다', '생각합니다', 2], ['요함', '필요함', 2],
    ['요하는', '필요한', 2], ['지참하여', '가지고', 2], ['지참', '가져오기', 2], ['구비서류', '필요한 서류', 2], ['구비하여', '갖추어', 2],
    ['경과한', '지난', 2], ['경과 시', '지나면', 2], ['도과', '지남', 2], ['징구', '받음', 2], ['미비한', '부족한', 2],
    ['미비', '부족', 2], ['하자', '흠', 1], ['부합하는', '맞는', 2], ['저촉되는', '어긋나는', 2], ['상회하는', '넘는', 2],
    ['하회하는', '밑도는', 2], ['가급적', '되도록', 2], ['필히', '반드시', 2], ['신속히', '빨리', 1], ['불입', '냄', 2],
    ['납입', '냄', 1], ['반려', '돌려보냄', 2], ['이첩', '넘김', 2], ['이관', '넘김', 1], ['공람', '함께 봄', 2],
    ['배부', '나눠 줌', 2], ['착수', '시작', 1], ['순연', '차례로 미룸', 2], ['일자', '날짜', 1], ['상호 간', '서로', 2],
    ['제반', '여러', 2], ['소관', '맡은', 2], ['관내', '지역 안', 1], ['유관 기관', '관련 기관', 2], ['수혜자', '혜택 받는 사람', 1],
    ['미연에', '미리', 2], ['하등의', '아무런', 2], ['여하에 따라', '에 따라', 2], ['등등', '등', 1], ['시행하고자', '하려고', 2],
    ['하고자 합니다', '하려고 합니다', 2, true], ['하고자', '하려고', 1, true], ['하오니', '하니', 2, true], ['하여 주시기 바랍니다', '해 주세요', 2, true], ['하시기 바랍니다', '하세요', 1, true],
    ['송부하여 주시기 바랍니다', '보내 주세요', 2], ['송부하여', '보내', 2], ['기재하여', '적어', 2], ['기재한', '적은', 2], ['반려하지', '돌려보내지', 2],
    ['수령하신', '받으신', 2], ['통보됩니다', '알려 드립니다', 2], ['통보되며', '알려 드리며', 2], ['문의하시기 바랍니다', '물어보세요', 2],
    ['협조하여 주시기 바랍니다', '도와주세요', 2], ['참석 요망', '참석해 주세요', 2], ['문의처', '묻는 곳', 1], ['통보', '알림', 1], ['기한 내', '기한까지', 1],
  ];
  const HANJA_NUM = /일금\s*[일이삼사오육칠팔구십백천만억\s]+원정?/g;
  const CONNECT = /(하고|이고|되고|으며|하며|이며|되며|며|는데|은데|인데|지만|으므로|하므로|므로|하여|해서|되어|아서|어서|면서|으면서|거나|든지|되|으나|이나)(?=[\s,])/g;
  const PASSIVE = [
    [/되어지[다고는며ㄴ면]|되어진|되어져/g, '이중 피동 "되어지다"', '"되다"로 줄이세요 (예: 결정되어진 → 결정된)'],
    [/(보여|쓰여|놓여|잊혀|읽혀|믿겨|짜여|닫혀|열려|불리어|생각되어)지[다고는며면]|(보여|쓰여|놓여|잊혀|읽혀|믿겨|짜여|불리어|생각되어)진/g, '이중 피동 "-어지다"', '하나만 쓰세요 (예: 보여지다 → 보이다)'],
    [/에\s?의하여|에\s?의해서?|에\s?의한/g, '"~에 의해" 피동', '누가 하는지를 주어로 앞에 쓰세요 (예: 구청에 의해 실시된다 → 구청이 실시한다)'],
    [/하게 되었습니다|하게 됩니다|게 되었습니다/g, '"~하게 되다"', '바로 쓰세요 (예: 운영하게 되었습니다 → 운영합니다)'],
  ];
  // 결론 신호: 독자가 할 일(기한, 제출, 신청)이나 결론을 말하는 표현. "많은 참여 바랍니다" 같은 인사말은 넣지 않습니다.
  const CONCL = /(마감|까지|기한|신청하세요|신청해 주세요|제출|내세요|보내 주세요|해 주세요|주십시오|하십시오|해야 합니다|결론|요약|핵심)/;
  const LATE = /(따라서|그러므로|결론적으로|요약하면|결론은|이에 따라|그러니)/;

  // 날짜·숫자 속 마침표(2026. 10. 23.까지, 1.5배)는 문장 끝이 아니므로, 같은 길이의 다른 글자로 가린 사본으로 자릅니다.
  function splitSentences(text) {
    const masked = text.replace(/(\d)\.(?=\s?\d|[가-힣)])/g, '$1\u2024');
    const out = []; const re = /[^\n.!?。]*(?:[.!?。]+|\n|$)/g; let m;
    while ((m = re.exec(masked)) && m[0] !== '') {
      const raw0 = m[0]; const s = m.index + (raw0.length - raw0.trimStart().length); const t = text.slice(s, s + raw0.trim().length);
      if (t && /[가-힣A-Za-z0-9]/.test(t)) out.push({ start: s, end: s + t.length, text: t });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out;
  }
  function paragraphs(text) {
    const parts = []; const re = /(?:^|\n\s*\n)([\s\S]*?)(?=\n\s*\n|$)/g; let m;
    while ((m = re.exec(text))) { const t = m[1]; if (t.trim()) { const s = m.index + m[0].indexOf(t); parts.push({ start: s, end: s + t.length, text: t }); } if (re.lastIndex === m.index) re.lastIndex++; }
    return parts;
  }
  const lenNoSpace = (s) => s.replace(/\s/g, '').length;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function analyze(text, opt = {}) {
    text = String(text || '');
    const LONG = opt.longLimit || 60, VLONG = opt.veryLongLimit || 90;
    const issues = [];
    const add = (type, start, end, msg, suggestion, sev, extra) => issues.push(Object.assign({ type, start, end, text: text.slice(start, end), msg, suggestion, sev }, extra || {}));
    const sents = splitSentences(text);
    // 1) 문장 길이, 2) 한 문장 여러 내용
    for (const s of sents) {
      s.len = lenNoSpace(s.text);
      const commas = (s.text.match(/,/g) || []).length;
      const conns = [...s.text.matchAll(CONNECT)].length;
      s.clauses = commas + conns;
      if (s.len > VLONG) add('long', s.start, s.end, `아주 긴 문장 (${s.len}자, 띄어쓰기 빼고)`, '두세 문장으로 나누세요. 연결어미(-며, -고, -는데) 자리에서 끊으면 쉽습니다.', 3);
      else if (s.len > LONG) add('long', s.start, s.end, `긴 문장 (${s.len}자)`, `${LONG}자 안쪽으로 줄이거나 두 문장으로 나누세요.`, 2);
      if (s.clauses >= 3) add('multi', s.start, s.end, `한 문장에 내용이 여러 개 (쉼표·연결어미 ${s.clauses}개)`, '한 문장에는 한 가지 내용만 담으세요.', 2);
    }
    // 3) 어려운 말 (긴 말부터, 앞에 한글이 붙지 않은 곳만)
    const taken = [];
    const free = (a, b) => !taken.some(([x, y]) => a < y && x < b);
    [...DICT].sort((a, b) => b[0].length - a[0].length).forEach(([hard, easy, lv, suffix]) => {
      const re = new RegExp((suffix ? '' : '(?<![가-힣])') + esc(hard), 'g'); let m;
      while ((m = re.exec(text))) { const a = m.index, b = a + hard.length; if (!free(a, b)) continue; taken.push([a, b]); add('word', a, b, `어려운 말 "${hard}"`, `"${easy}"(으)로 바꿔 보세요.`, lv === 2 ? 2 : 1, { easy }); }
    });
    // 4) 피동·늘어진 표현
    for (const [re, msg, sug] of PASSIVE) for (const m of text.matchAll(re)) add('passive', m.index, m.index + m[0].length, msg, sug, 2);
    // 5) 결론이 앞에 있는가
    const paras = paragraphs(text);
    let conclusion = { ok: true, msg: '' };
    // 첫 문단이 제목 한 줄(짧고 마침표 없음)이면 제목 + 다음 문단을 "앞부분"으로 봅니다
    const titleOnly = paras.length >= 2 && !/\n/.test(paras[0].text.trim()) && lenNoSpace(paras[0].text) <= 40 && !/[.!?。]\s*$/.test(paras[0].text.trim());
    const head = titleOnly ? 2 : 1;
    if (paras.length > head) {
      const first = paras.slice(0, head).map((p) => p.text).join('\n'); const rest = paras.slice(head);
      let restIdx = rest.findIndex((p) => LATE.test(p.text)); if (restIdx < 0) restIdx = rest.findIndex((p) => CONCL.test(p.text));
      if (!CONCL.test(first) && restIdx >= 0) {
        const p = rest[restIdx]; const ms = LATE.exec(p.text) || CONCL.exec(p.text);
        conclusion = { ok: false, msg: '첫 문단에 요청·결론이 없고, 뒤 문단에 있습니다' };
        add('order', p.start + ms.index, p.start + ms.index + ms[0].length, '결론이 뒤에 있음', '독자가 해야 할 일과 결론을 첫 문단(첫 줄)으로 옮기세요.', 3);
      } else if (!CONCL.test(first) && !paras.some((p) => CONCL.test(p.text))) conclusion = { ok: false, msg: '요청이나 결론 문장을 찾지 못했습니다' };
    } else if (sents.length >= 3 && !CONCL.test(sents[0].text) && sents.slice(1).some((s) => LATE.test(s.text))) {
      const s = sents.find((x) => LATE.test(x.text)); conclusion = { ok: false, msg: '결론이 마지막에 있습니다' };
      add('order', s.start, s.end, '결론이 뒤에 있음', '결론 문장을 맨 앞으로 옮기세요.', 3);
    }
    // 6) 숫자·날짜 표기
    const fmts = { dot: /\b\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?/g, dash: /\b\d{4}-\d{1,2}-\d{1,2}\b/g, kor: /\d{1,2}월\s?\d{1,2}일/g, slash: /(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/])/g };
    const found = Object.entries(fmts).map(([k, re]) => [k, [...text.matchAll(re)]]).filter(([, a]) => a.length);
    if (found.length > 1) {
      const major = found.sort((a, b) => b[1].length - a[1].length)[0][0];
      const NAME = { dot: '2026. 10. 15.', dash: '2026-10-15', kor: '10월 15일', slash: '10/15' };
      found.filter(([k]) => k !== major).forEach(([k, arr]) => arr.forEach((m) => add('number', m.index, m.index + m[0].length, `날짜 표기가 섞임 (${NAME[k]} 모양)`, `문서 안에서는 한 가지(${NAME[major]} 모양)로 맞추세요.`, 1)));
    }
    for (const m of text.matchAll(/(?<![\d,.])(\d{5,})(?![\d,.])\s?(원|명|개|건|부|회|장)/g)) add('number', m.index, m.index + m[1].length, '큰 숫자에 쉼표 없음', `${Number(m[1]).toLocaleString('ko-KR')}처럼 세 자리마다 쉼표를 넣으세요.`, 1);
    for (const m of text.matchAll(HANJA_NUM)) add('number', m.index, m.index + m[0].length, '한자식 금액 표기', '숫자로 쓰세요 (예: 일금 일백만원정 → 1,000,000원).', 2);
    const hasColon = /(?<!\d)([01]?\d|2[0-3]):[0-5]\d(?!\d)/.exec(text), hasKorTime = /(오전|오후)\s?\d{1,2}시/.exec(text);
    if (hasColon && hasKorTime) add('number', hasKorTime.index, hasKorTime.index + hasKorTime[0].length, '시각 표기가 섞임 (14:00과 오후 2시)', '한 가지로 맞추세요.', 1);
    for (const m of text.matchAll(/(?<![A-Za-z])([A-Z]{2,6})(?![A-Za-z])(?!\s?\()/g)) {
      if (!new RegExp(m[1] + '\\s?\\(').test(text)) add('word', m.index, m.index + m[1].length, `설명 없는 영문 약어 "${m[1]}"`, '처음 나올 때 우리말 뜻을 괄호로 붙이세요.', 1);
    }
    issues.sort((a, b) => a.start - b.start || b.sev - a.sev);
    // 점수
    const W = { long: [0, 2, 4, 7], multi: [0, 1, 3, 3], word: [0, 0.5, 2, 2], passive: [0, 1, 2, 2], order: [0, 0, 0, 10], number: [0, 1, 2, 2] };
    const pen = {}; issues.forEach((i) => { pen[i.type] = (pen[i.type] || 0) + W[i.type][i.sev]; });
    if (pen.word) pen.word = Math.min(pen.word, 30);
    if (!conclusion.ok && !issues.some((i) => i.type === 'order')) pen.order = 6;
    const total = Object.values(pen).reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.round(100 - total));
    const grade = score >= 90 ? '아주 쉬움' : score >= 75 ? '쉬움' : score >= 60 ? '보통' : '어려움';
    const count = (t) => issues.filter((i) => i.type === t).length;
    const avg = sents.length ? Math.round(sents.reduce((a, s) => a + s.len, 0) / sents.length) : 0;
    return { score, grade, issues, sentences: sents, conclusion, penalties: pen, stats: { chars: lenNoSpace(text), sentences: sents.length, avgLen: avg, long: count('long'), multi: count('multi'), word: count('word'), passive: count('passive'), order: count('order'), number: count('number') } };
  }
  // 어려운 말만 쉬운 말로 바꾸기 (level 2만 기본). 바꾼 수를 돌려줍니다.
  // 뒤에 "하다/되다"가 붙은 명사(예: 반려하지)는 바꾸면 문법이 깨지므로 건너뛰고 skipped로 셉니다.
  function applyWords(text, opt = {}) {
    const minLv = opt.all ? 1 : 2; let n = 0, skipped = 0; let out = text;
    [...DICT].filter((d) => d[2] >= minLv).sort((a, b) => b[0].length - a[0].length).forEach(([hard, easy, , suffix]) => {
      const verbish = !suffix && !/[다요며여지은는한서고]$/.test(hard);
      out = out.replace(new RegExp((suffix ? '' : '(?<![가-힣])') + esc(hard) + '(?=([하해한할함합했되된될됨됩됐])?)', 'g'), (m, after) => {
        if (verbish && after) { skipped++; return m; }
        n++; return easy;
      });
    });
    return { text: out, count: n, skipped };
  }
  const TYPES = { long: '긴 문장', multi: '여러 내용', word: '어려운 말', passive: '피동·늘어진 표현', order: '결론 위치', number: '숫자·날짜' };
  const api = { analyze, applyWords, splitSentences, paragraphs, DICT, TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PLC = api;
})(typeof window !== 'undefined' ? window : globalThis);
