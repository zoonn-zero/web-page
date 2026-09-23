/* ==========================================================
   ZOONN 之城 - 留言后台
   ----------------------------------------------------------
   你自己用的页面：登录后能看到所有来访者，并以 host 身份回复。
   访客那端完全不需要登录。
   ========================================================== */

(function (global) {
  'use strict';

  var POLL_MS = 2000;
  var API = global.ZoonnChat;
  if (!API) return;

  var cloud = null;
  var roomId = null;
  var rooms = [];
  var lastId = 0;
  var timer = null;
  var live = true;
  var sending = false;

  var el = {};

  function $(id) { return document.getElementById(id); }

  // ---------- 消息提示 ----------

  function msg(text, ok) {
    el.gateMsg.textContent = text || '';
    el.gateMsg.className = 'gate-msg' + (ok ? ' is-ok' : '');
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || '处理中…';
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
  }

  // ---------- 登录闸门 ----------

  // 只显示指定 panel 的表单，其余隐藏。
  // 用 class 而不是 hidden 属性：hidden 只是 UA 样式，会被 display:flex 覆盖。
  function showPanel(name) {
    document.querySelectorAll('.gate-form').forEach(function (f) {
      var match = f.getAttribute('data-panel') === name;
      f.classList.toggle('is-panel-active', match);
    });

    // 初始：只显示密码登录
    showPanel('password');
  }

  // ---------- 错误翻译 ----------
  // 把 SDK 返回的错误码翻成人话，同时保留原始信息便于排查
  var DEBUG = true;  // 排查期打开：错误详情会一起显示出来

  function whyFailed(res) {
    var e = (res && res.error) || {};
    var code = e.code || e.kind || e.status || e.error || '';
    var text = e.message || e.error_description || '';

    var friendly = '';
    if (/rate|too.?many|frequen/i.test(code + " " + text)) {
      friendly = '发送太频繁了，等 1 分钟再试';
    } else if (/invalid.?email|email.*invalid|邮箱/i.test(code + " " + text)) {
      friendly = '邮箱格式不对，检查一下有没有写错';
    } else if (/expire/i.test(code + " " + text)) {
      friendly = '验证码已过期，重新点「发送」拿一个新的';
    } else if (/invalid.*token|invalid.*code|wrong.*code/i.test(code + " " + text)) {
      friendly = '验证码不对，检查有没有抄错';
    } else if (/unauthenticated|invalid_grant/i.test(code + " " + text)) {
      friendly = '账号或密码不对';
    } else if (/invalid_client|credential/i.test(code + " " + text)) {
      friendly = '这个域名的登录权限没配好，需要我处理一下';
    } else if (/network|timeout|unavailable/i.test(code + " " + text)) {
      friendly = '网络不稳定，稍后再试';
    }

    if (!friendly) {
      friendly = '出错了' + (code ? '（' + code + '）' : '');
    }

    if (DEBUG && (code || text)) {
      return friendly + '　[原始：' + String(code) + ' ' + String(text).slice(0, 120) + ']';
    }
    return friendly;
  }

  function initTabs() {
    // 登录面板只剩一个，无需切换逻辑；确保它处于可见状态即可
    showPanel('password');
  }

  // ---------- 错误翻译 ----------
  // 把 Supabase 返回的错误码翻成人话，同时保留原始信息便于排查
  var DEBUG = true;  // 排查期打开：错误详情会一起显示出来

  function whyFailed(res) {
    var e = (res && res.error) || {};
    var code = e.code || e.status || e.error_code || e.error || '';
    var text = e.message || e.msg || e.error_description || '';

    var friendly = '';
    var blob = String(code) + ' ' + String(text);

    if (/invalid.?login|invalid.?credential|invalid.?grant/i.test(blob)) {
      friendly = '邮箱或密码不对，再核对一下';
    } else if (/email.?not.?confirmed/i.test(blob)) {
      friendly = '这个账号还没确认，去 Supabase 后台把它改成已确认';
    } else if (/invalid.?email|email.*invalid/i.test(blob)) {
      friendly = '邮箱格式不对，检查一下有没有写错';
    } else if (/rate|too.?many|frequen/i.test(blob)) {
      friendly = '尝试太频繁了，等 1 分钟再试';
    } else if (/user.?not.?found/i.test(blob)) {
      friendly = '这个邮箱没有注册过';
    } else if (/network|timeout|unavailable|fetch/i.test(blob)) {
      friendly = '网络不稳定，稍后再试';
    } else if (/origin|domain|redirect/i.test(blob)) {
      friendly = '这个域名的登录权限没配好，需要我处理一下';
    }

    if (!friendly) {
      friendly = '出错了' + (code ? '（' + code + '）' : '');
    }

    if (DEBUG && (code || text)) {
      return friendly + '　[原始：' + String(code) + ' ' + String(text).slice(0, 120) + ']';
    }
    return friendly;
  }

  // --- 密码登录（唯一的登录入口） ---
  function bindPassword() {
    $('formPassword').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('.gate-btn');
      var email = $('pwEmail').value.trim();
      var password = $('pwPassword').value;
      if (!email || !password) return msg('邮箱和密码都要填');

      busy(btn, true, '登录中…');
      cloud.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          busy(btn, false);
          if (res.error) return msg(whyFailed(res));
          enterApp('登录成功。');
        })
        .catch(function (err) {
          busy(btn, false);
          msg('连不上，稍后再试');
        });
    });
  }

  // 只保留一个登录入口，其余形态（验证码 / 注册 / 重置）已下线。
  // 忘记密码时在 Supabase 后台直接改，不从这里走。

  // ---------- 进入后台 ----------

  function enterApp(notice) {
    el.ownerGate.hidden = true;
    // 用 class 而不是 hidden 属性：.owner-app 的 display:flex 会盖掉 hidden
    el.ownerApp.classList.add('is-live');

    cloud.auth.getUser().then(function (res) {
      var u = res && res.data && res.data.user;
      if (u && u.email) el.ownerEmail.textContent = u.email;
    }).catch(function () {});

    // 顶部给一条明确的成功提示，避免"点了没反应"的疑惑
    if (notice) {
      el.mainSub.textContent = notice;
      el.mainSub.classList.add('is-ok');
    }

    loadRooms();
    if (!timer) {
      timer = global.setInterval(function () {
        if (live && roomId) pollThread();
      }, POLL_MS);
      global.setInterval(function () {
        if (live) loadRooms(true);
      }, 10000);
    }
  }

  // ---------- 会话列表 ----------

  function loadRooms(silent) {
    return API.fetchRecentRooms(60).then(function (res) {
      if (res && res.error) return;
      rooms = (res && res.data) || [];

      if (!rooms.length) {
        el.roomList.innerHTML = '<div class="side-empty">还没有人来过。<br><br>想看效果的话，去 <b>zoonn.org</b> 右下角发一条消息，这里马上就会出现。</div>';
        return;
      }

      var current = roomId;
      el.roomList.innerHTML = '';

      rooms.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'room-item' + (r.id === current ? ' is-active' : '');
        item.setAttribute('data-room', r.id);

        var name = document.createElement('div');
        name.className = 'room-name';
        var label = document.createElement('span');
        label.textContent = r.visitor_name || '匿名访客';
        name.appendChild(label);

        var time = document.createElement('div');
        time.className = 'room-time';
        time.textContent = API.timeAgo(r.last_active || r.created_at);

        item.appendChild(name);
        item.appendChild(time);

        item.addEventListener('click', function () {
          openRoom(r);
        });

        el.roomList.appendChild(item);
      });
    }).catch(function () {});
  }

  // ---------- 打开某个人的对话 ----------

  function openRoom(room) {
    roomId = room.id;
    lastId = 0;
    el.mainTitle.textContent = room.visitor_name || '匿名访客';
    el.mainSub.textContent = '首次出现 ' + API.timeAgo(room.created_at);
    el.ownerCompose.classList.add('is-live');
    el.toggleLive.classList.remove('is-hidden');

    el.roomList.querySelectorAll('.room-item').forEach(function (it) {
      it.classList.toggle('is-active', it.getAttribute('data-room') === roomId);
    });

    loadThread();
  }

  function loadThread() {
    return API.fetchMessages(roomId, 0).then(function (res) {
      if (res && res.error) return;
      var rows = (res && res.data) || [];
      el.thread.innerHTML = '';
      lastId = 0;

      if (!rows.length) {
        el.thread.innerHTML = '<div class="thread-empty">这个人还没说话。</div>';
        return;
      }

      rows.forEach(function (m) {
        appendMsg(m);
        if (m.id > lastId) lastId = m.id;
      });
    }).catch(function () {});
  }

  function pollThread() {
    API.fetchMessages(roomId, lastId).then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) return;
      rows.forEach(function (m) {
        appendMsg(m);
        if (m.id > lastId) lastId = m.id;
      });
      // 主要是访客发来新消息时，顺手把列表的时间刷新一下
      if (rows.some(function (m) { return m.role === 'visitor'; })) loadRooms(true);
    }).catch(function () {});
  }

  function appendMsg(m) {
    var empty = el.thread.querySelector('.thread-empty');
    if (empty) empty.remove();

    var mine = m.role === 'host';
    var row = document.createElement('div');
    row.className = 'owner-row ' + (mine ? 'is-host' : 'is-visitor');

    var bubble = document.createElement('div');
    bubble.className = 'owner-bubble';
    API.lines(bubble, m.body);

    var meta = document.createElement('div');
    meta.className = 'owner-meta';
    meta.textContent = (mine ? '你' : (el.mainTitle.textContent || '访客')) +
      ' · ' + API.hhmm(m.created_at);

    row.appendChild(bubble);
    row.appendChild(meta);
    el.thread.appendChild(row);
    el.thread.scrollTop = el.thread.scrollHeight;
  }

  // ---------- 回复 ----------

  function bindCompose() {
    el.ownerCompose.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (el.ownerInput.value || '').trim();
      if (!text || sending || !roomId) return;

      sending = true;
      el.ownerSend.disabled = true;
      el.ownerInput.value = '';
      el.ownerInput.style.height = 'auto';

      API.sendMessage(roomId, 'host', text).then(function (res) {
        sending = false;
        el.ownerSend.disabled = false;

        if (res && res.error) {
          global.alert('这条没发出去：' + (res.error.message || '未知错误'));
          el.ownerInput.value = text;
          return;
        }

        var created = (res && res.data && res.data[0]) || null;
        if (created) {
          appendMsg(created);
          if (created.id > lastId) lastId = created.id;
        } else {
          loadThread();
        }
        API.touchRoom(roomId);
      }).catch(function () {
        sending = false;
        el.ownerSend.disabled = false;
        global.alert('网络好像有问题，稍后再试');
        el.ownerInput.value = text;
      });
    });

    el.ownerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.ownerCompose.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    el.ownerInput.addEventListener('input', function () {
      el.ownerInput.style.height = 'auto';
      el.ownerInput.style.height = Math.min(140, el.ownerInput.scrollHeight) + 'px';
    });
  }

  // ---------- 顶栏按钮 ----------

  function bindHead() {
    el.toggleLive.addEventListener('click', function () {
      live = !live;
      el.toggleLive.textContent = live ? '暂停自动刷新' : '恢复自动刷新';
    });

    $('refreshRooms').addEventListener('click', function () {
      loadRooms();
    });

    $('signOut').addEventListener('click', function () {
      cloud.auth.signOut().then(function () {
        global.location.reload();
      });
    });
  }

  // ---------- 入口 ----------

  function boot() {
    el.gateMsg = $('gateMsg');
    el.ownerGate = $('ownerGate');
    el.ownerApp = $('ownerApp');
    el.ownerEmail = $('ownerEmail');
    el.roomList = $('roomList');
    el.mainTitle = $('mainTitle');
    el.mainSub = $('mainSub');
    el.thread = $('thread');
    el.ownerCompose = $('ownerCompose');
    el.ownerInput = $('ownerInput');
    el.ownerSend = $('ownerSend');
    el.toggleLive = $('toggleLive');

    initTabs();
    bindHead();
    bindCompose();

    API.client().then(function (c) {
      cloud = c;
      bindPassword();

      return cloud.auth.getSession();
    }).then(function (res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) enterApp();
    }).catch(function () {
      msg('连不上云端，检查网络后刷新重试');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
