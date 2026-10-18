(() => {
  'use strict';
  const catalog = window.TUTORIAL_CATALOG;
  if (!catalog || !Array.isArray(catalog.courses) || !Array.isArray(catalog.lessons)) return;
  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const root = document.body.dataset.root || '';
  const page = document.body.dataset.page;
  const currentLesson = document.body.dataset.lesson;
  const courses = new Map(catalog.courses.map(c => [c.id, c]));
  const lessons = new Map(catalog.lessons.map(l => [l.id, l]));
  const scopeIds = new Set(['library', ...courses.keys(), ...lessons.keys()]);
  const storageKey = 'tutorial-platform-v4:reading';
  const fresh = () => ({version: 1, read: {}, bookmarks: {}, help: {}, lastLesson: null});
  let state = fresh();
  let recovered = false;
  let storageFailed = false;
  let expanded = false;
  const maxCount = n => Number.isSafeInteger(n) && n > 0 ? Math.min(n, 99999) : 0;
  function loadStored() {
    const next = fresh();
    try {
    const value = localStorage.getItem(storageKey);
    if (value) {
      const stored = JSON.parse(value);
      if (!stored || stored.version !== 1 || typeof stored !== 'object') throw new Error('unrecognized reading record');
      for (const id of lessons.keys()) {
        if (stored.read && stored.read[id] === true) next.read[id] = true;
        if (stored.bookmarks && stored.bookmarks[id] === true) next.bookmarks[id] = true;
      }
      for (const id of scopeIds) {
        const record = stored.help && stored.help[id];
        if (record && typeof record === 'object') next.help[id] = {hint: maxCount(record.hint), answer: maxCount(record.answer), source: maxCount(record.source)};
      }
      if (lessons.has(stored.lastLesson)) next.lastLesson = stored.lastLesson;
    }
    } catch (_) { recovered = true; }
    return next;
  }
  state = loadStored();
  function announce(text) { if ($('live-status')) $('live-status').textContent = text; }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageFailed = false;
      if ($('storage-status')) {
        $('storage-status').hidden = !recovered;
        $('storage-status').textContent = recovered ? '읽기 기록의 형식이 손상되어 새 기록으로 복구했습니다. 실습 앱의 기록은 변경하지 않았습니다.' : '';
      }
    } catch (_) {
      storageFailed = true;
      if ($('storage-status')) {
        $('storage-status').hidden = false;
        $('storage-status').textContent = '현재 브라우저에 서재 기록을 저장할 수 없습니다. 이 화면에서는 계속 읽고 기록할 수 있지만 다시 열면 기록이 남지 않을 수 있습니다.';
      }
    }
  }
  function assistanceFor(scope) {
    const keys = new Set(['library', scope]);
    const lesson = lessons.get(scope);
    if (lesson) keys.add(lesson.courseId);
    const total = {hint: 0, answer: 0, source: 0};
    for (const key of keys) {
      const help = state.help[key];
      if (help) for (const kind of Object.keys(total)) total[kind] += maxCount(help[kind]);
    }
    return total;
  }
  function helpText(scope) {
    const h = assistanceFor(scope);
    return `서재 도움 열람 · 힌트 ${h.hint}회 · 정답 ${h.answer}회 · 원문·참고 자료 ${h.source}회`;
  }
  function renderRecords() {
    $$('[data-bookmark]').forEach(button => {
      const on = !!state.bookmarks[button.dataset.bookmark];
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? '북마크됨 ✓' : '북마크 +';
    });
    $$('[data-mark-read]').forEach(button => {
      const on = !!state.read[button.dataset.markRead];
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? '읽음 표시 해제' : '읽음 표시';
    });
    $$('[data-read-status]').forEach(node => { node.textContent = state.read[node.dataset.readStatus] ? '읽음 표시됨' : '아직 읽지 않음'; });
    $$('[data-read-dot]').forEach(node => {
      const on = !!state.read[node.dataset.readDot];
      node.textContent = on ? '●' : '○'; node.setAttribute('aria-label', on ? '읽음 표시됨' : '아직 읽지 않음');
    });
    $$('[data-course-progress]').forEach(node => {
      const items = catalog.lessons.filter(l => l.courseId === node.dataset.courseProgress);
      node.textContent = `읽음 ${items.filter(l => state.read[l.id]).length} / ${items.length}`;
    });
    $$('[data-help-status]').forEach(node => { node.textContent = helpText(node.dataset.helpStatus); });
    if ($('record-summary')) $('record-summary').textContent = `읽음 ${Object.keys(state.read).length} / ${lessons.size} · 북마크 ${Object.keys(state.bookmarks).length}`;
    if ($('continue-link') && state.lastLesson && lessons.has(state.lastLesson)) {
      const last = lessons.get(state.lastLesson);
      $('continue-link').href = root + last.url;
      $('continue-link').textContent = `${last.code} 이어 읽기 →`;
    } else if ($('continue-link')) {
      $('continue-link').href = root + 'courses/' + catalog.courses[0].id + '.html';
      $('continue-link').textContent = '첫 수업 만나기 →';
    }
  }
  function recordAssistance(kind, scope) {
    if (!['hint', 'answer', 'source'].includes(kind) || !scopeIds.has(scope)) return;
    const help = state.help[scope] || {hint: 0, answer: 0, source: 0};
    help[kind] = Math.min(help[kind] + 1, 99999);
    state.help[scope] = help;
    recovered = false;
    persist(); renderRecords();
    announce((kind === 'hint' ? '힌트' : kind === 'answer' ? '정답' : '자료') + ' 열람을 서재에 기록했습니다. 실습 앱의 기록과는 별개입니다.');
  }
  $$('[data-bookmark]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.bookmark;
    if (!lessons.has(id)) return;
    if (state.bookmarks[id]) delete state.bookmarks[id]; else state.bookmarks[id] = true;
    recovered = false; persist(); renderRecords();
    if (page === 'home') renderSearch();
    announce(state.bookmarks[id] ? '수업을 북마크했습니다.' : '북마크를 해제했습니다.');
  }));
  $$('[data-mark-read]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.markRead;
    if (!lessons.has(id)) return;
    if (state.read[id]) delete state.read[id]; else state.read[id] = true;
    recovered = false; persist(); renderRecords();
    announce(state.read[id] ? '읽음 표시를 남겼습니다. 실습 통과 기록은 아닙니다.' : '읽음 표시를 해제했습니다.');
  }));
  $$('details[data-assistance]').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) recordAssistance(details.dataset.assistance, details.dataset.scope);
  }));
  $$('a[data-assistance]').forEach(link => link.addEventListener('click', () => recordAssistance(link.dataset.assistance, link.dataset.scope)));
  $$('a[data-assistance]').forEach(link => link.addEventListener('auxclick', event => {
    if (event.button === 1) recordAssistance(link.dataset.assistance, link.dataset.scope);
  }));

  function normalize(value) { return String(value).normalize('NFKC').trim().toLocaleLowerCase(); }
  function codeTarget(value) {
    const wanted = normalize(value).replace(/\s/g, '');
    for (const lesson of catalog.lessons) {
      if (normalize(lesson.code) === wanted) return {lesson, micro: null};
      const micro = (lesson.step.microActions || []).find(m => normalize(m.code) === wanted);
      if (micro) return {lesson, micro};
    }
    return null;
  }
  function lessonHref(target) { return root + target.lesson.url + (target.micro ? '#' + encodeURIComponent(target.micro.id) : ''); }
  function revealHash() {
    if (!location.hash || page !== 'lesson') return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let ancestor = target.parentElement;
    while (ancestor) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    requestAnimationFrame(() => target.scrollIntoView({block: 'start'}));
  }
  if ($('lesson-jump')) $('lesson-jump').addEventListener('change', event => { location.href = event.target.value; });
  window.addEventListener('hashchange', revealHash);
  if (currentLesson && lessons.has(currentLesson)) {
    state.lastLesson = currentLesson;
    persist();
    revealHash();
  } else if (recovered) persist();

  let selectedFilter = 'all';
  function searchFromUrl() {
    if (page !== 'home') return;
    const params = new URLSearchParams(location.search);
    $('search-input').value = params.get('q') || '';
    const filter = params.get('filter') || (params.get('view') === 'records' ? 'records' : 'all');
    selectedFilter = ['all', 'bookmarks', 'read', 'records'].includes(filter) ? filter : 'all';
    expanded = false;
    $('library-heading').textContent = selectedFilter === 'records' ? '내가 남긴 읽기 기록' : '필요한 수업을 찾아보세요';
    renderSearch();
  }
  function renderSearch() {
    if (page !== 'home') return;
    const tokens = normalize($('search-input').value).split(/\s+/).filter(Boolean);
    let matched = 0, visible = 0;
    const limited = !tokens.length && selectedFilter === 'all' && !expanded;
    $$('[data-testid="lesson-result"]').forEach(card => {
      const id = card.dataset.lessonId;
      const haystack = normalize(card.dataset.search + ' ' + card.dataset.codes);
      const searchMatch = tokens.every(token => haystack.includes(token));
      const filterMatch = selectedFilter === 'all' || selectedFilter === 'bookmarks' && !!state.bookmarks[id] || selectedFilter === 'read' && !!state.read[id] || selectedFilter === 'records' && (!!state.read[id] || !!state.bookmarks[id] || !!state.help[id]);
      const match = searchMatch && filterMatch;
      if (match) matched++;
      const show = match && (!limited || visible < 9);
      card.hidden = !show;
      if (show) visible++;
    });
    $$('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === selectedFilter)));
    $('result-count').textContent = matched ? `${matched}개 수업${visible < matched ? ` 중 ${visible}개 표시` : ''}` : '검색 결과 없음';
    $('empty-results').hidden = matched > 0;
    $('show-all-lessons').hidden = !(limited && matched > visible);
    $('show-all-lessons').textContent = `수업 ${matched}개 모두 펼치기`;
  }
  function pushSearch() {
    const url = new URL(location.href);
    const value = $('search-input').value.trim();
    if (value) url.searchParams.set('q', value); else url.searchParams.delete('q');
    url.searchParams.delete('view');
    if (selectedFilter !== 'all') url.searchParams.set('filter', selectedFilter); else url.searchParams.delete('filter');
    url.hash = 'library';
    history.pushState(null, '', url.href);
    expanded = false;
    renderSearch();
  }
  if (page === 'home') {
    $('search-form').addEventListener('submit', event => { event.preventDefault(); pushSearch(); });
    $('book-code-form').addEventListener('submit', event => {
      event.preventDefault();
      const target = codeTarget($('book-code-input').value);
      if (target) location.href = lessonHref(target);
      else {
        $('code-message').hidden = false;
        $('code-message').textContent = '해당 책 코드를 찾지 못했습니다. FN01, DC01, WB05.6, KP01처럼 입력하세요.';
      }
    });
    $$('[data-filter]').forEach(button => button.addEventListener('click', () => { selectedFilter = button.dataset.filter; pushSearch(); }));
    $('show-all-lessons').addEventListener('click', () => { expanded = true; renderSearch(); });
    $('reset-reading').addEventListener('click', () => {
      if (!window.confirm('서재의 읽음·북마크·도움 열람 기록을 초기화할까요? 각 실습 앱의 진행 기록은 바뀌지 않습니다.')) return;
      state = fresh(); recovered = false;
      persist(); renderRecords(); renderSearch();
      if ($('continue-link')) { $('continue-link').href = 'courses/' + catalog.courses[0].id + '.html'; $('continue-link').textContent = '첫 수업 만나기 →'; }
      announce('서재 기록을 초기화했습니다. 실습 앱의 기록은 유지됩니다.');
    });
    searchFromUrl();
  }

  function practiceFromUrl() {
    if (page !== 'practice') return;
    const params = new URLSearchParams(location.search);
    let course = courses.get(params.get('course')) || catalog.courses[0];
    const requested = params.get('code');
    let target = requested ? codeTarget(requested) : null;
    if (target && target.lesson.courseId !== course.id) {
      if (!params.has('course')) course = courses.get(target.lesson.courseId);
      else target = null;
    }
    const items = catalog.lessons.filter(l => l.courseId === course.id);
    if (!target) target = {lesson: items[0], micro: null};
    const lesson = target.lesson;
    $('practice-course').value = course.id;
    $('practice-step').replaceChildren(...items.map(l => {
      const option = document.createElement('option'); option.value = l.code; option.textContent = l.code + ' · ' + l.title; return option;
    }));
    $('practice-step').value = lesson.code;
    $('practice-code').value = target.micro ? target.micro.code : lesson.code;
    $('return-lesson').href = lessonHref(target);
    const available = !!course.practiceEntry;
    $('practice-unavailable').hidden = available;
    $('practice-frame-wrap').hidden = !available;
    $('practice-direct').hidden = !available;
    $('practice-message').hidden = !requested || !!codeTarget(requested) && codeTarget(requested).lesson.courseId === course.id;
    $('practice-message').textContent = '선택한 장에서 코드를 찾지 못해 첫 수업을 열었습니다.';
    $('practice-help-status').dataset.helpStatus = lesson.id;
    $('practice-help-status').textContent = helpText(lesson.id);
    if (!available) {
      const blankFrame = $('practice-frame').cloneNode(false);
      blankFrame.removeAttribute('src');
      delete blankFrame.dataset.activeEntry;
      $('practice-frame').replaceWith(blankFrame);
      $('practice-direct').removeAttribute('href');
      $('practice-boundary').textContent = '문서 편집 장은 자료와 도해만 제공합니다. Word 조작·파일 저장·PDF 생성은 이 화면에서 검증하지 않습니다.';
      return;
    }
    const deepLink = target.micro && target.micro.deepLink ? target.micro.deepLink : '#' + course.lessonId + '/' + lesson.step.id;
    const entry = root + course.practiceEntry + deepLink;
    const frame = $('practice-frame');
    const previousEntry = frame.dataset.activeEntry || frame.getAttribute('src') || '';
    const destination = new URL(entry, document.baseURI).href;
    let actualEntry = previousEntry ? new URL(previousEntry, document.baseURI).href : '';
    let actualRouteReadable = false;
    try {
      const currentEntry = frame.contentWindow.location.href;
      if (currentEntry && currentEntry !== 'about:blank') {
        actualEntry = currentEntry;
        actualRouteReadable = true;
      }
    } catch (_) { /* file:// frames may have opaque origins; replace the route explicitly below. */ }
    if (actualEntry !== destination || !actualRouteReadable) {
      if (previousEntry && previousEntry.split('#')[0] === entry.split('#')[0]) {
        // Preserve in-memory work within an app; replace its route so it does
        // not add a second entry to the parent's Back history.
        frame.contentWindow.location.replace(destination);
        frame.dataset.activeEntry = entry;
      } else {
        const nextFrame = frame.cloneNode(false);
        nextFrame.src = entry;
        nextFrame.dataset.activeEntry = entry;
        frame.replaceWith(nextFrame);
      }
    }
    $('practice-frame').title = course.title + ' · ' + (target.micro ? target.micro.code : lesson.code) + ' 실습';
    $('practice-direct').href = entry;
    $('practice-boundary').textContent = '실습 앱의 판정은 앱 안 조건을 확인합니다. 아래 서재 도움 열람과 실습 앱 안의 수행 기록은 별도이며 서로 자동으로 합치지 않습니다.';
  }
  function navigatePractice(course, code) {
    const url = new URL(location.href);
    url.searchParams.set('course', course);
    if (code) url.searchParams.set('code', code); else url.searchParams.delete('code');
    history.pushState(null, '', url.href);
    practiceFromUrl();
  }
  if (page === 'practice') {
    $('practice-course').addEventListener('change', () => navigatePractice($('practice-course').value));
    $('practice-step').addEventListener('change', () => navigatePractice($('practice-course').value, $('practice-step').value));
    $('practice-code-form').addEventListener('submit', event => {
      event.preventDefault();
      const target = codeTarget($('practice-code').value);
      if (target) navigatePractice(target.lesson.courseId, target.micro ? target.micro.code : target.lesson.code);
      else { $('practice-message').hidden = false; $('practice-message').textContent = '책 코드를 찾을 수 없습니다. 장의 수업을 선택하거나 코드를 다시 입력하세요.'; }
    });
    practiceFromUrl();
  }
  window.addEventListener('popstate', () => { searchFromUrl(); practiceFromUrl(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !storageFailed) state = loadStored();
    renderRecords();
    if (page === 'home') renderSearch();
    if (page === 'practice') practiceFromUrl();
    revealHash();
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    state = loadStored(); renderRecords();
    if (page === 'home') renderSearch();
  });
  renderRecords();
})();
