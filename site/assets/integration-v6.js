(() => {
  'use strict';
  const data = window.TUTORIAL_INTEGRATION_V6;
  if (!data || !Array.isArray(data.documents)) return;
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const matches = (doc, query) => normalize(query).split(/\s+/).filter(Boolean).every(token => normalize(doc.searchText).includes(token));
  const byId = new Map(data.documents.map(doc => [doc.id, doc]));
  const page = document.body.dataset.page;
  if (page === 'integration') {
    const input = document.getElementById('integration-search');
    const render = () => {
      let found = 0;
      document.querySelectorAll('[data-integration-document]').forEach(card => {
        const doc = byId.get(card.dataset.integrationDocument);
        const show = !!doc && matches(doc, input.value);
        card.hidden = !show;
        if (show) found++;
      });
      document.getElementById('integration-result-count').textContent = `${found}개 추가 문서 · 기존 66개 수업과 별도`;
      document.getElementById('integration-empty').hidden = found !== 0;
    };
    const restore = () => { input.value = new URL(location.href).searchParams.get('q') || ''; render(); };
    document.getElementById('integration-search-form').addEventListener('submit', event => {
      event.preventDefault();
      const url = new URL(location.href);
      if (input.value.trim()) url.searchParams.set('q', input.value.trim()); else url.searchParams.delete('q');
      url.hash = 'documents';
      history.pushState(null, '', url.href);
      render();
    });
    window.addEventListener('popstate', restore);
    restore();
  }
  if (page === 'home') {
    const summary = document.getElementById('integration-home-summary');
    const results = document.getElementById('integration-home-results');
    const link = document.getElementById('integration-home-search-link');
    if (!summary || !results || !link) return;
    const render = () => {
      const query = document.getElementById('search-input').value;
      const docs = data.documents.filter(doc => matches(doc, query));
      summary.textContent = `${data.summary.sourceReviewedDocuments} / 77개 원천 검토 기록 · ${data.summary.renderedBodies}개 추가 본문 · 검색 결과 ${docs.length}개`;
      link.href = 'integration.html' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '') + '#documents';
      results.replaceChildren();
      for (const doc of docs.slice(0, 6)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = doc.url || 'integration.html#' + encodeURIComponent(doc.id);
        a.textContent = doc.title;
        const status = document.createElement('span');
        status.className = 'small';
        status.textContent = ' · ' + ({integrated:'본문 통합',conditional:'조건부',blocked:'원천 확인 차단','review-pending':'검수 대기',duplicate:'중복 제외'}[doc.displayStatus] || doc.displayStatus);
        li.append(a, status); results.append(li);
      }
    };
    document.getElementById('search-form').addEventListener('submit', render);
    window.addEventListener('popstate', render);
    render();
  }
})();
