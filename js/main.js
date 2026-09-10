/* ==========================================================
   ZOONN 之城 - 主交互逻辑
   ========================================================== */

document.addEventListener('DOMContentLoaded', function() {
  initBuildings();
  initModals();
  initArticleList();
  initProjectGrid();
  initArcadeGrid();
  initMagazineRack();
  initWeekly();
  initMapMarkers();
  initGalleryBoard();
  initCat();
  initMessageForm();
});

// ===== 建筑热区点击事件 =====
function initBuildings() {
  const hotspots = document.querySelectorAll('.hotspot');
  
  hotspots.forEach(hotspot => {
    hotspot.addEventListener('click', function() {
      const buildingType = this.getAttribute('data-building');
      
      // 添加脉冲动画
      this.classList.add('active');
      setTimeout(() => {
        this.classList.remove('active');
      }, 500);
      
      // 打开对应模态框
      openModal(buildingType);
    });
  });
}

// ===== 模态框控制 =====
function initModals() {
  // 关闭按钮
  const closeButtons = document.querySelectorAll('.modal-close');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const modalName = this.getAttribute('data-close');
      closeModal(modalName);
    });
  });
  
  // 点击背景关闭
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.remove('active');
      }
    });
  });
  
  // ESC 键关闭
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      modals.forEach(modal => {
        modal.classList.remove('active');
      });
    }
  });
}

function openModal(name) {
  const modal = document.getElementById('modal-' + name);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(name) {
  const modal = document.getElementById('modal-' + name);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ===== 编辑部 - 渲染文章列表 =====
function initArticleList() {
  const list = document.getElementById('articleList');
  if (!list) return;

  list.innerHTML = articles.map((article, index) => `
    <div class="article-card" data-article-index="${index}">
      <div class="article-title">${article.title}</div>
      <div class="article-summary">${article.summary}</div>
      <div class="article-date">${article.date}</div>
      <div class="article-read-hint">点击阅读全文 →</div>
    </div>
  `).join('');

  // 点击文章卡片打开正文
  const cards = document.querySelectorAll('.article-card');
  cards.forEach(card => {
    card.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-article-index'));
      openArticleDetail(index);
    });
  });
}

// ===== 编辑部 - 打开文章详情 =====
function openArticleDetail(index) {
  const article = articles[index];
  if (!article) return;

  const detailContent = document.getElementById('articleDetailContent');
  if (detailContent) {
    detailContent.innerHTML = `
      <h2 class="article-detail-title">${article.title}</h2>
      <div class="article-detail-date">发表于 ${article.date}</div>
      <div class="article-detail-body">${article.content}</div>
    `;
  }

  openModal('article-detail');
}

// ===== AI公司 - 渲染项目卡片 =====
function initProjectGrid() {
  const grid = document.getElementById('projectGrid');
  if (!grid) return;
  
  grid.innerHTML = projects.map(project => `
    <div class="project-card">
      <div class="project-icon">${project.icon}</div>
      <div class="project-name">${project.name}</div>
      <div class="project-desc">${project.description}</div>
    </div>
  `).join('');
}

// ===== 游戏厅 - 渲染街机列表 =====
function initArcadeGrid() {
  const grid = document.getElementById('arcadeGrid');
  if (!grid) return;
  
  grid.innerHTML = games.map(game => `
    <div class="arcade-machine" data-game="${game.name}">
      <div class="arcade-screen">${game.screenshot}</div>
      <div class="arcade-name">${game.name}</div>
      <div class="arcade-status">${game.status === 'developing' ? '🚧 开发中...' : '▶ 开始游戏'}</div>
    </div>
  `).join('');
  
  // 点击街机
  const machines = document.querySelectorAll('.arcade-machine');
  machines.forEach(machine => {
    machine.addEventListener('click', function() {
      const gameName = this.getAttribute('data-game');
      const game = games.find(g => g.name === gameName);
      if (game && game.status === 'available' && game.gameUrl !== '#') {
        window.open(game.gameUrl, '_blank');
      } else {
        alert('🎮 ' + gameName + ' 还在开发中，敬请期待~');
      }
    });
  });
}

