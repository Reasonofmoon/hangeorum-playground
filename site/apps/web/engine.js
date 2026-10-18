(function (global) {
  'use strict';

  // This is a deliberately small teaching language, not a general HTML sanitizer.
  // Never feed raw input to DOMParser, innerHTML, or an iframe. The bounded scanner
  // first rejects every tag and attribute outside this grammar, then reconstructs
  // markup with quoted, validated attribute values. Only that reconstruction is
  // parsed. None of its allowed elements/attributes can load a URL or execute code.
  // A second allowlist serialization escapes all DOM text before previewing it.
  // Consumers MUST keep sandbox="" on the preview iframe (no allow-* tokens).
  const TAGS = new Set(['html', 'head', 'body', 'title', 'meta', 'h1', 'h2', 'p', 'ul', 'ol', 'li']);
  const MAX_SOURCE = 65536;
  const MAX_TAGS = 2048;
  const MAX_DEPTH = 128;
  const CSP = "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const LABELS = {
    safety: '허용된 HTML 요소와 속성만 사용',
    doctype: '<!doctype html> 선언 1개',
    lang: 'html의 언어는 ko',
    charset: 'head 안 UTF-8 문자 인코딩 1개',
    title: '탭 제목 1개와 조건의 내용',
    heading: '본문 제목 h1 1개와 조건의 내용',
    paragraph: '소개 p 1개와 조건의 내용',
    listHeading: '목록 제목 h2 1개와 조건의 내용',
    listType: '조건에 맞는 목록 종류 1개',
    listOpen: '원본 목록 시작 태그의 종류',
    listClose: '원본 목록 종료 태그의 종류',
    items: '목록 항목 개수와 내용',
    order: '목록 항목의 순서',
    structure: 'head와 body의 구조 및 본문 요소 순서',
    h1Pair: '원본 h1 시작·종료 태그 각 1개',
    tagPairs: '원본 태그의 시작·종료 짝과 순서'
  };
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const text = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const lower = value => String(value || '').toLowerCase();
  const check = (id, pass) => ({ id, label: LABELS[id], pass: Boolean(pass) });
  const isSpace = ch => /[\t\n\f\r ]/.test(ch || '');

  function preview(body, title, lang) {
    // The wrapper is engine-authored. A missing/invalid source declaration remains
    // a failed check even though this wrapper supplies safe preview defaults.
    return '<!doctype html><html lang="' + escape(lang || 'ko') + '"><head>' +
      '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + escape(CSP) + '">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escape(title || 'HTML 실습 미리보기') + '</title></head><body>' + body + '</body></html>';
  }

  function blocked(message) {
    return {
      safe: false,
      html: preview('<p>미리보기를 보류했습니다. 허용된 HTML 요소와 속성을 확인하세요.</p>', '미리보기 보류', 'ko'),
      issues: [message],
      checks: Object.keys(LABELS).map(id => check(id, false)),
      passed: false,
      title: ''
    };
  }

  function attributes(tag, raw) {
    const result = Object.create(null);
    let cursor = 0;
    let count = 0;
    while (cursor < raw.length) {
      if (!isSpace(raw[cursor])) throw new Error('속성 사이에는 공백이 필요합니다.');
      while (cursor < raw.length && isSpace(raw[cursor])) cursor++;
      if (cursor === raw.length) break;
      const match = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(raw.slice(cursor));
      if (!match) throw new Error('허용하지 않는 속성 표기입니다.');
      const name = lower(match[0]);
      cursor += match[0].length;
      while (cursor < raw.length && isSpace(raw[cursor])) cursor++;
      if (raw[cursor++] !== '=') throw new Error('속성에는 값이 필요합니다.');
      while (cursor < raw.length && isSpace(raw[cursor])) cursor++;
      let value;
      if (raw[cursor] === '"' || raw[cursor] === "'") {
        const quote = raw[cursor++];
        const end = raw.indexOf(quote, cursor);
        if (end < 0) throw new Error('속성의 따옴표를 닫으세요.');
        value = raw.slice(cursor, end);
        cursor = end + 1;
      } else {
        const start = cursor;
        while (cursor < raw.length && !isSpace(raw[cursor])) cursor++;
        value = raw.slice(start, cursor);
        if (!value || /["'`=<>]/.test(value)) throw new Error('속성 값 표기를 확인하세요.');
      }
      if (++count > 3 || Object.hasOwn(result, name)) throw new Error('중복되거나 너무 많은 속성이 있습니다.');
      // Do not entity-decode attributes: the tiny permitted ASCII grammar needs
      // neither entities nor URLs, so encoded attribute attacks fail before parsing.
      if (value.length > 128 || /[&<>\u0000-\u001f\u007f]/.test(value)) throw new Error('속성 값에 허용하지 않는 문자가 있습니다.');
      if (tag === 'html' && name === 'lang' && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)) {
        result[name] = value;
      } else if (tag === 'meta' && ['charset', 'name', 'content'].includes(name)) {
        result[name] = value;
      } else {
        throw new Error('<' + tag + '>의 ' + name + ' 속성은 이 실습에서 허용하지 않습니다.');
      }
    }
    if (tag === 'meta') {
      const names = Object.keys(result);
      const charset = names.length === 1 && names[0] === 'charset' && /^utf-?8$/i.test(result.charset);
      const viewport = names.length === 2 && lower(result.name) === 'viewport' && typeof result.content === 'string' &&
        /^width\s*=\s*device-width\s*(?:,\s*initial-scale\s*=\s*1(?:\.0+)?\s*)?$/i.test(result.content.trim());
      if (!charset && !viewport) throw new Error('meta에는 UTF-8 charset 또는 기본 viewport만 허용합니다.');
    }
    return result;
  }

  function scan(source) {
    let cursor = 0;
    let reconstructed = '';
    let tagPairs = true;
    let doctypeCount = 0;
    let doctypeBeforeMarkup = true;
    let markupSeen = false;
    const tokens = [];
    const stack = [];
    while (cursor < source.length) {
      if (source[cursor] !== '<') {
        const next = source.indexOf('<', cursor);
        const end = next < 0 ? source.length : next;
        const chunk = source.slice(cursor, end);
        reconstructed += chunk;
        if (chunk.trim()) markupSeen = true;
        cursor = end;
        continue;
      }
      if (source.startsWith('<!--', cursor)) {
        if (stack.includes('title')) {
          // In title (RCDATA), a comment opener is literal text. Escape only its
          // first '<', then keep scanning: a later </title> may end RCDATA, after
          // which forbidden tags MUST still be rejected before DOMParser.
          reconstructed += '&lt;';
          cursor++;
          continue;
        }
        const end = source.indexOf('-->', cursor + 4);
        if (end < 0) throw new Error('HTML 주석을 닫으세요.');
        const content = source.slice(cursor + 4, end);
        if (/^(?:>|->)/.test(content) || content.includes('--') || content.endsWith('-')) throw new Error('표준적인 <!-- 설명 --> 형식의 주석만 사용하세요.');
        // Omit comments entirely so legacy/malformed comment parsing cannot matter.
        cursor = end + 3;
        continue;
      }
      const declaration = /^<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/i.exec(source.slice(cursor));
      if (declaration) {
        doctypeCount++;
        if (markupSeen) doctypeBeforeMarkup = false;
        reconstructed += '<!doctype html>';
        cursor += declaration[0].length;
        continue;
      }
      const start = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(source.slice(cursor));
      if (!start) throw new Error('허용하지 않는 선언 또는 완성되지 않은 HTML 태그입니다.');
      const closing = Boolean(start[1]);
      const name = lower(start[2]);
      if (!TAGS.has(name)) throw new Error('<' + (closing ? '/' : '') + name + '> 요소는 이 실습에서 허용하지 않습니다.');
      const attrStart = cursor + start[0].length;
      let end = attrStart;
      let quote = '';
      for (; end < source.length; end++) {
        const ch = source[end];
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
        else if (ch === '<') throw new Error('태그 안에 다른 태그를 넣을 수 없습니다.');
      }
      if (end === source.length) throw new Error('태그 또는 속성의 끝을 닫으세요.');
      let raw = source.slice(attrStart, end);
      const slash = /\/[\t\n\f\r ]*$/.exec(raw);
      // A slash attached to an unquoted value belongs to that value (utf-8/),
      // not to a self-closing marker. Do not silently correct the source.
      const selfClosing = Boolean(slash && (slash.index === 0 || /[\t\n\f\r '" ]/.test(raw[slash.index - 1])));
      if (selfClosing) raw = raw.slice(0, slash.index);
      if (closing && (!/^[\t\n\f\r ]*$/.test(raw) || selfClosing)) throw new Error('닫는 태그에는 속성을 넣지 마세요.');
      if (selfClosing && name !== 'meta') throw new Error('<' + name + '>는 별도의 닫는 태그가 필요합니다.');
      const attrs = closing ? Object.create(null) : attributes(name, raw);
      if (tokens.length >= MAX_TAGS) throw new Error('태그가 너무 많습니다. 이 실습의 짧은 HTML만 입력하세요.');
      tokens.push({ name, closing, attrs, parent: stack.length ? stack[stack.length - 1] : null });
      if (name === 'meta') {
        if (closing) tagPairs = false;
      } else if (closing) {
        if (stack.pop() !== name) tagPairs = false;
      } else {
        stack.push(name);
        if (stack.length > MAX_DEPTH) throw new Error('요소의 중첩이 너무 깊습니다.');
      }
      reconstructed += '<' + (closing ? '/' : '') + name + Object.entries(attrs).map(([key, val]) => ' ' + key + '="' + escape(val) + '"').join('') + '>';
      cursor = end + 1;
      markupSeen = true;
    }
    if (stack.length) tagPairs = false;
    return { reconstructed, tokens, tagPairs, doctypeCount, doctypeBeforeMarkup };
  }

  function serialize(node) {
    if (node.nodeType === 3) return escape(node.nodeValue);
    if (node.nodeType !== 1) return '';
    const name = lower(node.localName);
    if (!TAGS.has(name) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('허용하지 않는 DOM 요소입니다.');
    const attrs = attributes(name, Array.from(node.attributes, attr => ' ' + attr.name + '="' + attr.value + '"').join(''));
    const opening = '<' + name + Object.entries(attrs).map(([key, val]) => ' ' + key + '="' + escape(val) + '"').join('') + '>';
    if (name === 'meta') return opening;
    return opening + Array.from(node.childNodes, serialize).join('') + '</' + name + '>';
  }

  function inspect(source, scenario) {
    if (typeof source !== 'string') return blocked('HTML 코드를 문자열로 입력하세요.');
    if (source.length > MAX_SOURCE) return blocked('HTML 코드는 65,536자 이하로 입력하세요.');
    if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(source)) return blocked('제어 문자는 HTML 코드에 넣을 수 없습니다.');
    let parsed;
    let doc;
    try {
      parsed = scan(source);
      doc = new DOMParser().parseFromString(parsed.reconstructed, 'text/html');
      // Validate every DOM element, including elements the parser may have moved.
      for (const node of doc.querySelectorAll('*')) {
        if (!TAGS.has(lower(node.localName)) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('허용하지 않는 DOM 요소입니다.');
        attributes(lower(node.localName), Array.from(node.attributes, attr => ' ' + attr.name + '="' + attr.value + '"').join(''));
      }
    } catch (error) { return blocked(error.message); }

    const all = name => Array.from(doc.querySelectorAll(name));
    const tokenCount = (name, closing) => parsed.tokens.filter(token => token.name === name && token.closing === closing).length;
    const exact = (name, value, parent) => {
      const nodes = all(name);
      return nodes.length === 1 && nodes[0].parentElement === parent && nodes[0].children.length === 0 && text(nodes[0].textContent) === text(value);
    };
    const validScenario = scenario && ['tabTitle', 'heading', 'paragraph', 'listHeading'].every(key => typeof scenario[key] === 'string') &&
      ['ul', 'ol'].includes(scenario.listType) && Array.isArray(scenario.items) && scenario.items.length > 0 && scenario.items.every(item => typeof item === 'string');
    const expected = validScenario ? scenario : { tabTitle: '', heading: '', paragraph: '', listHeading: '', listType: 'ul', items: [] };
    const lists = all('ul,ol');
    const list = lists.length === 1 ? lists[0] : null;
    const listType = Boolean(list && lower(list.localName) === expected.listType && list.parentElement === doc.body);
    const items = list ? Array.from(list.children) : [];
    const actualTexts = items.map(item => text(item.textContent));
    const wantedTexts = expected.items.map(text);
    const sameItems = actualTexts.length === wantedTexts.length && JSON.stringify([...actualTexts].sort()) === JSON.stringify([...wantedTexts].sort());
    const cleanItems = Boolean(list && items.every(item => lower(item.localName) === 'li' && item.children.length === 0) && all('li').length === items.length &&
      Array.from(list.childNodes).every(node => node.nodeType === 1 || !text(node.textContent)));
    const bodyOrder = Array.from(doc.body.children).map(node => lower(node.localName));
    const sourceShell = ['html', 'head', 'body'].every(name => tokenCount(name, false) === 1 && tokenCount(name, true) === 1);
    const sourcePlacement = parsed.tokens.filter(token => !token.closing).every(token => {
      if (token.name === 'html') return token.parent === null;
      if (['head', 'body'].includes(token.name)) return token.parent === 'html';
      if (['meta', 'title'].includes(token.name)) return token.parent === 'head';
      if (token.name === 'li') return ['ul', 'ol'].includes(token.parent);
      return token.parent === 'body';
    });
    const cleanHead = Array.from(doc.head.children).every(node => ['title', 'meta'].includes(lower(node.localName))) &&
      Array.from(doc.head.childNodes).every(node => node.nodeType === 1 || !text(node.textContent));
    const cleanBody = Array.from(doc.body.childNodes).every(node => node.nodeType === 1 || !text(node.textContent));
    const metas = all('meta');
    const charsets = metas.filter(node => node.hasAttribute('charset'));
    const viewports = metas.filter(node => node.getAttribute('name') && lower(node.getAttribute('name')) === 'viewport');
    const h1Pair = tokenCount('h1', false) === 1 && tokenCount('h1', true) === 1;
    const checks = [
      check('safety', true),
      check('doctype', parsed.doctypeCount === 1 && parsed.doctypeBeforeMarkup && doc.doctype && lower(doc.doctype.name) === 'html'),
      check('lang', tokenCount('html', false) === 1 && lower(doc.documentElement.getAttribute('lang')) === 'ko'),
      check('charset', charsets.length === 1 && charsets[0].parentElement === doc.head && /^utf-?8$/i.test(charsets[0].getAttribute('charset'))),
      check('title', validScenario && exact('title', expected.tabTitle, doc.head) && tokenCount('title', false) === 1),
      check('heading', validScenario && exact('h1', expected.heading, doc.body)),
      check('paragraph', validScenario && exact('p', expected.paragraph, doc.body)),
      check('listHeading', validScenario && exact('h2', expected.listHeading, doc.body)),
      check('listType', validScenario && listType),
      check('listOpen', validScenario && tokenCount(expected.listType, false) === 1 && tokenCount(expected.listType === 'ol' ? 'ul' : 'ol', false) === 0),
      check('listClose', validScenario && tokenCount(expected.listType, true) === 1 && tokenCount(expected.listType === 'ol' ? 'ul' : 'ol', true) === 0),
      check('items', validScenario && cleanItems && sameItems),
      check('order', validScenario && cleanItems && actualTexts.length === wantedTexts.length && actualTexts.every((value, i) => value === wantedTexts[i])),
      check('structure', validScenario && sourceShell && sourcePlacement && cleanHead && cleanBody && viewports.length <= 1 && metas.every(node => node.parentElement === doc.head) &&
        JSON.stringify(bodyOrder) === JSON.stringify(['h1', 'p', 'h2', expected.listType]) && cleanItems),
      check('h1Pair', h1Pair),
      check('tagPairs', parsed.tagPairs)
    ];
    wantedTexts.forEach((value, index) => checks.push({
      id: 'item-' + (index + 1),
      label: '목록 ' + (index + 1) + '번째 항목의 내용',
      pass: Boolean(validScenario && list && items[index] && lower(items[index].localName) === 'li' && items[index].children.length === 0 && actualTexts[index] === value)
    }));
    const issues = [];
    if (!validScenario) issues.push('검사할 과제 조건이 없거나 형식이 올바르지 않습니다.');
    if (!h1Pair) issues.push('원본의 <h1>과 </h1>이 각각 하나인지 확인하세요. 브라우저는 잘못된 태그를 보정할 수 있습니다.');
    if (!parsed.tagPairs) issues.push('원본 태그의 시작·종료 짝과 순서를 확인하세요.');
    const title = text(doc.title);
    let html;
    try { html = preview(Array.from(doc.body.childNodes, serialize).join(''), title, doc.documentElement.getAttribute('lang')); }
    catch (error) { return blocked(error.message); }
    // Passing establishes the supplied practice conditions only; it cannot prove
    // real disk saves, independent learning, accessibility, or publication readiness.
    return { safe: true, html, issues, checks, passed: checks.every(item => item.pass), title };
  }

  global.WebPracticeEngine = Object.freeze({ inspect });
})(window);
