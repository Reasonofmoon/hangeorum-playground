// 사이트·API 상태 점검. 로그인 없이 호출해서 "미리보기만" 나오는지 확인한다.
import fs from 'node:fs';
const API = fs.readFileSync(new URL('../gas/api/.exec-url', import.meta.url), 'utf8').trim();
const SITE = 'https://devlog.moonlang.com/hangeorum-playground/';
const fail = m => { console.error('실패:', m); process.exitCode = 1; };
const post = async body => (await fetch(API, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'text/plain;charset=utf-8' } })).json();

const h = await (await fetch(API + '?action=health')).json();
console.log('health', h); if (!h.ok) fail('API health');
const site = await fetch(SITE + 'index.html'); console.log('site', site.status); if (!site.ok) fail('사이트 응답 ' + site.status);
const leak = await fetch(SITE + 'data/playground-v7.js'); if (leak.status !== 404) fail('공개 사이트에 data/playground-v7.js 가 있습니다');
const b = await post({ action: 'bundle', paths: ['data/playground-v7.js'], page: '/smoke' });
const js = b.files?.['data/playground-v7.js'] || '';
const cat = JSON.parse(js.replace(/^window\.PLAYGROUND_CATALOG=/, '').replace(/;$/, ''));
const over = cat.items.filter(i => i.steps.length > 2);
console.log('preview items', cat.items.length, 'level', b.level);
if (b.level !== 'preview' || over.length) fail('비로그인 응답에 전체 단계가 들어 있습니다');
const g = await post({ action: 'bundle', paths: ['data/catalog.js'], main: 'lessons/document/dc-01.html' });
if (g.main || Object.keys(g.files || {}).length) fail('비로그인 응답에 원문이 들어 있습니다');
const img = await fetch(SITE + 'assets/supplements/AI04/1-fca45006e0bb.jpg'); if (img.status !== 404) fail('공개 사이트에 원문 그림이 있습니다 (' + img.status + ')');
const md = await post({ action: 'media', paths: ['assets/supplements/AI04/1-fca45006e0bb.jpg'] });
if (md.ok !== false || Object.keys(md.files || {}).length) fail('비로그인 응답에 원문 그림이 들어 있습니다');
console.log(process.exitCode ? '점검 실패' : '점검 통과');