// ===== 咖啡馆 - 渲染杂志架 =====
function initMagazineRack() {
  const rack = document.getElementById('magazineRack');
  if (!rack) return;

  // AI 周刊作为独立入口排在最前面，点开是往期列表
  let weeklyCard = '';
  if (typeof weeklyIssues !== 'undefined' && weeklyIssues.length > 0) {
    const latest = weeklySorted()[0];
    weeklyCard = `
    <div class="magazine-card magazine-card-weekly" id="weeklyEntryCard">
      <div class="magazine-cover magazine-cover-weekly">
        <div class="weekly-cover-vol">VOL</div>
        <div class="weekly-cover-num">${String(latest.vol || 0).padStart(2, '0')}</div>
      </div>
      <div class="magazine-info">
        <div class="magazine-title">AI 周刊</div>
        <div class="magazine-desc">每周一更新 · 已出 ${weeklyIssues.length} 期 · 点开看最新与往期</div>
      </div>
    </div>`;
  }

  rack.innerHTML = weeklyCard + magazines.map((mag, index) => `
    <div class="magazine-card" data-mag-index="${index}">
      <div class="magazine-cover">${mag.emoji || '📖'}</div>
      <div class="magazine-info">
        <div class="magazine-title">${mag.title}</div>
        <div class="magazine-desc">${mag.summary}</div>
      </div>
    </div>
  `).join('');

  const entry = document.getElementById('weeklyEntryCard');
  if (entry) {
    entry.addEventListener('click', openWeeklyIndex);
  }

  // 点击其他杂志打开详情
  rack.querySelectorAll('.magazine-card[data-mag-index]').forEach(card => {
    card.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-mag-index'), 10);
      openMagazineDetail(index);
    });
  });
}

function openMagazineDetail(index) {
  const mag = magazines[index];
  if (!mag) return;
  
  const detailContent = document.getElementById('magazineDetailContent');
  if (detailContent) {
    detailContent.innerHTML = `
      ${mag.content}
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e8c9a0;">
        <a href="${mag.videoUrl}" target="_blank" class="magazine-video-link">▶ 观看原视频</a>
      </div>
    `;
  }
  
  openModal('magazine-detail');
}

/* ==========================================================
   AI 周刊
   数据在 data.js 的 weeklyIssues 数组里，每周由脚本自动新增一期。
   结构：期刊索引（往期列表）-> 单期正文（头条 / 重点 / 简讯 三级）
   ========================================================== */

// 四个分类在简讯里显示成两个字，避免长标签挤占正文
const WEEKLY_TAG_SHORT = {
  '模型与产品发布': '模型',
  'AI 工具与效率玩法': '工具',
  '研究突破': '研究',
  '行业与资本': '行业'
};

function weeklyTagShort(tag) {
  return WEEKLY_TAG_SHORT[tag] || (tag || '').slice(0, 2);
}

function weeklySorted() {
  return weeklyIssues.slice().sort((a, b) => (b.vol || 0) - (a.vol || 0));
}

function weeklyByLevel(items, level) {
  return (items || []).filter(item => item.level === level);
}

function weeklyMinutes(issue) {
  if (issue.minutes) return issue.minutes;
  const count = (issue.items || []).length;
  return Math.max(1, Math.round(count * 0.3));
}

function initWeekly() {
  const back = document.getElementById('weeklyBack');
  if (back) {
    back.addEventListener('click', function() {
      closeModal('weekly');
      openWeeklyIndex();
    });
  }
}

