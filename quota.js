/*
 * AIリリースチェック — 無料の回数(1か月3曲まで)。数えるのはこの端末の中だけ(外に送らない)。
 * 同じ曲(曲名+アーティスト名)を何度確かめても1曲と数える。
 * 端末の保存が使えない(プライベートモードなど)ときは数えずに使える。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIReleaseQuota = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LIMIT = 3;
  var KEY = 'ai-release-check.quota.v1';

  function month(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function songKey(song) {
    var t = String((song && song.title) || '').trim().toLowerCase().replace(/\s+/g, ' ');
    var a = String((song && song.artist) || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return t + '\u0000' + a;
  }
  function fresh(state, m) {
    if (!state || state.month !== m || !Array.isArray(state.songs)) return { month: m, songs: [] };
    return { month: m, songs: state.songs.slice() };
  }
  // 純粋な判定: { allowed, used, left, state(新しい) }
  function use(state, song, m, limit) {
    limit = limit || LIMIT;
    var st = fresh(state, m), k = songKey(song);
    if (st.songs.indexOf(k) >= 0) return { allowed: true, used: st.songs.length, left: limit - st.songs.length, state: st, counted: false };
    if (st.songs.length >= limit) return { allowed: false, used: st.songs.length, left: 0, state: st, counted: false };
    st.songs.push(k);
    return { allowed: true, used: st.songs.length, left: limit - st.songs.length, state: st, counted: true };
  }
  function peek(state, m, limit) {
    limit = limit || LIMIT;
    var st = fresh(state, m);
    return { used: st.songs.length, left: Math.max(0, limit - st.songs.length) };
  }
  // ブラウザの保存(使えなければ null)
  function load(storage) {
    try { var v = storage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  return { LIMIT: LIMIT, KEY: KEY, month: month, songKey: songKey, use: use, peek: peek, load: load, save: save };
});
