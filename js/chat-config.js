/* ==========================================================
   ZOONN 之城 - 留言对话窗口 · 云端配置
   ----------------------------------------------------------
   后端：Supabase（Project: zoonn-city-chat，区域 东京）
   这两项是 Supabase 的 Project URL 与 anon public key，
   本身就是设计给前端公开使用的值，泄露没有风险。
   真正的安全边界是数据库里的行级安全策略（RLS）：
     · 访客可写 role='visitor'，可读全部
     · 只有登录用户能写 role='host'
   不要改动，也不要把它写进日志。
   ========================================================== */

window.ZOONN_CHAT_CONFIG = {
  url: 'https://wyrlvktglmytbffzjgxh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cmx2a3RnbG15dGJmZnpqZ3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTkyNjMsImV4cCI6MjEwNTczNTI2M30.-Lng3vh2RgngRlF60g13weA9TB2N0UwQxAUGk8pnj54'
};
