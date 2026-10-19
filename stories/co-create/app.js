(() => {
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=reduced.matches, lang='zh',time=0,last=0,previousFrame=0,dirty=true;
  const hero=new Sculpture($('#hero-canvas'),{form:1}),story=new Sculpture($('#story-canvas'),{form:0,dark:true}),lab=new Sculpture($('#lab-canvas'),{form:0,dark:true});
  const sculptures=[hero,story,lab];let storyProgress=0;
  function updatePause(){document.body.classList.toggle('is-paused',paused);$('#motion').setAttribute('aria-pressed',String(paused));$('#motion').setAttribute('aria-label',lang==='en'?(paused?'Play motion':'Pause motion'):(paused?'开启动效':'暂停动效'));$('.motion-icon').textContent=paused?'▷':'Ⅱ';dirty=true;}
  $('#motion').addEventListener('click',()=>{paused=!paused;updatePause();});
  reduced.addEventListener('change',e=>{paused=e.matches;updatePause();});updatePause();
  const texts=$$('[data-en]');texts.forEach(el=>{el.dataset.zh=el.innerHTML;});
  const labelPairs=[['#hero-canvas','一座持续变化的银色数字雕塑','A continuously changing silver digital sculpture'],['#story-canvas','由环形展开为交织形体的数字雕塑','A digital sculpture morphing from orbit to entangled form'],['.lab-art','互动雕塑，拖动或按方向键旋转','Interactive sculpture. Drag or use arrow keys to rotate.'],['.lab-tabs','雕塑形态','Sculpture form'],['.material-select','雕塑材质','Sculpture material'],['#reset','重置雕塑视角','Reset sculpture view'],['.dialog-close','关闭详情','Close details'],['.keyboard','迷你琴键演示','Mini piano demo'],['.focus-grid','专注小屋灯窗图案','Focus Nook illuminated window pattern'],['.details-button','了解琴步电子琴','About Piano Steps']];
  $('#language').addEventListener('click',()=>{
    lang=lang==='zh'?'en':'zh';document.documentElement.lang=lang==='zh'?'zh-CN':'en';texts.forEach(el=>{el.innerHTML=el.dataset[lang];});
    $('#language').textContent=lang==='zh'?'EN':'中';$('#language').setAttribute('aria-label',lang==='zh'?'Switch to English':'切换为中文');
    labelPairs.forEach(([s,zh,en])=>$(s).setAttribute('aria-label',lang==='zh'?zh:en));
    $$('.city-project a').forEach(a=>a.setAttribute('aria-label',lang==='en'?"Explore ZOONN's City":'进入 ZOONN 之城'));
    $('.focus-project .project-caption a').setAttribute('aria-label',lang==='en'?'Enter Focus Nook':'进入专注小屋');
    $('#contact-status').textContent='';updatePause();scrollState();
  });
  const observed=new IntersectionObserver(entries=>{entries.forEach(e=>{const sc=sculptures.find(s=>s.canvas===e.target);if(sc){sc.live=e.isIntersecting;dirty=true;}});},{rootMargin:'120px'});sculptures.forEach(s=>observed.observe(s.canvas));
  function scrollState(){
    const box=$('#story').getBoundingClientRect(),range=Math.max(1,box.height-innerHeight);
    storyProgress=Math.max(0,Math.min(1,-box.top/range));story.targetForm=storyProgress*1.85;
    const heroBox=$('#top').getBoundingClientRect();hero.targetForm=1-Math.max(0,Math.min(1,-heroBox.top/heroBox.height));
    $('#story-progress').style.width=(storyProgress*100)+'%';
    $('#dialogue-word').textContent=storyProgress<.32?'a question':storyProgress<.67?'a conversation':'a possibility';
    dirty=true;
  }
  addEventListener('scroll',scrollState,{passive:true});addEventListener('resize',scrollState);scrollState();
  addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;hero.pointerX=e.clientX/innerWidth-.5;hero.pointerY=e.clientY/innerHeight-.5;story.pointerX=hero.pointerX;story.pointerY=hero.pointerY;dirty=true;},{passive:true});
  const revealObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('pending');revealObserver.unobserve(e.target);}}),{threshold:.08});
  if(!reduced.matches){document.body.classList.add('js-motion');$$('.work-heading,.project,.in-progress,.lab-heading,.about-grid,.contact').forEach(el=>{el.classList.add('reveal','pending');revealObserver.observe(el);});}
  $$('.lab-tabs button').forEach(button=>button.addEventListener('click',()=>{lab.targetForm=Number(button.dataset.form);$$('.lab-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#art-index').textContent='OBJECT / 0'+(lab.targetForm+1);$('#lab-status').textContent=(lang==='en'?'Selected: ':'已选择：')+button.textContent.trim();dirty=true;}));
  $$('.material-select button').forEach(button=>button.addEventListener('click',()=>{lab.targetMaterial=Number(button.dataset.material);$$('.material-select button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#lab-status').textContent=(lang==='en'?'Material: ':'材质：')+button.textContent.trim();dirty=true;}));
  $('#energy').addEventListener('input',e=>{lab.energy=Number(e.target.value)/100;$('#energy-value').value=e.target.value+'%';dirty=true;});
  $('#reset').addEventListener('click',()=>{lab.dragX=0;lab.dragY=0;lab.pointerX=0;lab.pointerY=0;lab.yaw=0;lab.pitch=.65;dirty=true;$('#lab-status').textContent=lang==='en'?'View reset.':'视角已重置。';});
  let drag=null;
  const labCanvas=$('#lab-canvas');
  labCanvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,touch:e.pointerType==='touch',active:e.pointerType!=='touch'};if(drag.active)labCanvas.setPointerCapture(e.pointerId);});
  labCanvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(drag.touch&&!drag.active){if(Math.abs(e.clientX-drag.startX)>Math.abs(e.clientY-drag.startY)+6){drag.active=true;labCanvas.setPointerCapture(e.pointerId);}else return;}lab.dragX+=(e.clientX-drag.x)*.009;lab.dragY=Math.max(-1.8,Math.min(1.8,lab.dragY+(e.clientY-drag.y)*.007));drag.x=e.clientX;drag.y=e.clientY;dirty=true;});
  const stopDrag=()=>{drag=null;};labCanvas.addEventListener('pointerup',stopDrag);labCanvas.addEventListener('pointercancel',stopDrag);labCanvas.addEventListener('lostpointercapture',stopDrag);
  $('.lab-art').addEventListener('keydown',e=>{if(e.target!==$('.lab-art'))return;const delta={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]}[e.key];if(delta){e.preventDefault();lab.dragX+=delta[0];lab.dragY=Math.max(-1.8,Math.min(1.8,lab.dragY+delta[1]));dirty=true;}});
  let audio;
  $$('.keyboard button').forEach((button,index)=>{button.addEventListener('click',async()=>{
    button.classList.add('playing');setTimeout(()=>button.classList.remove('playing'),220);$('#note-display').textContent=['C','D','E','F','G','A','B'][index];$('#note-display').style.transform='translateY(-12px)';setTimeout(()=>$('#note-display').style.transform='',200);
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audio??=new Audio();if(audio.state==='suspended')await audio.resume();const now=audio.currentTime;
      [1,2,3].forEach((multiple,i)=>{const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=Number(button.dataset.note)*multiple;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.15/(i+1)**2,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+1.4);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+1.45);});
    }catch(e){$('#note-display').textContent='♪';}
  });});
  const dialog=$('#project-dialog');$('.details-button').addEventListener('click',()=>dialog.showModal());$('.dialog-close').addEventListener('click',()=>dialog.close());$('.dialog-done').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  $('#wechat').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('zningnin123456789');$('#contact-status').textContent=lang==='en'?'WeChat ID copied.':'微信号已复制。';}catch(e){$('#contact-status').textContent=(lang==='en'?'WeChat: ':'微信号：')+'zningnin123456789';}});
  document.addEventListener('visibilitychange',()=>{last=0;dirty=true;if(document.hidden&&audio?.state==='running')audio.suspend().catch(()=>{});});
  function frame(stamp){requestAnimationFrame(frame);if(document.hidden){last=0;return;}const dt=last?Math.min(.05,(stamp-last)/1000):0;last=stamp;if(!paused)time+=dt;
    if(stamp-previousFrame<(innerWidth<650?1000/30:1000/50))return;
    previousFrame=stamp;if(paused&&!dirty)return;
    sculptures.forEach(s=>s.draw(time,paused));dirty=false;
  }
  requestAnimationFrame(frame);
})();
