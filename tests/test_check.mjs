// node --test tests/test_check.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RC = require('../check.js');
const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));

const good = {
  title: 'Walking In The Rain',
  artist: 'MIRO',
  featuring: [],
  ai: { tool: 'Suno', version: 'v5', plan: 'paid', created: '2026-11-10' },
  human_work: ['作詞', '編曲の手直し'],
  lyrics: 'I walk alone\nUnder the rain',
  artwork: { width: 3000, height: 3000, format: 'jpg', text_kinds: [] },
  vocals: { sounds_like: '' },
  release: { duplicate: false },
  disclosures: { youtube_altered: true, credits_ai: true },
};
const plat = (rep, key) => rep.platforms.find((p) => p.key === key);
const item = (rep, id) => rep.platforms.flatMap((p) => p.items).find((i) => i.id === id);

test('整った曲はどの配信先でも「通る」', () => {
  const rep = RC.check(rules, good);
  assert.equal(rep.platforms.length, 5);
  for (const p of rep.platforms) assert.equal(p.verdict_ja, '通る', p.name);
});

test('アーティスト欄に Suno → Apple Music は断られる・直し方つき', () => {
  const rep = RC.check(rules, { ...good, artist: 'MIRO x Suno AI' });
  const i = item(rep, 'apple.artist.non_performer');
  assert.equal(i.result, 'ng');
  assert.ok(i.fix.includes('削る'));
  assert.equal(plat(rep, 'apple_music').verdict, 'block');
});

test('Studio という名前は道具の udio と取り違えない', () => {
  const rep = RC.check(rules, { ...good, artist: 'Studio Miro' });
  assert.equal(item(rep, 'apple.artist.non_performer').result, 'ok');
});

test('参加者欄の道具名も見つける', () => {
  const rep = RC.check(rules, { ...good, featuring: ['Udio'] });
  assert.equal(item(rep, 'apple.artist.non_performer').result, 'ng');
});

test('一般的な言葉のアーティスト名は断られる', () => {
  const rep = RC.check(rules, { ...good, artist: 'Lo-Fi' });
  assert.equal(item(rep, 'apple.artist.generic').result, 'ng');
});

test('feat の書き方', () => {
  assert.equal(item(RC.check(rules, { ...good, title: 'Song (feat. Aki)' }), 'apple.title.feat').result, 'ok');
  assert.equal(item(RC.check(rules, { ...good, title: 'Song ft. Aki' }), 'apple.title.feat').result, 'ng');
  assert.equal(item(RC.check(rules, { ...good, title: 'Song (Feat. Aki)' }), 'apple.title.feat').result, 'ng');
});

test('曲名の余計な言葉・全部大文字', () => {
  const rep = RC.check(rules, { ...good, title: 'RAIN (Original Mix)' });
  assert.equal(item(rep, 'apple.title.extra_words').result, 'ng');
  assert.equal(item(RC.check(rules, { ...good, title: 'RAIN IN THE CITY' }), 'apple.title.case').result, 'ng');
  assert.equal(item(RC.check(rules, { ...good, title: 'rain in the city' }), 'apple.title.case').result, 'ng');
  assert.equal(item(RC.check(rules, { ...good, title: '雨の街' }), 'apple.title.case').result, 'ok');
});

test('ジャケットの大きさ: TuneCore Japan は3000px未満で断られる', () => {
  const rep = RC.check(rules, { ...good, artwork: { width: 1400, height: 1400, format: 'png', text_kinds: [] } });
  assert.equal(item(rep, 'tunecore.art.spec').result, 'ng');
  assert.equal(plat(rep, 'tunecore_japan').verdict, 'block');
  const rect = RC.check(rules, { ...good, artwork: { width: 3000, height: 3200, format: 'jpg', text_kinds: [] } });
  assert.match(item(rect, 'tunecore.art.spec').detail, /正方形/);
  const gif = RC.check(rules, { ...good, artwork: { width: 3000, height: 3000, format: 'gif', text_kinds: [] } });
  assert.equal(item(gif, 'tunecore.art.spec').result, 'ng');
});

test('ジャケットのURL・SNS名', () => {
  const rep = RC.check(rules, { ...good, artwork: { ...good.artwork, text_kinds: ['url', 'social_handle'] } });
  const i = item(rep, 'apple.art.no_urls_logos');
  assert.equal(i.result, 'ng');
  assert.match(i.detail, /Webアドレス/);
});

