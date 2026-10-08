(() => {
  'use strict';
  const C = window.FocusCore;
  const $ = selector => document.querySelector(selector);
  const view = $('#view'), phone = $('#phone'), dialog = $('#dialog');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = n => n === null ? '—' : Math.round(n * 100) + '%';
  const time = ms => `${Math.floor(Math.max(ms, 0) / 60000)}:${String(Math.floor(Math.max(ms, 0) / 1000) % 60).padStart(2, '0')}`;
  const date = s => new Date(s).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  const inputNames = { mouse: '鼠标', touch: '触控', keyboard: '键盘', mixed: '混合输入' };
  const rarityNames = { starter: '初始款', common: '普通', rare: '稀有', special: '特别' };
  let archive = C.fresh(), store, blocked = false, page = 'home', selectedGame = 'memory';
  let reportGame = 'memory', reportGroup = '', reportRange = 'all', run = null, lastResult = null, pendingImport = null;
  let toastTimer, timerId, pending = [], epoch = 0, lastPointer = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  try { store = new C.Store(window.localStorage, navigator.locks); archive = store.load(); }
  catch (e) { blocked = true; banner('当前存档无法读取。请先导出原始记录或恢复有效备份；不会覆盖原数据。'); }

  function icon(game) {
    if (game === 'memory') return '<span class="mini-windows" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
    if (game === 'search') return '<span class="spark-icon" aria-hidden="true">✦</span>';
    return '<span class="signal-icon" aria-hidden="true"><i></i><i></i></span>';
  }
  function applySkin() { const s = C.SKINS.find(s => s.id === archive.equipped) || C.SKINS[0]; document.documentElement.style.setProperty('--accent', s.color); }
  function banner(message) { const el = $('#storageBanner'); el.textContent = message; el.hidden = !message; }
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
  function modal(html) { $('#dialogBody').innerHTML = html; if (!dialog.open) dialog.showModal(); }
  function closeModal() { if (dialog.open) dialog.close(); }
  function setPage(next) {
    page = next; phone.classList.toggle('in-game', next === 'play');
    document.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === next ? 'page' : 'false'));
    view.innerHTML = ({ home: homeHTML, intro: introHTML, report: reportHTML, collection: collectionHTML, result: resultHTML, play: playHTML }[next])();
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => { view.scrollTop = 0; window.scrollTo(0, 0); });
    setTimeout(() => { view.scrollTop = 0; window.scrollTo(0, 0); }, 60);
  }
  function homeHTML() {
    const done = archive.sessions.filter(s => C.isComplete(s) && C.dayKey(s.endedAt) === C.dayKey()).length;
    const claimed = archive.rewards.some(r => r.day === C.dayKey());
    return `<div class="greeting"><div><span class="eyebrow">FOCUS NOOK</span><h2>今天，也慢慢来。</h2></div><span class="date-label">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span></div>
      <section class="hero"><span class="hero-small">给大脑一个小小的休息站</span><h3>一小轮专注，<br>一点点积累。</h3><p>选一款喜欢的 · 每轮约 5 分钟</p><div class="hero-art" aria-hidden="true"><span class="window-cross"></span></div></section>
      <div class="section-heading"><h3>今天想练什么？</h3><span>随心选择，无需排名</span></div>
      <div class="game-list">${Object.entries(C.GAMES).map(([id, g]) => `<button class="game-card" data-game="${id}"><span class="game-icon ${g.color}">${icon(id)}</span><span class="game-copy"><h4>${g.name}</h4><p>${g.caption}</p><span class="game-meta">${g.category} · 约 5 分钟</span></span><span class="game-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>
      <div class="daily-card"><div class="daily-mark" aria-hidden="true">${done ? '✓' : '✧'}</div><div class="daily-copy"><strong>${claimed ? '今天的小礼物，已收好' : done ? '一份小礼物正在等你' : '完成一轮，收一份小惊喜'}</strong><p>${done ? `今天已完成 ${done} 轮，按自己的节奏继续。` : '为你的投入，留一点仪式感。'}</p></div><button class="text-button" data-page="collection">${done && !claimed ? '去领取 →' : '看看 →'}</button></div>
      <p class="local-note">◌ 记录保存在此浏览器 · 无需登录</p>`;
  }
  const instructions = {
    memory: [['先看亮灯', '窗户会依次亮起，记住亮灯的先后顺序。'], ['再按顺序点回', '出现“轮到你了”后，依次点击刚才的窗户。'], ['慢慢增加挑战', '连续答对两题，序列加长；连续失误两题，适当放慢挑战。']],
    search: [['记住目标', '目标始终是四角星 ✦，与其他图形形状不同。'], ['找到它，轻点一下', '每幅图只有一个目标。误点会被记录，准确和速度都重要。'], ['逐步增加干扰', '最近五题表现稳定时，会出现更多干扰图形。']],
    signal: [['圆形出现，就点一下', '看到圆形“●”时，点击下方按钮或按空格。'], ['方形出现，耐心等待', '看到方形“■”时不点击，等待下一个信号。'], ['一次信号，一次回应', '每组 20 个信号中有 4 个方形；按住按钮不会连续计分。']]
  };
  function introHTML() {
    const g = C.GAMES[selectedGame];
    return `<button class="page-back" data-page="home">← 换个项目</button><div class="game-icon intro-icon ${g.color}">${icon(selectedGame)}</div><span class="eyebrow">${g.category} / ABOUT 5 MINUTES</span><h2 class="page-title">${g.name}</h2><p class="subcopy">${g.caption}</p><ol class="steps">${instructions[selectedGame].map((s, i) => `<li><span class="step-no">${i + 1}</span><div><b>${s[0]}</b><p>${s[1]}</p></div></li>`).join('')}</ol><button class="primary" data-action="start">开始正式训练 <span aria-hidden="true">→</span></button><button class="secondary" data-action="practice">先试 3 题，不计入记录</button><p class="smallprint intro-foot">正式训练约 4 分 30 秒，加上准备和结算约 5 分钟。可以暂停；当前题会重新生成，已完成题目保留。</p>`;
  }
  function playHTML() {
    const r = run;
    return `<div class="timer-row"><span class="pill">${r.practice ? '不计分练习' : '留一小段时间给自己'}</span><span class="timer" id="clock">${r.practice ? '练习' : time(C.DURATION)}<small>${r.practice ? '3 题' : '剩余'}</small></span></div><div class="progress-track"><div class="progress-fill" id="roundProgress" style="width:0"></div></div><div class="play-title"><h2>${C.GAMES[r.session.game].name}</h2><p id="roundMeta">准备开始</p></div><div id="phaseMessage" class="status-line" role="status" aria-live="polite">轻轻吸口气，我们开始。</div><div id="board"></div><div class="play-footer"><span id="roundCount">已完成 0 题</span><span id="roundAccuracy">按自己的节奏</span></div><div class="play-controls"><button data-action="pause">Ⅱ 暂停一下</button><button data-action="quit">结束本轮</button></div><p class="play-hint">${r.session.game === 'memory' ? '电脑也可使用数字键 1–9' : r.session.game === 'signal' ? '电脑也可按空格键回应' : '准确和速度，同样值得留意'}</p>`;
  }
  function currentLevel(game) {
    const last = archive.sessions.filter(s => s.game === game && C.isComplete(s)).at(-1);
    return last ? last.trials.filter(t => t.valid).at(-1)?.level || (game === 'memory' ? 3 : 1) : game === 'memory' ? 3 : 1;
  }
  async function start(practice) {
    if (run) return;
    if (blocked && !practice) { toast('存档暂时不可用，可以先试 3 题，或在记录页恢复备份。'); return; }
    const button = $('[data-action="start"]'); if (button) button.disabled = true;
    if (!practice) {
      try { archive = (await store.update(() => {})).doc; }
      catch (e) { saveError(e); if (button) button.disabled = false; return; }
    }
    const session = { id: C.id(), game: selectedGame, rule: C.RULE, startedAt: new Date().toISOString(), endedAt: null, activeMs: 0, elapsedMs: 0, status: 'running', eligible: false, trials: [] };
    run = { session, practice, level: practice ? (selectedGame === 'memory' ? 3 : 1) : currentLevel(selectedGame), paused: false, last: performance.now(), phase: 'ready', trial: null, correctStreak: 0, wrongStreak: 0, signalBag: [], savedAt: 0, finished: false };
    setPage('play');
    if (!practice) saveRun();
    timerId = setInterval(tick, 100);
    nextTrial();
  }
  function saveError(e) { banner('本轮暂未保存：' + (e?.name === 'QuotaExceededError' ? '浏览器存储空间不足，请先导出记录。' : '存储不可用，请保留此页面并重试。')); }
  async function saveRun() {
    if (!run || run.practice) return;
    run.session.elapsedMs = Math.max(0, Date.now() - Date.parse(run.session.startedAt));
    try { archive = (await store.saveSession(run.session)).doc; banner(''); }
    catch (e) { saveError(e); }
  }
  function later(callback, ms) { const e = epoch; const id = setTimeout(() => { if (e === epoch && run && !run.paused && !run.finished) callback(); }, ms); pending.push(id); return id; }
  function cancelTasks() { pending.forEach(clearTimeout); pending = []; epoch++; }
  function tick() {
    if (!run || run.finished || run.paused) return;
    const now = performance.now(), delta = now - run.last; run.last = now;
    if (delta > 2500 || document.hidden) { pause('页面暂时离开了前台。准备好后再继续，当前题会重新生成。'); return; }
    run.session.activeMs += delta;
    if (run.practice) return;
    const remaining = Math.max(0, C.DURATION - run.session.activeMs);
    $('#clock').innerHTML = `${remaining ? time(Math.ceil(remaining / 1000) * 1000) : '最后一题'}<small>${remaining ? '剩余' : ''}</small>`;
    $('#roundProgress').style.width = Math.min(100, run.session.activeMs / C.DURATION * 100) + '%';
    if (run.session.activeMs - run.savedAt > 5000) { run.savedAt = run.session.activeMs; saveRun(); }
    if (run.session.activeMs >= C.DURATION + 20000) { discardTrial('time_limit'); finish(false); }
  }
  function baseTrial() { return { level: run.level, condition: '', input: lastPointer, screen: innerWidth <= 520 ? 'small' : 'large', valid: true, correct: false, responded: false, noGo: false, rt: 0, errors: 0 }; }
  function nextTrial() {
    if (!run || run.paused || run.finished) return;
    cancelTasks();
    if (run.practice && run.session.trials.filter(t => t.valid).length >= 3) { finish(false); return; }
    if (!run.practice && run.session.activeMs >= C.DURATION) { finish(false); return; }
    const t = baseTrial(); run.trial = t;
    $('#roundMeta').textContent = run.practice ? `练习 ${run.session.trials.filter(t => t.valid).length + 1} / 3` : run.session.game === 'memory' ? `记住 ${run.level} 扇窗 · 3 × 3 方格` : run.session.game === 'search' ? `${[9, 16, 25][run.level - 1]} 个图形 · 找到 ✦` : '圆形点一下 · 方形等一等';
    if (run.session.game === 'memory') memoryTrial(t);
    else if (run.session.game === 'search') searchTrial(t);
    else signalTrial(t);
  }
  function message(text) { if ($('#phaseMessage')) $('#phaseMessage').textContent = text; }
  function memoryTrial(t) {
    t.condition = `memory-3x3-${t.level}-650-15000`; t.sequence = [];
    while (t.sequence.length < t.level) { const cell = Math.floor(Math.random() * 9); if (cell !== t.sequence.at(-1)) t.sequence.push(cell); }
    t.answer = [];
    $('#board').innerHTML = `<div class="memory-board" aria-label="记忆方格">${Array.from({ length: 9 }, (_, i) => `<button class="window-cell" data-cell="${i}" aria-label="窗户 ${i + 1}" disabled><span class="cell-number">${i + 1}</span></button>`).join('')}</div>`;
    run.phase = 'watch'; message('先看一看，记住亮灯的顺序');
    t.sequence.forEach((cell, i) => {
      later(() => $(`[data-cell="${cell}"]`).classList.add('lit'), 400 + i * 650);
      later(() => $(`[data-cell="${cell}"]`).classList.remove('lit'), 850 + i * 650);
    });
    later(() => { run.phase = 'answer'; t.answerAt = performance.now(); document.querySelectorAll('[data-cell]').forEach(b => { b.disabled = false; }); message(`轮到你了 · 0 / ${t.level}`); later(() => { t.rt = 15000; endTrial(false, '这题先放下，下一题继续。'); }, 15000); }, 400 + t.level * 650);
  }
  function noteInput(t, type) { if (!t.responded) t.input = type; else if (t.input !== type) t.input = 'mixed'; t.responded = true; }
  function memoryAnswer(cell, input) {
    if (!run || run.paused || run.phase !== 'answer' || run.session.game !== 'memory') return;
    const t = run.trial; noteInput(t, input); t.answer.push(cell); t.rt = Math.min(120000, performance.now() - t.answerAt);
    const button = $(`[data-cell="${cell}"]`); button.classList.add('pressed'); later(() => button.classList.remove('pressed'), 180);
    if (cell !== t.sequence[t.answer.length - 1]) { t.errors++; endTrial(false, '顺序有一点不同，下一题再试。'); }
    else if (t.answer.length === t.sequence.length) endTrial(true, '都记住了。做得不错！');
    else message(`很好，继续 · ${t.answer.length} / ${t.level}`);
  }
  function searchTrial(t) {
    const count = [9, 16, 25][t.level - 1];
    t.condition = `search-${count}-star-12000`; t.target = Math.floor(Math.random() * count);
    const symbols = ['◆', '●', '▲', '✚'];
    $('#board').innerHTML = `<div class="search-board" style="grid-template-columns:repeat(${Math.sqrt(count)},1fr)" aria-label="图形搜索区">${Array.from({ length: count }, (_, i) => `<button class="search-cell" data-search="${i}" aria-label="图形 ${i + 1}">${i === t.target ? '✦' : symbols[Math.floor(Math.random() * symbols.length)]}</button>`).join('')}</div>`;
    message('找到四角星 ✦，轻点一下'); run.phase = 'search'; t.answerAt = performance.now();
    later(() => { t.rt = 12000; endTrial(false, '这颗星躲得有点好，再找下一颗。'); }, 12000);
  }
  function searchAnswer(cell, input) {
    if (!run || run.paused || run.phase !== 'search') return;
    const t = run.trial; noteInput(t, input); t.rt = Math.min(120000, performance.now() - t.answerAt);
    if (cell === t.target) endTrial(t.errors === 0, t.errors ? `找到了 · 本题有 ${t.errors} 次误点` : '找到这颗星了！');
    else { t.errors++; const el = $(`[data-search="${cell}"]`); el.classList.add('wrong'); later(() => el.classList.remove('wrong'), 160); message('再仔细看看，目标是 ✦'); }
  }
  function shuffledSignalBag() { const a = Array(16).fill(false).concat(Array(4).fill(true)); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function signalTrial(t) {
    if (!run.signalBag.length) run.signalBag = shuffledSignalBag();
    t.noGo = run.signalBag.pop(); t.level = 1; t.condition = 'signal-20pct-1600-400';
    $('#board').innerHTML = `<div class="signal-board"><div class="signal-shape ${t.noGo ? 'no-go' : ''}" aria-label="${t.noGo ? '方形' : '圆形'}">${t.noGo ? '■' : '●'}</div><p class="signal-word">${t.noGo ? '这一刻，等一等' : '这一刻，点一下'}</p></div><button class="primary signal-button" data-action="respond">点一下 <span aria-hidden="true">· SPACE</span></button>`;
    run.phase = 'signal'; t.answerAt = performance.now(); message('圆形回应 · 方形等待');
    later(() => { if (!t.responded) { t.rt = 0; t.correct = t.noGo; } endTrial(t.correct, t.correct ? '节奏不错，继续。' : t.noGo ? '方形出现时，让手指休息一下。' : '刚才的圆形错过了，继续就好。'); }, 1600);
  }
  function signalAnswer(input) {
    if (!run || run.paused || run.phase !== 'signal' || run.trial.responded) return;
    const t = run.trial; noteInput(t, input); t.rt = Math.min(120000, performance.now() - t.answerAt); t.correct = !t.noGo; t.errors = t.noGo ? 1 : 0;
    $('[data-action="respond"]').disabled = true; message(t.correct ? '收到你的回应' : '下次看到方形，记得等一等');
  }
  function endTrial(correct, feedback) {
    if (!run || !run.trial || run.paused) return;
    cancelTasks(); const t = run.trial; t.correct = correct;
    delete t.answerAt;
    run.session.trials.push(t); run.trial = null; run.phase = 'feedback';
    $('#board').querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.remove('lit', 'pressed'); });
    if (run.session.game === 'signal') { const shape = $('.signal-shape'); shape.className = 'signal-shape blank'; shape.textContent = '·'; $('.signal-word').textContent = '下一个信号马上来'; }
    message(feedback);
    const m = C.metrics(run.session.trials); $('#roundCount').textContent = `已完成 ${m.count} 题`; $('#roundAccuracy').textContent = `本轮正确 ${m.correct} 题`;
    if (!run.practice && run.session.game === 'memory') {
      if (correct) { run.correctStreak++; run.wrongStreak = 0; } else { run.wrongStreak++; run.correctStreak = 0; }
      if (run.correctStreak >= 2) { run.level = Math.min(8, run.level + 1); run.correctStreak = 0; }
      if (run.wrongStreak >= 2) { run.level = Math.max(2, run.level - 1); run.wrongStreak = 0; }
    }
    if (!run.practice && run.session.game === 'search' && m.count % 5 === 0) { const n = run.session.trials.filter(t => t.valid).slice(-5).filter(t => t.correct).length; if (n >= 4) run.level = Math.min(3, run.level + 1); if (n <= 1) run.level = Math.max(1, run.level - 1); }
    if (!run.practice) saveRun();
    later(nextTrial, run.session.game === 'signal' ? 400 : 1000);
  }
  function discardTrial(reason) {
    if (!run || !run.trial) return;
    const t = run.trial; t.valid = false; t.correct = false; t.reason = reason; delete t.answerAt;
    run.session.trials.push(t); run.trial = null;
  }
  function pause(reason) {
    if (!run || run.finished || run.paused) return;
    run.paused = true; cancelTasks(); discardTrial('interrupted');
    if ($('#board')) $('#board').querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.remove('lit', 'pressed'); });
    if (!run.practice) saveRun();
    modal(`<span class="eyebrow">TAKE YOUR TIME</span><h2>停一下，也没关系。</h2><p>${reason || '计时已经暂停。当前题会重新生成，已完成的题目都保留。'}</p><button class="primary" data-action="resume">我准备好了，继续</button><button class="secondary" data-action="end">结束并保留已有记录</button>`);
  }
  function resume() { if (!run) return; closeModal(); run.paused = false; run.last = performance.now(); nextTrial(); }
  async function finish(interrupted) {
    if (!run || run.finished) return;
    run.finished = true; cancelTasks(); clearInterval(timerId); closeModal(); discardTrial('ended');
    const r = run; r.session.endedAt = new Date().toISOString(); r.session.elapsedMs = Math.max(0, Date.now() - Date.parse(r.session.startedAt));
    r.session.status = !r.practice && !interrupted && r.session.activeMs >= C.DURATION ? 'completed' : 'interrupted';
    r.session.eligible = !r.practice && C.isComplete(r.session);
    lastResult = { session: C.clone(r.session), practice: r.practice, saved: false };
    run = null;
    if (!r.practice) { try { archive = (await store.saveSession(r.session)).doc; lastResult.saved = true; banner(''); } catch (e) { saveError(e); } }
    setPage('result');
  }
  function resultHTML() {
    const r = lastResult, s = r.session, m = C.metrics(s.trials), full = s.status === 'completed';
    return `<div class="summary-seal" aria-hidden="true">${r.practice ? '✧' : full ? '✓' : '◌'}</div><div class="center"><span class="eyebrow">${r.practice ? 'A LITTLE PRACTICE' : 'ONE STEP AT A TIME'}</span><h2 class="page-title">${r.practice ? '已经找到感觉了吗？' : full ? '这一小轮，收好了。' : '今天的这一小步，也留下。'}</h2><p class="subcopy">${C.GAMES[s.game].name} · ${r.practice ? '练习不计入记录与奖励' : full ? '按自己的节奏，一点点积累。' : '已标记为中断，不计入完整训练。'}</p></div><div class="stats-grid"><div class="stat"><strong>${m.count}</strong><span>有效题目</span></div><div class="stat"><strong>${pct(m.accuracy)}</strong><span>本轮正确率</span></div><div class="stat"><strong>${time(s.activeMs)}</strong><span>有效时间</span></div></div><p class="smallprint">正确率为本轮各难度合计，仅作当轮反馈；个人趋势会按相同条件分组。</p>${full && !s.eligible ? '<div class="notice">本轮有效作答还不足，已保留记录；暂不计入每日礼物和进步比较。</div>' : ''}${!r.practice ? `<p class="saved-line ${r.saved ? '' : 'error'}">${r.saved ? '✓ 已保存在此浏览器' : '尚未保存，请重试或导出本轮备份'}</p>${!r.saved ? '<div class="row-buttons"><button data-action="retry-save">重试保存</button><button data-action="export-result">导出本轮</button></div>' : ''}` : ''}<button class="primary" data-action="again">${r.practice ? '开始正式训练' : '再来一轮'}</button><button class="secondary" data-page="home">换个项目</button>${!r.practice ? '<button class="secondary" data-page="report">查看个人记录</button>' : ''}${s.eligible && r.saved ? '<button class="text-button" style="display:block;margin:17px auto" data-page="collection">看看今天的小礼物 →</button>' : ''}`;
  }
  function filteredSessions() { const days = reportRange === 'all' ? Infinity : Number(reportRange); return archive.sessions.filter(s => Date.parse(s.startedAt) >= Date.now() - days * 86400000); }
  function reportHTML() {
    const sessions = filteredSessions(), completed = sessions.filter(C.isComplete), days = new Set(completed.map(s => C.dayKey(s.startedAt))).size;
    const gs = C.groups(sessions, reportGame), group = gs.find(g => g.key === reportGroup) || gs[0]; reportGroup = group?.key || '';
    const comp = C.comparison(group), recent = group ? C.metrics(group.rounds.slice(-5).flatMap(r => r.trials)) : null;
    const histories = sessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
    return `<span class="eyebrow">YOUR OWN PACE</span><h2 class="page-title">看见自己的积累。</h2><p class="subcopy">和过去的自己打个招呼。这里没有排行榜。</p><div class="stats-grid"><div class="stat"><strong>${completed.length}</strong><span>有效完成轮数</span></div><div class="stat"><strong>${days}</strong><span>训练日</span></div><div class="stat"><strong>${Math.floor(sessions.reduce((a, s) => a + s.activeMs, 0) / 60000)}</strong><span>训练分钟</span></div></div><div class="report-selects"><select id="gameFilter" aria-label="选择报告玩法">${Object.entries(C.GAMES).map(([id, g]) => `<option value="${id}" ${id === reportGame ? 'selected' : ''}>${g.name}</option>`).join('')}</select><select id="rangeFilter" aria-label="记录时间范围"><option value="all" ${reportRange === 'all' ? 'selected' : ''}>全部记录</option><option value="7" ${reportRange === '7' ? 'selected' : ''}>最近 7 天</option><option value="30" ${reportRange === '30' ? 'selected' : ''}>最近 30 天</option></select></div>
      <section class="report-card"><h3>相同条件下的表现</h3>${group ? `<div class="report-selects" style="margin-top:13px"><select id="conditionFilter" aria-label="选择可比训练条件">${gs.map(g => `<option value="${escape(g.key)}" ${g.key === group.key ? 'selected' : ''}>${reportGame === 'memory' ? g.level + ' 扇窗' : reportGame === 'search' ? [9,16,25][g.level - 1] + ' 个图形' : '固定节奏'} · ${inputNames[g.input]} · ${g.screen === 'small' ? '窄屏' : '宽屏'}</option>`).join('')}</select></div>${chart(group)}<p class="smallprint">最近 ${Math.min(10, group.rounds.length)} 轮中，此条件下的题目正确率（0–100%）。最近 ${Math.min(5, group.rounds.length)} 轮共 ${recent.count} 题。</p>${reportGame === 'signal' ? `<p class="smallprint">近期误按率 ${pct(recent.falseAlarm)} · 漏按率 ${pct(recent.miss)}<br>正确响应中位数 ${recent.rt === null ? '暂无' : Math.round(recent.rt) + ' ms'}</p>` : reportGame === 'search' ? `<p class="smallprint">近期误点 ${recent.errors} 次 · 无误点正确题用时中位数 ${recent.rt === null ? '暂无' : (recent.rt/1000).toFixed(2) + ' 秒'}</p>` : ''}<div class="notice">${comp ? `同条件初始 5 轮：${pct(comp.first.accuracy)}；最近 5 轮：${pct(comp.recent.accuracy)}。相差 ${((comp.recent.accuracy - comp.first.accuracy) * 100).toFixed(1)} 个百分点。<br>涉及 ${comp.days} 个训练日。这是任务内表现的描述性变化，不代表日常能力改善。` : `正在积累可比记录（${group.rounds.length} / 10 轮）。目前先看单轮表现；积累足够后，再比较初始 5 轮与最近 5 轮。`}</div>` : '<div class="empty-state"><div class="empty-icon">▥</div><p>你的曲线，从第一轮开始。<br>完成一次有效训练后，这里会留下记录。</p></div>'}</section>
      <div class="section-heading space-top"><h3>最近的脚印</h3><span>最多展示最近 20 轮</span></div><section class="report-card">${histories.length ? histories.map(s => { const m = C.metrics(s.trials); return `<div class="history-row"><div><strong>${C.GAMES[s.game].name}</strong><p>${date(s.startedAt)} · ${time(s.activeMs)} · ${m.count} 题</p></div><div class="right">${s.status === 'completed' ? C.isComplete(s) ? '已完成' : '作答不足' : s.status === 'running' ? '未完成' : '已中断'}<p>${pct(m.accuracy)} 正确 · 各难度合计</p></div></div>`; }).join('') : '<p class="smallprint center">还没有训练记录，去点亮第一扇窗吧。</p>'}</section><div class="row-buttons"><button data-action="export">导出备份</button><button data-action="import">恢复备份</button></div><p class="smallprint">数据仅保存在当前浏览器。清除网站数据会丢失记录，建议定期导出。不同设备、输入方式及难度不直接混比；规则升级后另行比较。</p>${blocked ? '<button class="secondary danger-link" data-action="export-raw">导出原始存档</button>' : ''}`;
  }
  function chart(group) {
    const rows = group.rounds.slice(-10), w = 306, h = 116, plotH = 80;
    const bars = rows.map((r, i) => { const x = 28 + i * (266 / Math.max(5, rows.length)); const bh = r.metrics.accuracy * plotH; return `<rect x="${x}" y="${99 - bh}" width="${Math.min(24, 180 / rows.length)}" height="${Math.max(1, bh)}" rx="4" fill="var(--accent)" opacity="${i === rows.length - 1 ? 1 : .5}"><title>${date(r.date)}：${pct(r.metrics.accuracy)}，${r.metrics.count} 题</title></rect>`; }).join('');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="相同条件的最近回合正确率柱状图"><path d="M24 19H303M24 59H303M24 99H303" stroke="#e9ecdf" stroke-dasharray="3 4"/><text x="0" y="22">100</text><text x="5" y="62">50</text><text x="10" y="102">0</text>${bars}<text x="27" y="115">${date(rows[0].date)}</text><text x="258" y="115">${date(rows.at(-1).date)}</text></svg>`;
  }
  function collectionHTML() {
    const today = C.dayKey(), earned = archive.sessions.some(s => C.isComplete(s) && C.dayKey(s.endedAt) === today), claimed = archive.rewards.some(r => r.day === today);
    return `<span class="eyebrow">LITTLE THINGS, BIG SMILES</span><h2 class="page-title">把小惊喜收起来。</h2><p class="subcopy">奖励每一次投入，也收藏一点好心情。</p><section class="collection-hero"><div class="gift" aria-hidden="true">✧</div><h3>${claimed ? '今天的礼物已经收好' : earned ? '今天的小礼物，可以拆了' : '一轮训练，一份小礼物'}</h3><p>${claimed ? '明天还有新的相遇。今天也可以继续训练。' : '完成一轮有效训练，每天可领取一次。'}</p><button class="primary" data-action="claim" ${!earned || claimed || blocked ? 'disabled' : ''}>${claimed ? '今日已领取' : earned ? '拆开小礼物' : '完成训练后解锁'}</button></section><p class="smallprint">普通 90% · 稀有 9% · 特别 1%。重复款累积数量；外观不改变难度和成绩。每日按本机日期计算，仅用于本地收藏。</p><div class="section-heading space-top"><h3>我的窗边色彩</h3><span>点击已拥有的款式换装</span></div><div class="skin-grid">${C.SKINS.map(s => `<button class="skin-card ${archive.equipped === s.id ? 'selected' : ''} ${!archive.owned[s.id] ? 'locked' : ''}" data-skin="${s.id}" ${!archive.owned[s.id] ? 'disabled' : ''} aria-label="${s.name}，${archive.owned[s.id] ? '已拥有，点击装备' : '尚未拥有'}"><span class="skin-swatch" style="--swatch:${s.color}"><i></i><i></i><i></i></span><strong>${s.name}</strong><small>${rarityNames[s.rarity]} · ${archive.owned[s.id] ? '拥有 ' + archive.owned[s.id] : '等待相遇'}</small>${archive.equipped === s.id ? '<span class="equipped">使用中</span>' : ''}</button>`).join('')}</div><div class="section-heading space-top"><h3>属于你的趣味奖项</h3><span>每一步，都算数</span></div>${C.achievements(archive).map(a => `<div class="achievement ${a.count < a.goal ? 'locked' : ''}"><span class="award-icon" aria-hidden="true">${a.count >= a.goal ? '✺' : '◌'}</span><div><h4>${a.title}</h4><p>${a.caption}</p><small>${a.count >= a.goal ? '已获得 · 为自己鼓个掌' : Math.min(a.count, a.goal) + ' / ' + a.goal}</small></div></div>`).join('')}<button class="secondary" data-action="share">保存我的成长卡片</button><p class="smallprint">可以自行把卡片分享给朋友。熟人圈与账号同步留待后续版本。</p>`;
  }
  function random() { const n = new Uint32Array(1); crypto.getRandomValues(n); return n[0] / 4294967296; }
  async function claimGift() {
    const b = $('[data-action="claim"]'); if (b) b.disabled = true;
    try {
      const result = await store.update(doc => C.claim(doc, C.dayKey(), random)); archive = result.doc; const skin = result.result;
      setPage('collection');
      modal(`<div class="gift center" style="color:${skin.color}">✧</div><span class="eyebrow">A LITTLE GIFT FOR YOU</span><h2>${skin.name}</h2><p>${rarityNames[skin.rarity]}款 · 已加入收藏${archive.owned[skin.id] > 1 ? '，现在拥有 ' + archive.owned[skin.id] + ' 份' : ''}。<br>谢谢你今天为自己留了一点时间。</p><button class="primary" data-equip="${skin.id}">现在换上</button><button class="secondary" data-action="close">先收起来</button>`);
    } catch (e) { toast(e.message || '领取失败，未扣除资格，请重试。'); setPage('collection'); }
  }
  async function equip(skin) { try { archive = (await store.update(doc => { if (!doc.owned[skin]) throw new Error('还没有这个款式。'); doc.equipped = skin; })).doc; applySkin(); closeModal(); setPage('collection'); toast('已经换上新的窗边色彩。'); } catch (e) { toast('换装未保存，请重试。'); } }
  function download(blob, name) { const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
  function exportArchive(value = archive) { download(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), `focus-nook-${C.dayKey()}.json`); }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('备份超过 8 MB，暂不支持恢复。'); return; }
    try { pendingImport = C.validate(JSON.parse(await file.text())); modal(`<h2>恢复这份备份？</h2><p>备份包含 ${pendingImport.sessions.length} 轮记录。恢复将替换此浏览器的现有记录与收藏。</p><button class="secondary" data-action="export">先导出当前记录</button><button class="primary" data-action="confirm-import">确认替换并恢复</button><button class="secondary" data-action="cancel-import">保留现有记录</button>`); }
    catch (e) { pendingImport = null; toast(e.message || '备份无法读取，现有数据没有改变。'); }
  }
  async function restoreImport() {
    if (!pendingImport) return;
    try {
      if (blocked) { const checked = C.clone(C.validate(pendingImport)); window.localStorage.setItem(C.KEY, JSON.stringify(checked)); archive = checked; store = new C.Store(window.localStorage, navigator.locks); }
      else archive = (await store.restore(pendingImport)).doc;
      pendingImport = null; blocked = false; banner(''); closeModal(); applySkin(); setPage('report'); toast('记录与收藏已恢复。');
    } catch (e) { toast('恢复失败，尚未替换成功。请检查存储空间。'); }
  }
  function shareCard() {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1100; const ctx = canvas.getContext('2d');
    const complete = archive.sessions.filter(C.isComplete), days = new Set(complete.map(s => C.dayKey(s.startedAt))).size;
    ctx.fillStyle = '#f7f3e9'; ctx.fillRect(0, 0, 900, 1100); ctx.fillStyle = '#547466'; ctx.fillRect(56, 62, 788, 9);
    ctx.font = '25px sans-serif'; ctx.fillText('FOCUS NOOK / 专注小屋', 74, 137); ctx.font = 'bold 62px sans-serif'; ctx.fillText('每一小步，都算数。', 74, 264);
    ctx.fillStyle = '#e6ecde'; ctx.fillRect(74, 326, 750, 260); ctx.fillStyle = '#304a3b'; ctx.font = 'bold 94px sans-serif'; ctx.fillText(String(complete.length), 114, 455); ctx.fillText(String(days), 486, 455); ctx.font = '27px sans-serif'; ctx.fillText('累计训练轮数', 114, 522); ctx.fillText('属于自己的训练日', 486, 522);
    ctx.font = '29px sans-serif'; C.achievements(archive).filter(a => a.count >= a.goal).forEach((a, i) => ctx.fillText('✧  ' + a.title, 84, 687 + i * 61));
    ctx.fillStyle = '#7b8675'; ctx.font = '23px sans-serif'; ctx.fillText('按自己的节奏，一点点积累。', 78, 946); ctx.font = '18px sans-serif'; ctx.fillText(`${C.dayKey()} · 本地训练记录 · ZOONN 之城`, 78, 1010);
    canvas.toBlob(blob => { if (blob) download(blob, `我的专注小卡-${C.dayKey()}.png`); }, 'image/png');
  }
  document.addEventListener('pointerdown', e => { lastPointer = e.pointerType === 'touch' ? 'touch' : 'mouse'; }, { passive: true });
  document.addEventListener('click', async e => {
    const button = e.target.closest('button,a'); if (!button || button.disabled) return;
    if (button.classList.contains('city-link') && run) { e.preventDefault(); pause('离开前可以结束本轮，已有作答将保留。结束后可点击左上角返回城市。'); return; }
    if (button.dataset.page) { if (run) return; e.preventDefault(); button.blur(); closeModal(); setPage(button.dataset.page); return; }
    if (button.dataset.game) { selectedGame = button.dataset.game; setPage('intro'); return; }
    if (button.dataset.skin) { equip(button.dataset.skin); return; }
    if (button.dataset.equip) { equip(button.dataset.equip); return; }
    const input = e.detail === 0 ? 'keyboard' : lastPointer;
    if (button.dataset.cell !== undefined) { memoryAnswer(Number(button.dataset.cell), input); return; }
    if (button.dataset.search !== undefined) { searchAnswer(Number(button.dataset.search), input); return; }
    switch (button.dataset.action) {
      case 'start': await start(false); break;
      case 'practice': await start(true); break;
      case 'pause': pause(); break;
      case 'resume': resume(); break;
      case 'quit': pause('结束后会保留已完成的题目，并将本轮标记为中断。'); break;
      case 'end': finish(true); break;
      case 'respond': signalAnswer(input); break;
      case 'again': selectedGame = lastResult.session.game; start(false); break;
      case 'close': closeModal(); break;
      case 'claim': claimGift(); break;
      case 'export': if (!blocked) { try { archive = store.load(); exportArchive(); } catch { toast('读取失败，请导出原始存档。'); } } else toast('当前记录无法读取，请使用“导出原始存档”。'); break;
      case 'export-result': { const copy = C.clone(archive); const i = copy.sessions.findIndex(s => s.id === lastResult.session.id); if (i < 0) copy.sessions.push(lastResult.session); else copy.sessions[i] = lastResult.session; exportArchive(copy); break; }
      case 'retry-save': try { archive = (await store.saveSession(lastResult.session)).doc; lastResult.saved = true; banner(''); setPage('result'); } catch (err) { saveError(err); } break;
      case 'import': $('#importFile').click(); break;
      case 'confirm-import': restoreImport(); break;
      case 'cancel-import': pendingImport = null; closeModal(); break;
      case 'export-raw': try { download(new Blob([window.localStorage.getItem(C.KEY) || ''], { type: 'application/json' }), 'focus-原始存档.json'); } catch { toast('浏览器拒绝读取存档。'); } break;
      case 'share': shareCard(); break;
    }
  });
  $('#helpButton').addEventListener('click', () => {
    if (run) { pause(); return; }
    modal('<h2>把这段时间，留给自己。</h2><p>每轮只练一种，约五分钟。记忆、寻找和等待，各有自己的节奏。</p><p>记录与收藏仅保存在当前浏览器；不同手机、电脑或浏览器暂不互通。可在“记录”中导出与恢复备份。</p><p>这里记录游戏任务内的表现，不是医学评估，也不会把游戏成绩直接当作日常能力改善。</p><button class="primary" data-action="close">知道了</button>');
  });
  document.addEventListener('keydown', e => {
    if (!run || run.paused || e.repeat || dialog.open) return;
    if (/^[1-9]$/.test(e.key) && run.session.game === 'memory') { e.preventDefault(); memoryAnswer(Number(e.key) - 1, 'keyboard'); }
    if (e.code === 'Space' && run.session.game === 'signal') { e.preventDefault(); signalAnswer('keyboard'); }
    if (e.key === 'Escape') { e.preventDefault(); pause(); }
  });
  dialog.addEventListener('cancel', e => { if (run?.paused) { e.preventDefault(); resume(); } else pendingImport = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && run) pause(); });
  window.addEventListener('blur', () => { if (run) pause(); });
  window.addEventListener('resize', () => { if (run && !run.paused) pause('窗口尺寸发生了变化。当前题会重来，避免影响记录。'); });
  window.addEventListener('beforeunload', e => { if (run && !run.practice) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('storage', e => { if (e.key !== C.KEY) return; try { archive = store.load(); applySkin(); if (!run && ['home','report','collection'].includes(page)) setPage(page); } catch { banner('其他窗口更新了无法读取的存档，请先导出备份。'); } });
  document.addEventListener('change', e => {
    if (e.target.id === 'gameFilter') { reportGame = e.target.value; reportGroup = ''; setPage('report'); }
    if (e.target.id === 'rangeFilter') { reportRange = e.target.value; reportGroup = ''; setPage('report'); }
    if (e.target.id === 'conditionFilter') { reportGroup = e.target.value; setPage('report'); }
    if (e.target.id === 'importFile') { importFile(e.target.files[0]); e.target.value = ''; }
  });
  applySkin(); setPage('home');
})();
