/*
 * AIリリースチェック — SNS の投稿文の型(日本語・英語)。
 * AIの利用料はかからない(決まった型に差し込むだけ)。外に何も送らない。
 * AIを使ったことは隠さずに書く(YouTube の申告・各配信先の案内に合わせる)。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIReleaseSNS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function s(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
  var WORK_EN = { '作詞': 'lyrics', '作曲': 'composition', '編曲': 'arrangement', '編曲の手直し': 'arrangement edits',
    '歌': 'vocals', '演奏': 'performance', 'ミックス': 'mixing', 'マスタリング': 'mastering', 'ジャケット': 'artwork' };

  function tag(t) { return '#' + s(t).replace(/[\s#.\-]+/g, ''); }
  function uniq(a) { var o = []; a.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

  function aiLine(song, lang) {
    var ai = song.ai || {}, tool = s(ai.tool);
    var work = (song.human_work || []).map(s).filter(Boolean);
    if (!tool) return '';
    var ver = s(ai.version);
    if (lang === 'en') {
      var w = work.map(function (x) { return WORK_EN[x] || x; });
      return 'Made with AI (' + tool + (ver ? ' ' + ver : '') + ')' + (w.length ? '. My part: ' + w.join(', ') : '') + '.';
    }
    return 'この曲はAI(' + tool + (ver ? ' ' + ver : '') + ')を使って作りました' + (work.length ? '。自分の担当: ' + work.join('・') : '') + '。';
  }

  function posts(song, lang, opts) {
    song = song || {}; opts = opts || {};
    lang = lang === 'en' ? 'en' : 'ja';
    var title = s(song.title), artist = s(song.artist), link = s(opts.link);
    var feat = (song.featuring || []).map(s).filter(Boolean);
    var genre = s(opts.genre);
    var full = title + (feat.length ? ' (feat. ' + feat.join(', ') + ')' : '');
    var ai = aiLine(song, lang);
    var tags = uniq([artist && tag(artist), genre && tag(genre),
      lang === 'en' ? '#NewMusic' : '#新曲', lang === 'en' ? '#AIMusic' : '#AI音楽',
      s((song.ai || {}).tool) && tag(s(song.ai.tool))]);
    var L = lang === 'en'
      ? { out: 'Out now', listen: 'Listen', yt: artist + ' - ' + full, lyr: 'Lyrics' }
      : { out: '配信開始', listen: '聴く', yt: artist + '「' + full + '」', lyr: '歌詞' };

    var desc = [];
    desc.push(lang === 'en' ? artist + ' - ' + full : artist + '「' + full + '」');
    if (link) desc.push(L.listen + ': ' + link);
    if (ai) { desc.push(''); desc.push(ai); }
    if (s(opts.lyrics_in_description) && s(song.lyrics)) { desc.push(''); desc.push('[' + L.lyr + ']'); desc.push(s(song.lyrics)); }
    desc.push(''); desc.push(tags.join(' '));

    var x = [L.out + (lang === 'en' ? ': ' : '') + (lang === 'en' ? full : '「' + full + '」') + (lang === 'en' ? ' by ' + artist : ' / ' + artist)];
    if (ai) x.push(ai);
    if (link) x.push(link);
    x.push(tags.slice(0, 4).join(' '));

    var tiktok = [(lang === 'en' ? full + ' / ' + artist : '「' + full + '」' + artist), ai, tags.join(' ')].filter(Boolean);

    return {
      lang: lang,
      youtube_title: L.yt,
      youtube_description: desc.join('\n'),
      youtube_tags: tags.map(function (t) { return t.slice(1); }),
      x: x.join('\n'),
      tiktok: tiktok.join('\n')
    };
  }
  return { posts: posts, aiLine: aiLine };
});