// 期刊索引：最新一期在最上面，每张卡片列出本期要目
function openWeeklyIndex() {
  const list = document.getElementById('weeklyIndexList');
  if (!list || typeof weeklyIssues === 'undefined') return;

  list.innerHTML = weeklySorted().map((issue, idx) => {
    const items = issue.items || [];
    const keys = weeklyByLevel(items, 'key');
    const briefs = weeklyByLevel(items, 'brief');
    const toc = weeklyByLevel(items, 'lead').concat(keys).slice(0, 3);
    const cats = new Set(items.map(i => i.tag)).size;

    return `
    <article class="weekly-issue${idx === 0 ? ' is-latest' : ''}" data-vol="${issue.vol}">
      <div class="weekly-issue-spine">
        <div class="weekly-issue-date">${issue.date || ''}</div>
        <div class="weekly-issue-vol">${String(issue.vol || 0).padStart(2, '0')}</div>
        ${idx === 0 ? '<div class="weekly-issue-badge">最新</div>' : ''}
      </div>
      <div class="weekly-issue-body">
        <div class="weekly-issue-headline">${issue.headline || issue.summary || ''}</div>
        <div class="weekly-issue-meta">${items.length} 条 · ${cats} 个分类 · 约 ${weeklyMinutes(issue)} 分钟读完</div>
        <div class="weekly-issue-toc">
          <div class="weekly-issue-toc-label">本期要目</div>
          ${toc.map(i => `<div class="weekly-issue-toc-item">${i.heading || ''}</div>`).join('')}
          ${briefs.length ? `<div class="weekly-issue-toc-more">另有简讯 ${briefs.length} 条</div>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');

  list.querySelectorAll('.weekly-issue').forEach(card => {
    card.addEventListener('click', function() {
      openWeeklyIssue(parseInt(this.getAttribute('data-vol'), 10));
    });
  });

  closeModal('cafe');
  openModal('weekly-index');
}

// 单期正文：按 lead / key / brief 三档排版
function openWeeklyIssue(vol) {
  const issue = weeklyIssues.filter(w => w.vol === vol)[0];
  const box = document.getElementById('weeklyArticle');
  if (!issue || !box) return;

  const items = issue.items || [];
  const lead = weeklyByLevel(items, 'lead')[0];
  const keys = weeklyByLevel(items, 'key');
  const briefs = weeklyByLevel(items, 'brief');
  const parts = [];

  // 期号信息行
  const counter = [];
  if (lead) counter.push('头条 1');
  if (keys.length) counter.push('重点 ' + keys.length);
  if (briefs.length) counter.push('简讯 ' + briefs.length);
  parts.push(`<div class="weekly-meta">AI 周刊 Vol.${String(issue.vol).padStart(2, '0')} · ${issue.date || ''}${counter.length ? ' · ' + counter.join(' / ') : ''}</div>`);
  parts.push(`<h2 class="weekly-headline">${issue.headline || ''}</h2>`);
  if (issue.summary) parts.push(`<p class="weekly-lede">${issue.summary}</p>`);

  // 头条
  if (lead) {
    parts.push('<section class="weekly-lead">');
    parts.push(`<div class="weekly-label-row"><span class="weekly-label-lead">头条</span><span class="weekly-label-tag">${lead.tag || ''}</span></div>`);
    if (lead.heading) parts.push(`<h3 class="weekly-lead-title">${lead.heading}</h3>`);
    if (lead.detail) parts.push(`<p class="weekly-lead-detail">${lead.detail}</p>`);
    if (lead.stats && lead.stats.length) {
      parts.push('<div class="weekly-stats">' + lead.stats.map(s => `
        <div class="weekly-stat">
          <div class="weekly-stat-label">${s.label || ''}</div>
          <div class="weekly-stat-value">${s.value || ''}</div>
        </div>`).join('') + '</div>');
    }
    if (lead.comment) parts.push(`<p class="weekly-comment">${lead.comment}</p>`);
    parts.push('</section>');
  }

  // 重点
  if (keys.length) {
    parts.push('<section class="weekly-section">');
    parts.push(`<div class="weekly-section-label">重点 · ${keys.length} 条</div>`);
    keys.forEach(k => {
      parts.push('<div class="weekly-key">');
      if (k.heading) parts.push(`<h3 class="weekly-key-title">${k.heading}</h3>`);
      if (k.detail) parts.push(`<p class="weekly-key-detail">${k.detail}</p>`);
      if (k.comment) parts.push(`<p class="weekly-comment is-key">${k.comment}</p>`);
      parts.push('</div>');
    });
    parts.push('</section>');
  }

  // 简讯
  if (briefs.length) {
    parts.push('<section class="weekly-section">');
    parts.push(`<div class="weekly-section-label">简讯 · ${briefs.length} 条</div>`);
    briefs.forEach(b => {
      parts.push(`
      <div class="weekly-brief">
        <span class="weekly-brief-tag">${weeklyTagShort(b.tag)}</span>
        <div class="weekly-brief-body">
          <div class="weekly-brief-title">${b.heading || ''}</div>
          ${b.detail ? `<div class="weekly-brief-detail">${b.detail}</div>` : ''}
        </div>
      </div>`);
    });
    parts.push('</section>');
  }

  box.innerHTML = parts.join('');
  closeModal('weekly-index');
  openModal('weekly');
}

// ===== 个人展板 - 渲染手账画布 =====
function initGalleryBoard() {
  const board = document.getElementById('galleryBoard');
  if (!board || typeof galleryItems === 'undefined') return;

  board.innerHTML = galleryItems.map(item => {
    const style = `left:${item.x}%; top:${item.y}%; transform:rotate(${item.rotate || 0}deg);`;

    if (item.type === 'photo') {
      return `
        <div class="board-item board-photo" style="${style}">
          <img src="${item.image}" alt="${item.caption || '展品'}">
          ${item.caption ? `<div class="board-caption">${item.caption}</div>` : ''}
        </div>`;
    }

    if (item.type === 'note') {
      return `
        <div class="board-item board-note" style="${style}">
          ${item.title ? `<div class="board-note-title">${item.title}</div>` : ''}
          <div class="board-note-text">${item.text || ''}</div>
        </div>`;
    }

    if (item.type === 'sticker') {
      return `
        <div class="board-item board-sticker" style="${style}">${item.emoji || '✨'}</div>`;
    }

    return '';
  }).join('');
}

// ===== 公园 - 渲染地图标记 =====
function initMapMarkers() {
  const markersContainer = document.getElementById('mapMarkers');
  if (!markersContainer) return;
  
  markersContainer.innerHTML = visitedPlaces.map(place => `
    <div class="map-marker" style="left: ${place.x}%; top: ${place.y}%;">
      <div class="marker-tooltip">📍 ${place.city}</div>
    </div>
  `).join('');
}

// ===== 公园小猫互动 =====
function initCat() {
  const catSprite = document.getElementById('catSprite');
  const catBubble = document.getElementById('catBubble');
  
  if (!catSprite || !catBubble) return;
  
  let isAnimating = false;
  let bubbleTimer = null;
  
  catSprite.addEventListener('click', function(e) {
    // 阻止冒泡，避免触发公园热区
    e.stopPropagation();
    
    if (isAnimating) return;
    isAnimating = true;
    
    // 跳跃动画（视觉反馈）
    catSprite.classList.add('cat-jump');
    
    setTimeout(() => {
      catSprite.classList.remove('cat-jump');
      isAnimating = false;
    }, 500);
    
    // 显示对话气泡
    showCatBubble();
  });
  
  function showCatBubble() {
    // 随机选一条消息
    const randomMsg = catMessages[Math.floor(Math.random() * catMessages.length)];
    catBubble.textContent = randomMsg;
    catBubble.classList.add('show');
    
    // 清除之前的定时器
    if (bubbleTimer) {
      clearTimeout(bubbleTimer);
    }
    
    // 2秒后隐藏
    bubbleTimer = setTimeout(() => {
      catBubble.classList.remove('show');
    }, 2000);
  }
}

// ===== 留言表单 =====
function initMessageForm() {
  const form = document.getElementById('messageForm');
  if (!form) return;
  
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    alert('💌 留言已收到！谢谢你的到访~');
    form.reset();
  });
}

// ===== 响应式：动态调整热区标签字体 =====
// 热区使用百分比定位，天然响应式
// 这里只根据地图尺寸微调标签字体
function adjustBuildingPositions() {
  const cityMap = document.getElementById('cityMap');
  if (!cityMap) return;
  
  const mapWidth = cityMap.offsetWidth;
  const scale = mapWidth / 1200;
  
  const hotspots = document.querySelectorAll('.hotspot');
  hotspots.forEach(hotspot => {
    const label = hotspot.querySelector('.hotspot-label');
    if (label) {
      label.style.fontSize = Math.max(11, 13 * Math.min(scale, 1)) + 'px';
    }
  });
}

// 窗口大小变化时调整
window.addEventListener('resize', adjustBuildingPositions);
window.addEventListener('load', adjustBuildingPositions);
