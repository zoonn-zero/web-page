(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'zoonn.focus.archive.v1';
  const VERSION = 1;
  const RULE = '1.0';
  const DURATION = 270000;
  const GAMES = {
    memory: { name: '灯窗记忆', caption: '记住亮起的窗，找回它们的顺序。', category: '空间记忆', icon: 'windows', color: 'sage' },
    search: { name: '星光寻踪', caption: '在纷繁的图形里，找到那颗星。', category: '视觉注意', icon: 'spark', color: 'peach' },
    signal: { name: '信号守望', caption: '该出手时轻点，该等待时停一停。', category: '反应与抑制', icon: 'signal', color: 'lilac' }
  };
  const SKINS = [
    { id: 'sage', name: '窗边鼠尾草', rarity: 'starter', color: '#547466' },
    { id: 'sea', name: '海盐来信', rarity: 'common', color: '#476f83' },
    { id: 'clay', name: '陶土午后', rarity: 'common', color: '#9e5c43' },
    { id: 'olive', name: '橄榄小径', rarity: 'common', color: '#657342' },
    { id: 'rose', name: '玫瑰书签', rarity: 'common', color: '#95566b' },
    { id: 'indigo', name: '蓝调时刻', rarity: 'rare', color: '#51558c' },
    { id: 'amber', name: '琥珀黄昏', rarity: 'rare', color: '#8b661f' },
    { id: 'aurora', name: '极光来客', rarity: 'special', color: '#366b70' }
  ];
  const id = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const dayKey = value => { const d = new Date(value === undefined ? Date.now() : value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fresh = () => ({ version: VERSION, id: id(), revision: 0, createdAt: new Date().toISOString(), sessions: [], rewards: [], owned: { sage: 1 }, equipped: 'sage' });
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (v, max = 1e10) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const text = (v, n = 100) => typeof v === 'string' && v.length > 0 && v.length <= n;
  function validate(doc) {
    if (!doc || doc.version !== VERSION || !text(doc.id) || !validDate(doc.createdAt) || !Number.isInteger(doc.revision) || doc.revision < 0) throw new Error('存档格式或版本不受支持，原记录没有改变。');
    if (!Array.isArray(doc.sessions) || doc.sessions.length > 10000 || !Array.isArray(doc.rewards) || doc.rewards.length > 10000) throw new Error('存档记录结构无效。');
    const ids = new Set();
    for (const s of doc.sessions) {
      if (!s || !text(s.id) || ids.has(s.id) || !Object.hasOwn(GAMES, s.game) || s.rule !== RULE || !validDate(s.startedAt) || !['running', 'completed', 'interrupted'].includes(s.status) || !finite(s.activeMs, 86400000) || !finite(s.elapsedMs, 31536000000) || !Array.isArray(s.trials) || s.trials.length > 3000 || typeof s.eligible !== 'boolean') throw new Error('训练记录无效，无法恢复。');
      if (s.endedAt !== null && !validDate(s.endedAt)) throw new Error('结束日期无效。');
      ids.add(s.id);
      for (const t of s.trials) {
        if (!t || !Number.isInteger(t.level) || t.level < 1 || t.level > 8 || typeof t.valid !== 'boolean' || typeof t.correct !== 'boolean' || !['mouse', 'touch', 'keyboard', 'mixed'].includes(t.input) || !['small', 'large'].includes(t.screen) || !text(t.condition, 160) || !finite(t.rt, 120000) || !finite(t.errors, 10000) || typeof t.responded !== 'boolean' || typeof t.noGo !== 'boolean') throw new Error('题目记录无效，无法恢复。');
      }
      if (s.status === 'completed' && (!s.endedAt || s.activeMs < DURATION)) throw new Error('完整回合的时长不一致。');
      if (s.eligible && (s.status !== 'completed' || !participated(s))) throw new Error('回合奖励资格无效。');
    }
    if (!doc.owned || typeof doc.owned !== 'object' || Array.isArray(doc.owned) || !SKINS.some(s => s.id === doc.equipped) || !(doc.owned[doc.equipped] > 0)) throw new Error('收藏记录无效。');
    for (const [key, value] of Object.entries(doc.owned)) if (!SKINS.some(s => s.id === key) || !Number.isInteger(value) || value < 1 || value > 100000) throw new Error('收藏数量无效。');
    const days = new Set();
    for (const r of doc.rewards) {
      if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) || days.has(r.day) || !SKINS.some(s => s.id === r.skin && s.rarity !== 'starter') || !validDate(r.at)) throw new Error('奖励记录无效。');
      days.add(r.day);
    }
    return doc;
  }
  function participated(s) {
    const v = s.trials.filter(t => t.valid);
    return v.length >= (s.game === 'signal' ? 20 : 5) && v.filter(t => t.responded).length >= (s.game === 'signal' ? 5 : 3);
  }
  function isComplete(s) { return s.status === 'completed' && s.activeMs >= DURATION && participated(s); }
  function median(values) { if (!values.length) return null; const a = values.slice().sort((a, b) => a - b); const i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; }
  function metrics(trials) {
    const v = trials.filter(t => t.valid), correct = v.filter(t => t.correct), ng = v.filter(t => t.noGo), go = v.filter(t => !t.noGo);
    return { count: v.length, correct: correct.length, accuracy: v.length ? correct.length / v.length : null, rt: median(correct.filter(t => t.responded).map(t => t.rt)), errors: v.reduce((n, t) => n + t.errors, 0), falseAlarm: ng.length ? ng.filter(t => !t.correct).length / ng.length : null, miss: go.length ? go.filter(t => !t.responded).length / go.length : null };
  }
  function groups(sessions, game) {
    const map = new Map();
    for (const s of sessions.filter(s => s.game === game && isComplete(s)).sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      const grouped = new Map();
      for (const t of s.trials.filter(t => t.valid)) {
        const key = [s.rule, t.condition, t.input, t.screen].join('|');
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(t);
      }
      for (const [key, trials] of grouped) {
        if (!map.has(key)) map.set(key, { key, level: trials[0].level, input: trials[0].input, screen: trials[0].screen, condition: trials[0].condition, rounds: [] });
        map.get(key).rounds.push({ id: s.id, date: s.startedAt, trials, metrics: metrics(trials) });
      }
    }
    return [...map.values()].sort((a, b) => b.rounds.length - a.rounds.length || a.level - b.level);
  }
  function comparison(group) {
    if (!group || group.rounds.length < 10) return null;
    const first = group.rounds.slice(0, 5), recent = group.rounds.slice(-5);
    return { first: metrics(first.flatMap(r => r.trials)), recent: metrics(recent.flatMap(r => r.trials)), days: new Set([...first, ...recent].map(r => dayKey(r.date))).size };
  }
  function achievements(doc) {
    const completed = doc.sessions.filter(isComplete), days = new Set(completed.map(s => dayKey(s.startedAt)));
    return [
      { id: 'first', title: '开窗的人', caption: '完成第一轮有效训练', count: completed.length, goal: 1 },
      { id: 'days', title: '找到节奏奖', caption: '在 5 个不同日子完成训练', count: days.size, goal: 5 },
      { id: 'ten', title: '收获满满奖', caption: '累计完成 10 轮有效训练', count: completed.length, goal: 10 }
    ];
  }
  function draw(random = Math.random) {
    const value = random();
    const rarity = value < 0.90 ? 'common' : value < 0.99 ? 'rare' : 'special';
    const pool = SKINS.filter(s => s.rarity === rarity);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }
  function claim(doc, today, random, now = new Date().toISOString()) {
    if (doc.rewards.some(r => r.day === today)) throw new Error('今天的小礼物已经领取了，明天再来。');
    if (!doc.sessions.some(s => isComplete(s) && dayKey(s.endedAt) === today)) throw new Error('先完成今天的一轮有效训练，再来领取。');
    const skin = draw(random);
    doc.owned[skin.id] = (doc.owned[skin.id] || 0) + 1;
    doc.rewards.push({ day: today, skin: skin.id, at: now });
    return skin;
  }
  class Store {
    constructor(storage, locks) { this.storage = storage; this.locks = locks; this.queue = Promise.resolve(); }
    load() { const raw = this.storage.getItem(KEY); return raw ? validate(JSON.parse(raw)) : fresh(); }
    update(mutator) {
      const action = () => {
        const doc = this.load();
        const result = mutator(doc);
        doc.revision++;
        validate(doc);
        this.storage.setItem(KEY, JSON.stringify(doc));
        return { doc, result };
      };
      const call = () => this.locks ? this.locks.request(KEY, action) : action();
      const pending = this.queue.then(call);
      this.queue = pending.catch(() => {});
      return pending;
    }
    saveSession(session) {
      const snapshot = clone(session);
      return this.update(doc => { const i = doc.sessions.findIndex(s => s.id === snapshot.id); if (i < 0) doc.sessions.push(snapshot); else doc.sessions[i] = snapshot; });
    }
    restore(value) { const checked = clone(validate(value)); return this.update(doc => { Object.assign(doc, checked); }); }
  }
  return { KEY, VERSION, RULE, DURATION, GAMES, SKINS, id, dayKey, fresh, clone, validate, participated, isComplete, median, metrics, groups, comparison, achievements, draw, claim, Store };
});
