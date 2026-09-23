/* ==========================================================
   ZOONN 之城 - 右下角留言对话窗口
   ----------------------------------------------------------
   访客不需要登录、不需要邮箱，输入昵称即可开口。
   机制：每 2 秒向云端要一次新消息，不是真推送但人眼无感。
   ========================================================== */

(function (global) {
  'use strict';

  var POLL_MS = 2000;
  var API = global.ZoonnChat;
  if (!API) return;

  var root, listEl, formEl, inputEl, nameEl, statusEl, badgeEl, titleEl, footEl;
  var roomId = API.getRoomId();
  var lastId = 0;
  var timer = null;
  var opened = false;
  var nickname = API.getNickname();
  var seenId = parseInt(API.load ? '0' : '0', 10) || 0;
  var sending = false;
  var offline = false;

  // ---------- 骨架 ----------

  function build() {
    if (root) return;

    root = document.createElement('div');
    root.className = 'chat-widget';
    root.innerHTML = [
      '<button class="chat-launcher" id="chatLauncher" aria-label="打开留言对话窗口">',
      '  <span class="chat-launcher-icon">💬</span>',
      '  <span class="chat-badge" id="chatBadge" hidden>1</span>',
      '</button>',
      '<section class="chat-panel" id="chatPanel" aria-hidden="true">',
      '  <header class="chat-head">',
      '    <div class="chat-head-text">',
      '      <div class="chat-head-title" id="chatHeadTitle">跟 zoonn 说句话</div>',
      '      <div class="chat-head-status" id="chatHeadStatus">正在连接…</div>',
      '    </div>',
      '    <button class="chat-head-btn" id="chatRestart" title="换个话题重新开始">↻</button>',
      '    <button class="chat-head-btn" id="chatClose" title="收起">&times;</button>',
      '  </header>',
      '  <div class="chat-intro" id="chatIntro">',
      '    <p>不用注册、不用留邮箱。说点什么，我回来会看到。</p>',
      '    <input type="text" class="chat-name-input" id="chatName" maxlength="20" placeholder="怎么称呼你？（可留空）">',
      '    <button class="chat-begin" id="chatBegin">开始对话</button>',
      '  </div>',
      '  <div class="chat-body" id="chatBody" hidden>',
      '    <div class="chat-list" id="chatList"></div>',
      '    <form class="chat-compose" id="chatCompose">',
      '      <textarea class="chat-input" id="chatInput" rows="1" maxlength="2000" placeholder="写点什么…（Enter 发送）"></textarea>',
      '      <button type="submit" class="chat-send" id="chatSend" title="发送">↑</button>',
      '    </form>',
      '    <div class="chat-foot" id="chatFoot"></div>',
      '  </div>',
      '</section>'
    ].join('');

    document.body.appendChild(root);

    listEl = document.getElementById('chatList');
    formEl = document.getElementById('chatCompose');
    inputEl = document.getElementById('chatInput');
    nameEl = document.getElementById('chatName');
    statusEl = document.getElementById('chatHeadStatus');
    badgeEl = document.getElementById('chatBadge');
    titleEl = document.getElementById('chatHeadTitle');
    footEl = document.getElementById('chatFoot');

    bind();
  }

  function bind() {
    document.getElementById('chatLauncher').addEventListener('click', toggle);
    document.getElementById('chatClose').addEventListener('click', close);
    document.getElementById('chatRestart').addEventListener('click', restart);
    document.getElementById('chatBegin').addEventListener('click', begin);

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // 输入框自动长高
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(96, inputEl.scrollHeight) + 'px';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && opened) close();
    });
  }

  // ---------- 开关 ----------

  function toggle() {
    if (opened) close();
    else open();
  }

  function open() {
    build();
    opened = true;
    root.classList.add('is-open');
    document.getElementById('chatPanel').setAttribute('aria-hidden', 'false');
    clearBadge();

    if (nickname || API.getNickname()) {
      showBody();
    } else {
      nameEl.focus();
    }
  }

  function close() {
    opened = false;
    if (root) {
      root.classList.remove('is-open');
      var p = document.getElementById('chatPanel');
      if (p) p.setAttribute('aria-hidden', 'true');
    }
  }

  function showBody() {
    document.getElementById('chatIntro').hidden = true;
    document.getElementById('chatBody').hidden = false;
    titleEl.textContent = '跟 zoonn 说句话';
    inputEl.focus();
    startPolling();
    loadAll();
  }

  function begin() {
    nickname = (nameEl.value || '').trim().slice(0, 20);
    if (nickname) API.setNickname(nickname);
    API.ensureRoom(nickname).then(function (r) {
      roomId = r.roomId;
      showBody();
    });
  }

  function restart() {
    if (!global.confirm('开一段新的对话？之前的记录还会留在后台。')) return;
    lastId = 0;
    roomId = API.resetRoom(nickname);
    listEl.innerHTML = '';
    footEl.textContent = '';
    API.ensureRoom(nickname).then(function () {
      renderEmpty();
    });
  }

  // ---------- 渲染 ----------

  function renderEmpty() {
    listEl.innerHTML = '<div class="chat-empty">还没有消息。说句话吧，我会看到的。</div>';
  }

  function append(msg) {
    var empty = listEl.querySelector('.chat-empty');
    if (empty) empty.remove();

    var mine = msg.role === 'visitor';
    var row = document.createElement('div');
    row.className = 'chat-row ' + (mine ? 'is-visitor' : 'is-host');

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    API.lines(bubble, msg.body);

    var meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.textContent = (mine ? '你' : 'zoonn') + ' · ' + API.hhmm(msg.created_at);

    row.appendChild(bubble);
    row.appendChild(meta);
    listEl.appendChild(row);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = 'chat-head-status' + (tone ? ' is-' + tone : '');
  }

  // ---------- 数据 ----------

  function loadAll() {
    return API.fetchMessages(roomId, 0).then(function (res) {
      if (res && res.error) {
        setStatus('暂时连不上，稍后重试', 'warn');
        return;
      }
      var rows = (res && res.data) || [];
      listEl.innerHTML = '';
      lastId = 0;
      if (!rows.length) {
        renderEmpty();
      } else {
        rows.forEach(function (m) {
          append(m);
          if (m.id > lastId) lastId = m.id;
        });
      }
      setStatus('我在，留言会保留', 'ok');
      offline = false;
      saveSeen();
    }).catch(function () {
      setStatus('暂时连不上，稍后重试', 'warn');
    });
  }

  function poll() {
    if (!opened) return;
    API.fetchMessages(roomId, lastId).then(function (res) {
      if (res && res.error) return;
      var rows = (res && res.data) || [];
      if (!rows.length) {
        if (offline) {
          setStatus('我在，留言会保留', 'ok');
          offline = false;
        }
        return;
      }
      rows.forEach(function (m) {
        append(m);
        if (m.id > lastId) lastId = m.id;
      });
      saveSeen();
      var fromHost = rows.some(function (m) { return m.role === 'host'; });
      if (fromHost && !opened) showBadge();
    }).catch(function () {
      if (!offline) {
        setStatus('网络好像不稳定', 'warn');
        offline = true;
      }
    });
  }

  function send() {
    var text = (inputEl.value || '').trim();
    if (!text || sending) return;

    sending = true;
    inputEl.value = '';
    inputEl.style.height = 'auto';

    if (!nickname && API.getNickname()) nickname = API.getNickname();

    API.ensureRoom(nickname).then(function () {
      return API.sendMessage(roomId, 'visitor', text);
    }).then(function (res) {
      sending = false;
      if (res && res.error) {
        setStatus('这条没发出去，再试一次？', 'warn');
        inputEl.value = text;
        return;
      }
      var created = (res && res.data && res.data[0]) || null;
      if (created) {
        append(created);
        if (created.id > lastId) lastId = created.id;
      } else {
        loadAll();
      }
      setStatus('已送达，我回来就回你', 'ok');
      API.touchRoom(roomId);
    }).catch(function () {
      sending = false;
      setStatus('这条没发出去，再试一次？', 'warn');
      inputEl.value = text;
    });
  }

  function saveSeen() {
    try { global.localStorage.setItem(API.LS_SEEN, String(lastId)); } catch (e) {}
  }

  // ---------- 未读角标（窗口收起时收到主人的回复） ----------

  function showBadge() {
    if (!badgeEl) return;
    badgeEl.hidden = false;
  }
  function clearBadge() {
    if (badgeEl) badgeEl.hidden = true;
  }

  // 窗口没开时也要能提示：低频轮询（8 秒）
  function backgroundPoll() {
    if (opened) return;
    API.fetchMessages(roomId, lastId).then(function (res) {
      var rows = (res && res.data) || [];
      rows.forEach(function (m) {
        if (m.id > lastId) lastId = m.id;
        if (m.role === 'host') showBadge();
      });
    }).catch(function () {});
  }

  function startPolling() {
    if (timer) return;
    timer = global.setInterval(function () {
      if (opened) poll();
    }, POLL_MS);
    global.setInterval(backgroundPoll, 8000);
  }

  // ---------- 启动 ----------

  function init() {
    build();
    startPolling();
    if (API.getNickname()) {
      nickname = API.getNickname();
      API.ensureRoom(nickname);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
