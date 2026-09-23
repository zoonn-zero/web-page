/* ==========================================================
   ZOONN 之城 - 留言对话窗口 · 与云端对话的公共逻辑
   ----------------------------------------------------------
   两处用到：主站右下角的访客窗口（chat-widget.js）
             你自己的后台页（owner.html）

   后端：Supabase
   云端规则（务必记住）：
   - role='visitor' 任何人都能写（免登录）
   - role='host'    只有登录后才能写
   - 所有人（含未登录）都能读全部消息
   这三条由数据库的行级安全策略（RLS）强制执行，前端绕不过去。
   ========================================================== */

(function (global) {
  'use strict';

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  // 本地记住房号与昵称：刷新页面后接着聊，不用重新输名字
  var LS_ROOM = 'zoonn_chat_room';
  var LS_NAME = 'zoonn_chat_name';
  var LS_SEEN = 'zoonn_chat_seen';

  var _client = null;
  var _sdkLoading = null;

  // ---------- 基础 ----------

  function loadSdk() {
    if (global.supabase && global.supabase.createClient) return Promise.resolve(global.supabase);
    if (_sdkLoading) return _sdkLoading;

    _sdkLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        if (global.supabase && global.supabase.createClient) resolve(global.supabase);
        else reject(new Error('SDK_LOAD_FAILED'));
      };
      s.onerror = function () { reject(new Error('SDK_LOAD_FAILED')); };
      document.head.appendChild(s);
    });

    return _sdkLoading;
  }

  function client() {
    if (_client) return Promise.resolve(_client);
    var cfg = global.ZOONN_CHAT_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      return Promise.reject(new Error('CONFIG_MISSING'));
    }
    return loadSdk().then(function (sdk) {
      _client = sdk.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'zoonn_auth'
        }
      });
      // 排查期：把客户端挂到全局，方便在浏览器控制台里直接试调用
      global.__cloud = _client;
      return _client;
    });
  }

  function db() {
    return client().then(function (c) { return c; });
  }

  // supabase-js 的查询是 thenable，直接返回即可。
  // 上层代码统一读 res.data / res.error，与 supabase 的返回结构一致，无需转换。
  function run(builder) {
    return db().then(function (c) { return builder(c); });
  }

  function store(k, v) {
    try { global.localStorage.setItem(k, v); } catch (e) { /* 隐私模式下忽略 */ }
  }
  function load(k) {
    try { return global.localStorage.getItem(k); } catch (e) { return null; }
  }

  // ---------- 房间 ----------

  function newRoomId() {
    var rnd = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    return 'r' + rnd;
  }

  function getRoomId() {
    var id = load(LS_ROOM);
    if (!id) {
      id = newRoomId();
      store(LS_ROOM, id);
    }
    return id;
  }

  function getNickname() {
    return load(LS_NAME) || '';
  }

  function setNickname(name) {
    store(LS_NAME, String(name || '').slice(0, 20));
  }

  // 建立一个新房间（相当于「换个话题重新开始」）
  function resetRoom(nickname) {
    var id = newRoomId();
    store(LS_ROOM, id);
    store(LS_SEEN, '0');
    if (nickname) setNickname(nickname);
    return id;
  }

  // 首次进入时把房间登记到 chat_rooms，后台才能列出来
  function ensureRoom(nickname) {
    var id = getRoomId();
    return run(function (c) {
      return c.from('chat_rooms')
        .upsert(
          { id: id, visitor_name: String(nickname || '').slice(0, 20) },
          { onConflict: 'id', ignoreDuplicates: true }
        );
    }).then(function (res) {
      // 房间已存在属正常，忽略
      if (res && res.error && res.error.code !== '23505') {
        return { roomId: id, error: res.error };
      }
      return { roomId: id, error: null };
    }).catch(function () {
      return { roomId: id, error: null };
    });
  }

  // ---------- 消息 ----------

  function fetchMessages(roomId, sinceId) {
    return run(function (c) {
      var q = c.from('chat_messages')
        .select('id, room_id, role, body, created_at')
        .eq('room_id', roomId)
        .order('id', { ascending: true })
        .limit(300);
      if (sinceId) q = q.gt('id', sinceId);
      return q;
    });
  }

  function fetchRecentRooms(limit) {
    return run(function (c) {
      return c.from('chat_rooms')
        .select('id, visitor_name, created_at, last_active')
        .order('last_active', { ascending: false })
        .limit(limit || 50);
    });
  }

  function sendMessage(roomId, role, body) {
    return run(function (c) {
      return c.from('chat_messages')
        .insert({ room_id: roomId, role: role, body: String(body).slice(0, 2000) })
        .select();
    });
  }

  function touchRoom(roomId) {
    return run(function (c) {
      return c.from('chat_rooms')
        .update({ last_active: new Date().toISOString() })
        .eq('id', roomId);
    }).catch(function () { /* 心跳失败不打扰用户 */ });
  }

  // ---------- 时间显示 ----------

  function hhmm(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  // 最简单的防注入：消息一律走 textContent，这里只做换行保留
  function lines(el, text) {
    el.textContent = text;
    el.style.whiteSpace = 'pre-wrap';
    el.style.wordBreak = 'break-word';
  }

  global.ZoonnChat = {
    client: client,
    db: db,
    run: run,
    LS_ROOM: LS_ROOM,
    LS_NAME: LS_NAME,
    LS_SEEN: LS_SEEN,
    getRoomId: getRoomId,
    getNickname: getNickname,
    setNickname: setNickname,
    resetRoom: resetRoom,
    ensureRoom: ensureRoom,
    fetchMessages: fetchMessages,
    fetchRecentRooms: fetchRecentRooms,
    sendMessage: sendMessage,
    touchRoom: touchRoom,
    hhmm: hhmm,
    timeAgo: timeAgo,
    lines: lines
  };
})(window);
