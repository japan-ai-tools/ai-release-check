/*
 * AIリリースチェック — チェックの本体
 * ブラウザでも node でも動く。外に何も送らない(通信なし・保存なし)。
 * 決まりは rules.json(出典・節・確かめた日つき)。法律の助言ではない。最終判断は各配信先の案内で。
 *
 * 使い方:
 *   const RC = require('./check.js');            // node
 *   const report = RC.check(rules, song);        // 配信先ごとの 通る/危ない/断られる
 *   const meta = RC.tidy(song);                  // 登録情報の整え(曲名・歌詞・ジャケット)
 *   const text = RC.productionRecord(song, report, '2026-11-11'); // 制作記録
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIReleaseCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERDICT = { ok: '通る', warn: '危ない', block: '断られる' };
  var KIND_JA = {
    url: 'Webアドレス', logo: 'ロゴ', qr: 'QRコード', release_date: '発売日',
    price: '価格', social_handle: 'SNSのアカウント名', other: '曲名・アーティスト名以外の文字'
  };

  function s(v) { return (v === undefined || v === null) ? '' : String(v); }
  function low(v) { return s(v).toLowerCase().trim(); }
  function has(v) { return v !== undefined && v !== null && s(v).trim() !== ''; }
  function names(song) {
    var out = [];
    if (has(song.artist)) out.push(s(song.artist));
    (song.featuring || []).forEach(function (f) { if (has(f)) out.push(s(f)); });
    return out;
  }
  // 英数字の単語の境目で探す(studio の中の udio などを拾わない)
  function wordIn(text, word) {
    var esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s_-]*');
    return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])', 'i').test(text);
  }
  function isLatinTitle(t) {
    var letters = t.replace(/[^A-Za-z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g, '');
    if (!letters) return false;
    return /^[A-Za-z]+$/.test(letters);
  }

  var CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff66-\uff9f]/;
  // 「元の言葉 (英字)」「英字 (元の言葉)」「元の言葉 / 英字」の形。feat. や Remix などのかっこは除く
  function sideBySide(v) {
    var KEEP = /^(feat\.|with |prod\.|remix|live|acoustic|instrumental|radio edit|extended|version|ver\.|demo|cover|karaoke)/i;
    // 末尾の参加者(feat. 名前)・版の印((Live) など)を外してから見る(2026-11-11: 「雨の街 (Ame no Machi) feat. Rin」を見逃していた)
    var prev;
    do {
      prev = v;
      v = v.replace(/\s+(feat\.|ft\.|featuring)\s.+$/i, '').trim();
      var tail = v.match(/^(.+?)\s*[\(\[\uff08]([^\)\]\uff09]+)[\)\]\uff09]\s*$/);
      if (tail && (KEEP.test(tail[2].trim()) || /^ft\./i.test(tail[2].trim()) || /(remix|version|mix|edit|live)$/i.test(tail[2].trim()))) v = tail[1].trim();
    } while (v !== prev);
    var m = v.match(/^(.+?)\s*[\(\[\uff08]([^\)\]\uff09]+)[\)\]\uff09]\s*$/);
    if (m) {
      var a = m[1], b = m[2].trim();
      if (KEEP.test(b) || /(remix|version|mix|edit|live)$/i.test(b)) return false;
      if (CJK.test(a) && !CJK.test(b) && /[A-Za-z\u00c0-\u024f]{2}/.test(b)) return true;
      if (!CJK.test(a) && /[A-Za-z]{2}/.test(a) && CJK.test(b)) return true;
      return false;
    }
    var parts = v.split(/\s+[\/|]\s+/);
    if (parts.length === 2) {
      var x = CJK.test(parts[0]), y = CJK.test(parts[1]);
      return x !== y && /[A-Za-z]{2}/.test(x ? parts[1] : parts[0]);
    }
    return false;
  }

  // ---- 1つずつの確かめ。戻り値: {result:'ok'|'ng'|'manual', detail} ----
  var CHECKS = {
    manual: function () { return { result: 'manual', detail: '自動では確かめられない。下の決まりを目で確かめる' }; },

    artwork_has_text: function (song, p) {
      var art = song.artwork || {};
      if (!Array.isArray(art.text_kinds)) return { result: 'manual', detail: 'ジャケットに入れた文字の種類が未入力' };
      var hit = art.text_kinds.filter(function (k) { return p.kinds.indexOf(k) >= 0; });
      if (!hit.length) return { result: 'ok', detail: '入れてはいけない文字は無い' };
      return { result: 'ng', detail: 'ジャケットに ' + hit.map(function (k) { return KIND_JA[k] || k; }).join('・') + ' がある' };
    },

    artwork_size: function (song, p) {
      var art = song.artwork || {};
      if (!art.width || !art.height) return { result: 'manual', detail: 'ジャケットの縦横の大きさが未入力' };
      var bad = [];
      if (art.width < p.min_px || art.height < p.min_px) bad.push(art.width + '×' + art.height + 'px(' + p.min_px + 'px 未満)');
      if (p.square && art.width !== art.height) bad.push('正方形ではない');
      if (has(art.format) && p.formats.indexOf(low(art.format)) < 0) bad.push(s(art.format) + ' 形式');
      if (!has(art.format)) return bad.length ? { result: 'ng', detail: bad.join('・') } : { result: 'manual', detail: '大きさは合っている。ファイル形式が未入力' };
      return bad.length ? { result: 'ng', detail: bad.join('・') } : { result: 'ok', detail: art.width + '×' + art.height + 'px・' + s(art.format) };
    },

    artist_generic: function (song, p) {
      if (!has(song.artist)) return { result: 'manual', detail: 'アーティスト名が未入力' };
      var a = low(song.artist).replace(/\s+/g, ' ');
      return p.words.indexOf(a) >= 0
        ? { result: 'ng', detail: '「' + s(song.artist) + '」は一般的な言葉' }
        : { result: 'ok', detail: '固有の名前' };
    },

    artist_compound: function (song, p) {
      if (!has(song.artist)) return { result: 'manual', detail: 'アーティスト名が未入力' };
      var a = s(song.artist);
      var hit = p.separators.filter(function (sep) { return a.indexOf(sep) >= 0; });
      return hit.length
        ? { result: 'ng', detail: 'アーティスト欄に区切り「' + hit.join('」「').trim() + '」がある(複数の名前の疑い)' }
        : { result: 'ok', detail: '名前は1つ' };
    },

    artist_is_tool: function (song, p) {
      var list = names(song);
      if (!list.length) return { result: 'manual', detail: 'アーティスト名が未入力' };
      var hits = [];
      list.forEach(function (n) {
        p.tools.forEach(function (t) { if (wordIn(n, t) && hits.indexOf(t) < 0) hits.push(t); });
      });
      return hits.length
        ? { result: 'ng', detail: 'アーティスト欄・参加者欄に道具の名前(' + hits.join('・') + ')がある' }
        : { result: 'ok', detail: '道具の名前は無い' };
    },

    title_feat_format: function (song) {
      var t = s(song.title);
      if (!t) return { result: 'manual', detail: '曲名が未入力' };
      var re = /(featuring|feat\.?|ft\.?|w\/)(?=\s|$)/ig, m, bad = [];
      while ((m = re.exec(t)) !== null) {
        var before = t.slice(Math.max(0, m.index - 1), m.index);
        var ok = m[0] === 'feat.' && before === '(';
        if (!ok) bad.push(m[0]);
      }
      return bad.length
        ? { result: 'ng', detail: '「' + bad.join('」「') + '」の書き方。正しくは「(feat. 名前)」' }
        : { result: 'ok', detail: '参加者の書き方に問題なし' };
    },

    // Spotify: 参加者は曲名に書かない
    title_has_feat: function (song) {
      var t = s(song.title);
      if (!t) return { result: 'manual', detail: '曲名が未入力' };
      var m = t.match(/(^|[\s\(\[])(featuring|feat\.?|ft\.?|w\/)(?=\s|$)/i);
      return m
        ? { result: 'ng', detail: '曲名に「' + m[2] + '」で参加者を書いている' }
        : { result: 'ok', detail: '曲名に参加者は無い' };
    },

    // 日本語(かな・漢字・ハングル)と英字の訳を同じ欄に並べていないか(例: 雨の街 (Ame no Machi))
    side_by_side_translation: function (song, p, rule) {
      var fields = [['曲名', song.title], ['アーティスト名', song.artist]];
      var checked = 0, hits = [];
      fields.forEach(function (f) {
        var v = s(f[1]).trim();
        if (!v) return;
        checked++;
        if (sideBySide(v)) hits.push(f[0] + '「' + v + '」');
      });
      if (!checked) return { result: 'manual', detail: '曲名・アーティスト名が未入力' };
      return hits.length
        ? { result: 'ng', detail: hits.join('・') + ' に訳・読みを並べている疑い' }
        : { result: 'ok', detail: '訳を並べた書き方は無い' };
    },

    title_extra_words: function (song, p) {
      var t = low(song.title);
      if (!t) return { result: 'manual', detail: '曲名が未入力' };
      var hit = p.words.filter(function (w) { return t.indexOf(w) >= 0; });
      return hit.length
        ? { result: 'ng', detail: '曲名に「' + hit.join('」「') + '」がある' }
        : { result: 'ok', detail: '余計な言葉は無い' };
    },

    title_case_en: function (song) {
      var t = s(song.title).trim();
      if (!t) return { result: 'manual', detail: '曲名が未入力' };
      if (!isLatinTitle(t)) return { result: 'ok', detail: '英語の曲名ではない(対象外)' };
      var letters = t.replace(/[^A-Za-z]/g, '');
      if (letters.length >= 4 && letters === letters.toUpperCase()) return { result: 'ng', detail: '全部大文字' };
      if (letters.length >= 4 && letters === letters.toLowerCase()) return { result: 'ng', detail: '全部小文字' };
      return { result: 'ok', detail: '大文字・小文字に問題なし' };
    },

    lyrics_line_end_punct: function (song) {
      if (!has(song.lyrics)) return { result: 'manual', detail: '歌詞が未入力(歌詞を出さないなら対象外)' };
      var lines = s(song.lyrics).replace(/\r\n?/g, '\n').split('\n');
      var bad = [];
      lines.forEach(function (ln, i) {
        var x = ln.replace(/\s+$/, '');
        if (/[.,。、]$/.test(x) && !/(\.\.\.|…)$/.test(x)) bad.push(i + 1);
      });
      return bad.length
        ? { result: 'ng', detail: bad.length + '行の終わりに句点・カンマ(' + bad.slice(0, 5).join('・') + '行目' + (bad.length > 5 ? ' ほか' : '') + ')' }
        : { result: 'ok', detail: '行の終わりに句点・カンマは無い' };
    },

    voice_impersonation: function (song) {
      var v = song.vocals || {};
      if (v.sounds_like === undefined) return { result: 'manual', detail: '実在の歌手に似せたかが未回答' };
      if (!has(v.sounds_like)) return { result: 'ok', detail: '実在の歌手に似せていない' };
      if (v.permission === true) return { result: 'ok', detail: '似せた歌手の許可あり(' + s(v.sounds_like) + ')。許可の記録を残す' };
      return { result: 'ng', detail: '実在の歌手(' + s(v.sounds_like) + ')に似せていて、許可が無い' };
    },

    spam_pattern: function (song) {
      var r = song.release || {};
      if (r.duplicate === true) return { result: 'ng', detail: '同じ曲(または少しだけ変えた曲)をすでに出している' };
      if (r.duplicate === false) return { result: 'ok', detail: '出し直しではない(量・長さのしきい値は公式に書かれていない)' };
      return { result: 'manual', detail: '同じ曲の出し直しかが未回答' };
    },

    ai_disclosure: function (song, p, rule) {
      var ai = song.ai || {};
      if (!has(ai.tool)) return { result: 'ok', detail: 'AIの道具を使っていない(入力なし)' };
      var d = song.disclosures || {};
      var key = rule.platform === 'youtube' ? 'youtube_altered' : 'credits_ai';
      if (d[key] === true) return { result: 'ok', detail: 'AIを使ったことを示す予定' };
      return { result: 'ng', detail: s(ai.tool) + ' を使っているが、示す予定になっていない' };
    },

    rights_plan: function (song) {
      var ai = song.ai || {};
      if (!has(ai.tool)) return { result: 'manual', detail: '使った道具が未入力。素材の権利を自分で確かめる' };
      var plan = low(ai.plan);
      if (plan === 'paid') return { result: 'ok', detail: s(ai.tool) + ' の有料プランで作った(商用利用の条件はその道具の規約で確かめる)' };
      if (plan === 'free') return { result: 'ng', detail: s(ai.tool) + ' の無料プランで作った。道具によっては無料プランの曲の商用利用を認めていない' };
      return { result: 'manual', detail: s(ai.tool) + ' のプランが未入力' };
    }
  };

  function checkOne(rule, song) {
    var fn = CHECKS[rule.check];
    if (!fn) throw new Error('知らない確かめ方: ' + rule.check + '(' + rule.id + ')');
    if (rule.status === 'unverified') {
      return { result: 'unverified', detail: '公式の案内で確かめられていない決まり' };
    }
    return fn(song, rule.params || {}, rule);
  }

  function check(rules, song) {
    if (!rules || !rules.rules) throw new Error('rules.json の形ではない');
    song = song || {};
    var chosen = Array.isArray(song.platforms) && song.platforms.length ? song.platforms : Object.keys(rules.platforms);
    var unknown = chosen.filter(function (k) { return !rules.platforms[k]; });
    if (unknown.length) throw new Error('知らない配信先: ' + unknown.join(', '));
    var out = { version: rules.version, rules_updated: rules.updated, note: rules.note, platforms: [] };
    chosen.forEach(function (pk) {
      var items = [];
      rules.rules.filter(function (r) { return r.platform === pk; }).forEach(function (r) {
        var res = checkOne(r, song);
        items.push({
          id: r.id, field: r.field, level: r.level, result: res.result, detail: res.detail,
          rule: r.rule, fix: res.result === 'ng' ? r.fix : '', source: r.source,
          section: r.section || '', checked: r.checked, basis: r.basis || ''
        });
      });
      var ng = items.filter(function (i) { return i.result === 'ng'; });
      var verdict = ng.some(function (i) { return i.level === 'block'; }) ? 'block'
        : ng.some(function (i) { return i.level === 'warn'; }) ? 'warn' : 'ok';
      out.platforms.push({
        key: pk, name: rules.platforms[pk].name, verdict: verdict, verdict_ja: VERDICT[verdict],
        counts: {
          block: ng.filter(function (i) { return i.level === 'block'; }).length,
          warn: ng.filter(function (i) { return i.level === 'warn'; }).length,
          info: ng.filter(function (i) { return i.level === 'info'; }).length,
          manual: items.filter(function (i) { return i.result === 'manual'; }).length,
          unverified: items.filter(function (i) { return i.result === 'unverified'; }).length
        },
        items: items
      });
    });
    return out;
  }

  // ---- 登録情報の整え ----
  function toHalfAscii(t) {
    return t.replace(/[\uff01-\uff5e]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
  }

  function tidyTitle(title) {
    var t = s(title), changes = [];
    var t2 = toHalfAscii(t);
    if (t2 !== t) changes.push('全角の英数字・記号を半角にした');
    t = t2;
    t2 = t.replace(/\u3000/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (t2 !== t) changes.push('余分な空白を消した');
    t = t2;
    // [feat. X] / (Feat. X) / feat X / ft. X / featuring X / w/ X → (feat. X)
    var re = /\s*[\(\[]?\s*(?:featuring|feat\.?|ft\.?|w\/)\s+([^\)\]]+?)\s*[\)\]]?\s*$/i;
    var m = t.match(re);
    if (m) {
      t2 = t.slice(0, m.index).trim() + ' (feat. ' + m[1].trim() + ')';
      if (t2 !== t) changes.push('参加者の表記を「(feat. 名前)」にした');
      t = t2;
    }
    return { value: t, changes: changes };
  }

  function tidyLyrics(lyrics) {
    var changes = [];
    var lines = s(lyrics).replace(/\r\n?/g, '\n').split('\n');
    var punct = 0, trail = 0;
    lines = lines.map(function (ln) {
      var x = ln.replace(/[ \t\u3000]+$/, '');
      if (x !== ln) trail++;
      if (/[.,。、]$/.test(x) && !/(\.\.\.|…)$/.test(x)) { x = x.slice(0, -1); punct++; }
      return x;
    });
    var text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    if (punct) changes.push(punct + '行の終わりの句点・カンマを消した');
    if (trail) changes.push(trail + '行の終わりの空白を消した');
    if (text !== lines.join('\n')) changes.push('続いた空行を1つにまとめた');
    return { value: text, changes: changes };
  }

  function artworkAdvice(rules, song) {
    var art = song.artwork || {}, need = 0, formats = null;
    rules.rules.forEach(function (r) {
      if (r.check === 'artwork_size' && (!song.platforms || !song.platforms.length || song.platforms.indexOf(r.platform) >= 0)) {
        need = Math.max(need, r.params.min_px);
        formats = r.params.formats;
      }
    });
    if (!need) return { value: '', changes: [] };
    var ok = art.width >= need && art.height >= need && art.width === art.height;
    return {
      value: need + '×' + need + 'px の正方形' + (formats ? '(' + formats.join('/').toUpperCase() + ')' : ''),
      changes: ok ? [] : ['ジャケットを ' + need + '×' + need + 'px の正方形で書き出し直す']
    };
  }

  function tidy(song, rules) {
    song = song || {};
    var out = { title: tidyTitle(song.title), lyrics: tidyLyrics(song.lyrics) };
    var plats = Array.isArray(song.platforms) && song.platforms.length ? song.platforms : null;
    if (/\(feat\. /.test(out.title.value) && (!plats || plats.indexOf('spotify') >= 0)) {
      out.title.notes = ['Spotify では曲名に参加者を書かず、配信会社の参加者の欄に入れる(Apple Music は「(feat. 名前)」)'];
    }
    if (rules) out.artwork = artworkAdvice(rules, song);
    return out;
  }

  // ---- 制作記録(指摘されたときにそのまま出せる1枚) ----
  function productionRecord(song, report, today) {
    song = song || {};
    var ai = song.ai || {};
    var L = [];
    L.push('制作記録 / Production record');
    L.push('作成日: ' + s(today));
    L.push('');
    L.push('曲名: ' + s(song.title));
    L.push('アーティスト名: ' + s(song.artist));
    if ((song.featuring || []).length) L.push('参加: ' + song.featuring.join(', '));
    L.push('');
    L.push('[使ったAI]');
    L.push('道具: ' + (s(ai.tool) || '(なし)'));
    L.push('版: ' + (s(ai.version) || '(未記入)'));
    L.push('プラン: ' + ({ paid: '有料', free: '無料' }[low(ai.plan)] || '(未記入)'));
    L.push('作った日: ' + (s(ai.created) || '(未記入)'));
    L.push('');
    L.push('[自分がしたこと]');
    var hw = song.human_work || [];
    if (hw.length) hw.forEach(function (w) { L.push('- ' + w); }); else L.push('- (未記入)');
    if (has(song.prompt)) { L.push(''); L.push('[AIへの指示(プロンプト)]'); L.push(s(song.prompt)); }
    if (has(song.lyrics)) { L.push(''); L.push('[歌詞]'); L.push(s(song.lyrics)); }
    if (report) {
      L.push('');
      L.push('[配信前のチェック(決まりの表 ' + s(report.version) + '・' + s(report.rules_updated) + ' 更新)]');
      report.platforms.forEach(function (p) { L.push('- ' + p.name + ': ' + p.verdict_ja); });
    }
    L.push('');
    L.push('この記録は本人の申告をまとめたもの。チェックは確認の手助けで、法律の助言ではない。最終判断は各配信先の案内で。');
    return L.join('\n');
  }

  return { check: check, tidy: tidy, tidyTitle: tidyTitle, tidyLyrics: tidyLyrics, productionRecord: productionRecord, CHECKS: CHECKS, VERDICT: VERDICT };
});