test('実在の歌手に似せて許可なし → Spotify は断られる。許可ありは通る', () => {
  const ng = RC.check(rules, { ...good, vocals: { sounds_like: 'ある歌手', permission: false } });
  assert.equal(plat(ng, 'spotify').verdict, 'block');
  const ok = RC.check(rules, { ...good, vocals: { sounds_like: 'ある歌手', permission: true } });
  assert.equal(item(ok, 'spotify.voice.impersonation').result, 'ok');
});

test('YouTube でAIの申告をしない → 危ない', () => {
  const rep = RC.check(rules, { ...good, disclosures: { youtube_altered: false, credits_ai: true } });
  assert.equal(plat(rep, 'youtube').verdict, 'warn');
});

test('無料プラン → TuneCore Japan は危ない', () => {
  const rep = RC.check(rules, { ...good, ai: { ...good.ai, plan: 'free' } });
  assert.equal(item(rep, 'tunecore.rights').result, 'ng');
  assert.equal(plat(rep, 'tunecore_japan').verdict, 'warn');
});

test('未確認の決まりは「断られる」にしない', () => {
  const rep = RC.check(rules, good);
  const i = item(rep, 'distrokid.ai_policy');
  assert.equal(i.result, 'unverified');
  assert.equal(plat(rep, 'distrokid').verdict, 'ok');
  assert.equal(plat(rep, 'distrokid').counts.unverified, 1);
});

test('未入力は「目で確かめる」になり、ngにしない', () => {
  const rep = RC.check(rules, { title: 'Song', artist: 'MIRO' });
  assert.equal(item(rep, 'tunecore.art.spec').result, 'manual');
  assert.equal(item(rep, 'spotify.voice.impersonation').result, 'manual');
});

test('配信先をしぼれる・知らない配信先はエラー', () => {
  const rep = RC.check(rules, { ...good, platforms: ['spotify'] });
  assert.deepEqual(rep.platforms.map((p) => p.key), ['spotify']);
  assert.throws(() => RC.check(rules, { ...good, platforms: ['napster'] }));
});

