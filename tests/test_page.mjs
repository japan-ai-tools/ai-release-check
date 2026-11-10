// node --test tests/test_page.mjs — 無料の回数・SNSの型・ページの決まり
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Q = require('../quota.js');
const SNS = require('../sns.js');

test('無料は1か月3曲まで。同じ曲は数えない', () => {
  let st = null;
  for (const t of ['A', 'B', 'C']) { const u = Q.use(st, { title: t, artist: 'MIRO' }, '2026-11'); assert.ok(u.allowed); st = u.state; }
  assert.equal(Q.use(st, { title: 'D', artist: 'MIRO' }, '2026-11').allowed, false);
  const again = Q.use(st, { title: ' a ', artist: 'miro' }, '2026-11');
  assert.ok(again.allowed); assert.equal(again.counted, false);
  assert.ok(Q.use(st, { title: 'D', artist: 'MIRO' }, '2026-12').allowed, '翌月は戻る');
});

test('保存が使えない端末でも止まらない', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(Q.load(broken), null);
  assert.equal(Q.save(broken, {}), false);
  const mem = {}; const ok = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  assert.ok(Q.save(ok, { month: '2026-11', songs: ['a'] }));
  assert.deepEqual(Q.load(ok).songs, ['a']);
});

test('SNSの型はAIを使ったことを書く(日本語・英語)', () => {
  const song = { title: '雨の街', artist: 'MIRO', featuring: ['Aki'], ai: { tool: 'Suno', version: 'v5' }, human_work: ['作詞'] };
  const ja = SNS.posts(song, 'ja', { link: 'https://example.com/x' });
  assert.match(ja.x, /AI\(Suno v5\)を使って作りました/);
  assert.match(ja.youtube_title, /MIRO「雨の街 \(feat\. Aki\)」/);
  assert.ok(ja.youtube_description.includes('https://example.com/x'));
  const en = SNS.posts(song, 'en');
  assert.match(en.x, /Made with AI \(Suno v5\)\. My part: lyrics\./);
  assert.ok(en.youtube_tags.includes('AIMusic'));
  assert.equal(SNS.posts({ title: 'Song', artist: 'MIRO' }, 'ja').x.includes('AI('), false, 'AIを使っていなければ書かない');
});

test('ページ: 注意書き・公式ではない旨・外の読み込みなし・埋め込み先がある', () => {
  const html = readFileSync(new URL('../page/index.html', import.meta.url), 'utf8');
  for (const w of ['法律の助言でもありません', '公式の道具ではありません', '外には送りません', '1か月に3曲まで'])
    assert.ok(html.includes(w), w);
  assert.ok(!/<script[^>]+src=/i.test(html), '外のスクリプトを読まない');
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html), '外のスタイルを読まない');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(html), '通信しない');
  for (const m of ['/*@RULES@*/', '/*@CHECK@*/', '/*@QUOTA@*/', '/*@SNS@*/']) assert.equal(html.split(m).length, 2, m);
  assert.match(html, /name="viewport"/);
});

test('本体の部品は通信しない', () => {
  for (const f of ['../quota.js', '../sns.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const w of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket']) assert.ok(!src.includes(w), f + ' ' + w);
  }
});
