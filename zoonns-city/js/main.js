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
  initMapMarkers();
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
  
  list.innerHTML = articles.map(article => `
    <div class="article-card">
      <div class="article-title">${article.title}</div>
      <div class="article-summary">${article.summary}</div>
      <div class="article-date">${article.date}</div>
    </div>
  `).join('');
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
  
  rack.innerHTML = magazines.map((mag, index) => `
    <div class="magazine-card" data-mag-index="${index}">
      <div class="magazine-cover">${mag.emoji || '📖'}</div>
      <div class="magazine-info">
        <div class="magazine-title">${mag.title}</div>
        <div class="magazine-desc">${mag.summary}</div>
      </div>
    </div>
  `).join('');
  
  // 点击杂志打开详情
  const cards = document.querySelectorAll('.magazine-card');
  cards.forEach(card => {
    card.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-mag-index'));
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