test('すべての結果に出典と確かめた日が付く', () => {
  const rep = RC.check(rules, good);
  for (const p of rep.platforms) for (const i of p.items) {
    assert.match(i.source, /^https:\/\//);
    assert.match(i.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('rules.json の確かめ方はすべて本体にある', () => {
  for (const r of rules.rules) assert.ok(RC.CHECKS[r.check], r.check);
});

test('曲名の整え', () => {
  assert.equal(RC.tidyTitle('Ｓｏｎｇ　ft. Aki').value, 'Song (feat. Aki)');
  assert.equal(RC.tidyTitle('Song [Feat. Aki]').value, 'Song (feat. Aki)');
  assert.equal(RC.tidyTitle('Song (feat. Aki)').changes.length, 0);
  assert.equal(RC.tidyTitle('雨の街').value, '雨の街');
});

test('歌詞の整え: 行末の句点・カンマ・空行', () => {
  const r = RC.tidyLyrics('雨の街、\nI walk alone.\nWait...\n\n\n\nEnd  ');
  assert.equal(r.value, '雨の街\nI walk alone\nWait...\n\nEnd');
  const rep = RC.check(rules, { ...good, lyrics: r.value });
  assert.equal(item(rep, 'apple.lyrics.punct').result, 'ok');
});

test('ジャケットの目安', () => {
  const t = RC.tidy({ ...good, artwork: { width: 1000, height: 1000 } }, rules);
  assert.match(t.artwork.value, /3000×3000/);
  assert.equal(t.artwork.changes.length, 1);
});

test('制作記録に道具・版・プラン・自分の作業・結果・注意書き', () => {
  const rep = RC.check(rules, good);
  const txt = RC.productionRecord(good, rep, '2026-11-11');
  for (const w of ['Suno', 'v5', '有料', '作詞', 'Apple Music: 通る', '法律の助言ではない', '2026-11-11']) assert.ok(txt.includes(w), w);
});

test('本体は外と通信しない(fetch・XMLHttpRequest・保存を使わない)', () => {
  const src = readFileSync(new URL('../check.js', import.meta.url), 'utf8');
  for (const w of ['fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'WebSocket', 'localStorage']) assert.ok(!src.includes(w), w);
});

test('訳を横に並べた曲名・名前は Apple Music・Spotify で危ない', () => {
  const rep = RC.check(rules, { ...good, title: '雨の街 (Ame no Machi)' });
  assert.equal(item(rep, 'apple.meta.no_side_by_side').result, 'ng');
  assert.equal(plat(rep, 'apple_music').verdict, 'warn');
  assert.equal(item(RC.check(rules, { ...good, artist: '玉置浩二 (Koji Tamaki)' }), 'spotify.meta.no_side_by_side').result, 'ng');
  assert.equal(item(RC.check(rules, { ...good, title: '雨の街 / Rain City' }), 'apple.meta.no_side_by_side').result, 'ng');
  for (const t of ['雨の街', '雨の街 (feat. Aki)', 'Rain (Remix)', '雨の街 (Live)', 'Walking In The Rain'])
    assert.equal(item(RC.check(rules, { ...good, title: t }), 'apple.meta.no_side_by_side').result, 'ok', t);
});

test('Spotify は曲名の feat. を危ないとし、Apple Music は (feat. 名前) を認める', () => {
  const rep = RC.check(rules, { ...good, title: 'Song (feat. Aki)' });
  assert.equal(item(rep, 'spotify.title.no_feat').result, 'ng');
  assert.equal(item(rep, 'apple.title.feat').result, 'ok');
  assert.equal(item(RC.check(rules, { ...good, title: 'Left Turn' }), 'spotify.title.no_feat').result, 'ok');
  const t = RC.tidy({ title: 'Song ft. Aki' }, rules);
  assert.match(t.title.notes[0], /Spotify/);
  assert.equal(RC.tidy({ title: 'Song ft. Aki', platforms: ['apple_music'] }, rules).title.notes, undefined);
});

test('訳の横並びは末尾の feat.・(Live) があっても見つける(2026-11-11 の見逃しの修正)', () => {
  for (const t of ['雨の街 (Ame no Machi) feat. Rin', '雨の街 (Ame no Machi) (feat. Rin)', '雨の街 (Ame no Machi) (Live)', '雨の街 (Ame no Machi) [Radio Edit]'])
    assert.equal(item(RC.check(rules, { ...good, title: t }), 'apple.meta.no_side_by_side').result, 'ng', t);
  for (const t of ['雨の街 feat. Rin', '雨の街 (feat. Rin) (Live)', 'Rain City (Live) [Radio Edit]'])
    assert.equal(item(RC.check(rules, { ...good, title: t }), 'apple.meta.no_side_by_side').result, 'ok', t);
});

test('JASRAC は選んだときだけ確かめる(配信先の既定には入れない)', () => {
  const rep = RC.check(rules, good);
  assert.ok(!plat(rep, 'jasrac'));
});

test('JASRAC: 歌詞も曲もAIの自律生成 → 管理されない(断られる)', () => {
  const rep = RC.check(rules, { ...good, platforms: ['jasrac'], authorship: { lyrics: 'ai', music: 'ai' } });
  assert.equal(item(rep, 'jasrac.ai.autonomous').result, 'ng');
  assert.equal(plat(rep, 'jasrac').verdict, 'block');
});

test('JASRAC: 詞は人・曲はAI → 作品届に「作曲:AI 自律生成」・管理率は公式の表どおり', () => {
  const rep = RC.check(rules, { ...good, platforms: ['jasrac'], authorship: { lyrics: 'human', music: 'ai' } });
  const i = item(rep, 'jasrac.ai.partial');
  assert.equal(i.result, 'ng');
  assert.ok(i.detail.includes('作曲:AI 自律生成'));
  assert.ok(i.detail.includes('曲だけ使用0%') && i.detail.includes('詞曲50%') && i.detail.includes('詞だけ使用100%'));
  assert.equal(plat(rep, 'jasrac').verdict, 'ok');
});

test('JASRAC: AIを使い自分がしたことが未記入 → 保証の備えが無い(危ない)', () => {
  const rep = RC.check(rules, { ...good, human_work: [], platforms: ['jasrac'], authorship: { lyrics: 'human', music: 'human' } });
  assert.equal(item(rep, 'jasrac.ai.guarantee').result, 'ng');
  assert.equal(plat(rep, 'jasrac').verdict, 'warn');
});

test('JASRAC: 未回答なら目で確かめる', () => {
  const rep = RC.check(rules, { ...good, platforms: ['jasrac'] });
  assert.equal(item(rep, 'jasrac.ai.autonomous').result, 'manual');
});

test('制作記録に作詞・作曲の担当が入る', () => {
  const txt = RC.productionRecord({ ...good, authorship: { lyrics: 'human', music: 'ai' } }, null, '2026-11-11');
  assert.ok(txt.includes('作詞: 人') && txt.includes('作曲: AI 自律生成'));
});
