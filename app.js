import {createScene} from './scene.js?v=chart-controls-6';
import {sampleAt,formatLap,formatClock,recordAt,rankDrivers,speedWindow,zoomSpeedWindow} from './model.js?v=chart-zoom-1';
const d3=window.d3;
const state={t:0,playing:false,rate:1,loop:true,selected:81,autoRotate:false,following:false,phase:'ready',countdown:3};
let data,scene,drivers,maxTime,chartX,chartY,cursor,cursorDots,positionX,positionCursor,lastFrame=0,lastUI=0,chartWidth=0,windowStart=-1;
const $=s=>document.querySelector(s),formatNumber=d3.format(',');
const speedView={duration:120,manualStart:null,visible:new Set([16,81,4])};
const visibleDrivers=()=>drivers.filter(d=>speedView.visible.has(d.driver_number));
const selected=()=>drivers.find(d=>d.driver_number===state.selected);
const beforeStart=()=>['ready','countdown'].includes(state.phase);
const lapFor=d=>beforeStart()?0:(recordAt(d.laps,state.t)?.lap_number??1);
const eventKind=e=>e?.kind==='overtake'?'首圈超車':e?.kind==='pit-window'?'進站前後':'名次變化';
function notify(text){$('#announcement').textContent=text}
function renderCameraHints(){
  $('#focus-driver').hidden=state.following;
  const pan=$('#drag-pan').getAttribute('aria-pressed')==='true';
  $('#drag-hint').textContent=state.following?(pan?'跟隨中 · 滾輪縮放 · 拖曳平移解除跟隨':'跟隨中 · 拖曳旋轉 · 滾輪縮放'):(pan?'拖曳：上下左右平移 · 滾輪縮放':'拖曳：旋轉視角 · 滾輪縮放');
  const lap=beforeStart()?0:recordAt(data.race_laps,state.t)?.lap_number??1;
  $('.scene-mode').textContent=(state.following?'FOLLOWING '+selected().name_acronym:'RACE')+' · LAP '+String(lap).padStart(2,'0')+' / 53';
  $('.camera-help').textContent=state.following?'鏡頭跟隨車手 · 保留倍率與角度':'放大後，拖曳即可移動畫面';
}
function syncFollowing(value){state.following=value;$('#follow-driver').setAttribute('aria-pressed',String(value));renderCameraHints()}
function setPlaying(value){
  if(value&&state.phase==='ready'){state.phase='countdown';state.countdown=3}
  state.playing=value;$('#play').setAttribute('aria-label',value?'暫停':'播放');$('#play .play-icon').textContent=value?'Ⅱ':'▶';$('#play .play-text').textContent=value?'暫停':'播放';document.documentElement.dataset.playing=String(value);
}
function resetRace(){state.t=0;state.phase='ready';state.countdown=3;setPlaying(false);renderMetrics();updateChartCursor();notify('比賽已重置，按播放倒數三秒後起跑')}
function seek(value){
  state.t=Math.max(0,Math.min(maxTime,+value));state.phase=state.t===0?'ready':state.t>=maxTime?'finished':'racing';state.countdown=3;
  if(state.t===0&&state.playing)setPlaying(true);if(state.t>=maxTime)setPlaying(false);
  renderMetrics();updateChartCursor();
}
function selectDriver(number){
  state.selected=number;const d=selected(),color='#'+d.display_colour;
  document.documentElement.style.setProperty('--accent',color);
  d3.selectAll('.driver-row').attr('aria-pressed',r=>String(r.driver_number===number));
  $('#driver-detail').style.setProperty('--driver',color);$('#driver-team').textContent=d.team_name;$('#driver-name').textContent=d.full_name;$('#driver-number').textContent=String(d.driver_number).padStart(2,'0');$('#scene-selected').textContent=d.name_acronym;
  d3.selectAll('.speed-path,.position-path').classed('is-selected',r=>r.driver_number===number);
  scene?.select(number);renderMetrics();renderCameraHints();notify('已選取 '+d.full_name);document.documentElement.dataset.selectedDriver=number;
}
function gapFor(d){
  if(beforeStart())return '起跑前';
  if(state.t>=d.finish_t)return d.result.position===1?'WINNER':'+'+d.result.gap_to_leader.toFixed(3)+'s';
  const position=recordAt(d.positions,state.t),gap=recordAt(d.intervals,state.t);
  if(position?.position===1)return 'LEADER';
  if(!gap||state.t-gap.t>15||gap.t<position.t||gap.gap_to_leader===null)return '—';
  return typeof gap.gap_to_leader==='number'?'+'+gap.gap_to_leader.toFixed(3)+'s':gap.gap_to_leader;
}
function renderMetrics(){
  if(!drivers)return;const d=selected(),s=sampleAt(d.samples,state.t),ready=beforeStart(),done=state.t>=d.finish_t;
  $('#current-speed').textContent=done?'—':Math.round(s.speed);$('#throttle-value').textContent=(done?'—':Math.round(Math.max(0,Math.min(100,s.throttle)))+'%');$('#throttle-meter').style.width=(done?0:Math.max(0,Math.min(100,s.throttle)))+'%';$('#brake-value').textContent=done?'—':s.brake?'ON':'OFF';$('#brake-meter').style.width=!done&&s.brake?'100%':'0%';$('#gear-value').textContent=done?'—':s.gear===0?'N':s.gear;$('#rpm-value').textContent=done?'—':formatNumber(Math.round(s.rpm));$('#drs-value').textContent=done?'—':[10,12,14].includes(s.drs)?'開啟':'關閉';$('#drs-value').style.color=!done&&[10,12,14].includes(s.drs)?'#65cbb0':'#8e9fb5';
  $('#lap-state').textContent=done?'已完賽 · 終點停駐':state.phase==='ready'?'等待起跑':state.phase==='countdown'?'起跑倒數':state.playing?'正賽播放中':'已暫停';
  $('#lap-number').textContent=ready?'起跑前':`當前圈 ${lapFor(d)} / 53`;
  $('#lap-time').textContent='P'+recordAt(d.positions,state.t).position;$('#lap-gap').textContent=gapFor(d);$('#lap-gap').title='距領先車手的最新已知差距';
  $('#elapsed').textContent=formatClock(state.t);$('#timeline').value=state.t;$('#timeline').style.setProperty('--progress',(state.t/maxTime*100)+'%');
  const countdown=$('#start-countdown');countdown.hidden=!ready;countdown.dataset.phase=state.phase;countdown.querySelector('strong').textContent=state.phase==='countdown'?Math.ceil(state.countdown):'READY';countdown.querySelector('span').textContent=state.phase==='countdown'?(state.playing?'起跑倒數':'倒數已暫停'):'按播放 · 倒數 3 秒起跑';
  document.documentElement.dataset.elapsed=state.t.toFixed(3);document.documentElement.dataset.phase=state.phase;
  const latest=recordAt(data.events,state.t);$('#event-kind').textContent=ready?'STARTING GRID':latest?eventKind(latest):'RACE START';$('#event-reading').textContent=ready?'等待發車 · 三台車位於起跑位置':latest?`${formatClock(latest.t)} · LAP ${latest.lap_number} · ${latest.label}`:'正賽起跑';
  const raceLap=ready?1:recordAt(data.race_laps,state.t)?.lap_number??1;if(document.activeElement!==$('#lap-jump'))$('#lap-jump').value=String(raceLap);
  renderRanking();renderCameraHints();
}
function buildDriverList(){
  const buttons=d3.select('#driver-list').selectAll('button').data(drivers,d=>d.driver_number).join('button').attr('class','driver-row').attr('data-driver',d=>d.driver_number).style('--driver',d=>'#'+d.display_colour).on('click',(_,d)=>selectDriver(d.driver_number));
  buttons.html(d=>`<span class="number" title="當時全場名次">—</span><span><span class="name">${d.full_name}</span><span class="team">#${String(d.driver_number).padStart(2,'0')} · ${d.team_name}</span><span class="driver-lap">起跑前 · 0 / 53 圈</span></span><span class="times"><span class="time" title="距領先車手的最新差距">—</span><span class="delta">完賽 P${d.result.position}</span></span>`);
}
function renderRanking(){
  const ranking=rankDrivers(drivers,state.t),byNumber=new Map(ranking.map(r=>[r.driver.driver_number,r]));
  const rows=d3.select('#driver-list').selectAll('button').data(ranking.map(r=>r.driver),d=>d.driver_number).order();
  rows.attr('data-rank',d=>byNumber.get(d.driver_number).rank).attr('data-lap',d=>lapFor(d)).attr('aria-label',d=>`當時全場第 ${byNumber.get(d.driver_number).rank} 名，查看 ${d.full_name} 資料`);
  rows.select('.number').text(d=>'P'+byNumber.get(d.driver_number).rank);rows.select('.time').text(gapFor);
  rows.select('.driver-lap').text(d=>beforeStart()?'起跑前 · 0 / 53 圈':state.t>=d.finish_t?'已完賽 · 53 / 53 圈':`當前圈 ${lapFor(d)} / 53`);
}
function currentSpeedWindow(){return speedWindow(state.t,maxTime,speedView.duration,speedView.manualStart)}
function browseSpeedWindow(start){
  speedView.manualStart=speedWindow(state.t,maxTime,speedView.duration,start)[0];
  $('#chart-tooltip').hidden=true;updateChartCursor();
}
function bindSpeedControls(){
  d3.select('#speed-series').selectAll('label').data(drivers).join('label').style('--driver',d=>'#'+d.display_colour)
    .html(d=>`<input type="checkbox" value="${d.driver_number}" checked aria-label="顯示 ${d.full_name} 車速曲線"><span>${d.name_acronym}</span>`)
    .select('input').on('change',(e,d)=>{e.target.checked?speedView.visible.add(d.driver_number):speedView.visible.delete(d.driver_number);chartWidth=0;$('#chart-tooltip').hidden=true;updateChartCursor()});
  $('#speed-follow').addEventListener('change',e=>{
    speedView.manualStart=e.target.checked?null:currentSpeedWindow()[0];chartWidth=0;updateChartCursor();
  });
  $('#speed-browse').addEventListener('input',e=>browseSpeedWindow(+e.target.value));
  // Capture on the stable SVG root: child paths/overlay are rebuilt while panning.
  const svg=$('#speed-chart');let drag=null,suppressClick=false;
  const inPlot=e=>{const [x,y]=d3.pointer(e,svg);return x>=42&&x<=chartWidth-20&&y>=18&&y<=191};
  svg.addEventListener('wheel',e=>{
    if(!inPlot(e))return;
    e.preventDefault();if(drag||e.deltaY===0)return;
    const [start,end]=currentSpeedWindow(),fraction=(d3.pointer(e,svg)[0]-42)/(chartWidth-62);
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);
    const [nextStart,nextEnd]=zoomSpeedWindow(start,end,maxTime,fraction,Math.exp(Math.max(-500,Math.min(500,delta))*.002));
    speedView.duration=nextEnd-nextStart>=maxTime-1e-7?'all':nextEnd-nextStart;
    chartWidth=0;browseSpeedWindow(nextStart);
  },{passive:false});
  svg.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0||!inPlot(e))return;
    suppressClick=false;const [start,end]=currentSpeedWindow();
    drag={id:e.pointerId,x:e.clientX,start,secondsPerPixel:(end-start)/(chartWidth-62)*chartWidth/svg.getBoundingClientRect().width};
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId||speedView.duration==='all')return;
    const dx=e.clientX-drag.x;if(!suppressClick&&Math.abs(dx)<5)return;
    suppressClick=true;svg.classList.add('is-panning');browseSpeedWindow(drag.start-dx*drag.secondsPerPixel);
  });
  function endDrag(e){if(!drag||drag.id!==e.pointerId)return;drag=null;svg.classList.remove('is-panning');if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)}
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);svg.addEventListener('lostpointercapture',endDrag);
  svg.addEventListener('click',e=>{if(suppressClick){suppressClick=false;return}if(!inPlot(e))return;setPlaying(false);seek(chartX.invert(d3.pointer(e,svg)[0]))});
  $('#speed-window').addEventListener('change',e=>{if(e.target.value==='custom')return;speedView.duration=e.target.value==='all'?'all':+e.target.value;chartWidth=0;$('#chart-tooltip').hidden=true;updateChartCursor()});
}
function buildSpeedChart(){
  const chart=d3.select('#speed-chart'),width=Math.max(300,Math.round(chart.node().clientWidth)),[start,end]=currentSpeedWindow();
  const following=speedView.manualStart===null,seconds=end-start;
  const custom=$('#speed-window-custom'),preset=speedView.duration==='all'?'all':[30,60,120,300,600].find(n=>Math.abs(n-seconds)<1e-7);
  custom.hidden=preset!==undefined;custom.textContent='自訂 · '+seconds.toFixed(1)+' 秒';
  $('#speed-window').value=preset!==undefined?String(preset):'custom';
  $('#speed-duration').textContent=seconds.toFixed(1)+' 秒';
  $('#speed-follow').checked=following;
  $('#speed-chart').dataset.browsing=following?'following':'manual';
  $('#speed-chart').dataset.fullRace=String(speedView.duration==='all');
  $('#speed-browse').max=maxTime-(end-start);$('#speed-browse').value=start;$('#speed-browse').disabled=speedView.duration==='all';
  $('#speed-browse').setAttribute('aria-valuetext',formatClock(start)+' 至 '+formatClock(end));
  $('#speed-view-status').textContent=speedView.duration==='all'?'整場總覽 · 點圖跳轉':following?'跟隨播放 · 左右拖圖可固定區段':'自由瀏覽 · 區段已固定，點圖可跳轉';
  if(chartWidth===width&&windowStart===start)return;chartWidth=width;windowStart=start;
  $('#speed-range').textContent=formatClock(start)+' – '+formatClock(end);
  chart.attr('data-window-start',start).attr('data-window-end',end);
  chart.attr('viewBox',`0 0 ${width} 230`).selectAll('*').remove();chartX=d3.scaleLinear().domain([start,end]).range([42,width-20]);chartY=d3.scaleLinear().domain([0,360]).range([191,18]);
  chart.append('g').attr('class','chart-grid').attr('transform','translate(42,0)').call(d3.axisLeft(chartY).tickValues([100,200,300]).tickSize(-(width-62)).tickFormat(''));
  chart.append('g').attr('class','axis').attr('transform','translate(0,191)').call(d3.axisBottom(chartX).ticks(width<500?3:6).tickFormat(d=>end>=3600?formatClock(d):formatClock(d).slice(3)).tickSize(0).tickPadding(12));
  chart.append('g').attr('class','axis').attr('transform','translate(42,0)').call(d3.axisLeft(chartY).tickValues([0,100,200,300]).tickSize(0).tickPadding(9));chart.append('text').attr('class','axis-title').attr('x',7).attr('y',10).text('km/h');
  const line=d3.line().x(d=>chartX(d.t)).y(d=>chartY(d.speed));
  chart.append('g').selectAll('path').data(visibleDrivers()).join('path').attr('class','speed-path').classed('is-selected',d=>d.driver_number===state.selected).attr('stroke',d=>'#'+d.display_colour).attr('d',d=>line(d.samples.filter(s=>s.t>=start&&s.t<=end)));
  if(!speedView.visible.size)chart.append('text').attr('class','chart-empty').attr('x',(width+42)/2).attr('y',100).attr('text-anchor','middle').text('勾選車手以顯示車速曲線');
  cursor=chart.append('line').attr('class','chart-cursor').attr('y1',18).attr('y2',191);cursorDots=chart.append('g').selectAll('circle').data(visibleDrivers()).join('circle').attr('r',3.5).attr('fill',d=>'#'+d.display_colour).attr('stroke','#0b1018').attr('stroke-width',1);
  chart.append('rect').attr('class','chart-overlay').attr('x',42).attr('y',18).attr('width',width-62).attr('height',173).on('pointermove',e=>{
    if(e.buttons){$('#chart-tooltip').hidden=true;return}
    const t=Math.max(start,Math.min(end,chartX.invert(d3.pointer(e,chart.node())[0]))),panel=$('.speed-panel').getBoundingClientRect(),visible=visibleDrivers();
    if(!visible.length){$('#chart-tooltip').hidden=true;return}
    const tip=$('#chart-tooltip');tip.hidden=false;tip.textContent=formatClock(t)+'\n'+visible.map(d=>`${d.name_acronym} · ${Math.round(sampleAt(d.samples,t).speed)} km/h`).join('\n');tip.style.left=Math.max(0,Math.min(e.clientX-panel.left+12,panel.width-265))+'px';tip.style.top=Math.max(40,e.clientY-panel.top-34)+'px';
  }).on('pointerleave',()=>{$('#chart-tooltip').hidden=true});
}
function buildPositionChart(){
  const chart=d3.select('#position-chart'),width=330;chart.selectAll('*').remove();
  positionX=d3.scaleLinear().domain([0,maxTime]).range([32,width-14]);const y=d3.scaleLinear().domain([1,d3.max(drivers.flatMap(d=>d.positions),r=>r.position)]).range([22,188]);
  chart.append('g').attr('class','chart-grid').attr('transform','translate(32,0)').call(d3.axisLeft(y).tickValues([1,3,5,7,9]).tickSize(-(width-46)).tickFormat(''));
  chart.append('g').attr('class','axis').attr('transform','translate(32,0)').call(d3.axisLeft(y).tickValues([1,3,5,7,9]).tickFormat(d=>'P'+d).tickSize(0).tickPadding(6));
  chart.append('g').attr('class','axis').attr('transform','translate(0,188)').call(d3.axisBottom(positionX).tickValues([0,900,1800,2700,3600,4487]).tickFormat(d=>Math.round(d/60)).tickSize(0).tickPadding(12));chart.append('text').attr('class','axis-title').attr('x',300).attr('y',225).text('min');
  const line=d3.line().curve(d3.curveStepAfter).x(d=>positionX(d.t)).y(d=>y(d.position));
  chart.selectAll('.position-path').data(drivers).join('path').attr('class','position-path').attr('stroke',d=>'#'+d.display_colour).attr('d',d=>line([...d.positions,{t:maxTime,position:d.positions.at(-1).position}]));
  positionCursor=chart.append('line').attr('class','chart-cursor').attr('y1',15).attr('y2',188);
  chart.append('rect').attr('class','chart-overlay').attr('x',32).attr('y',15).attr('width',width-46).attr('height',173).on('click',e=>{setPlaying(false);seek(positionX.invert(d3.pointer(e,chart.node())[0]))}).on('pointermove',e=>{const t=positionX.invert(d3.pointer(e,chart.node())[0]);$('#position-reading').textContent=formatClock(t)+' · '+rankDrivers(drivers,t).map(r=>r.driver.name_acronym+' P'+r.rank).join(' / ')}).on('pointerleave',()=>{$('#position-reading').textContent='點圖跳轉 · 名次亦受進站影響'});
  $('#position-legend').innerHTML=drivers.map(d=>`<span style="color:#${d.display_colour}">${d.name_acronym}</span>`).join(' ');
}
function updateChartCursor(){buildSpeedChart();if(!cursor)return;const [start,end]=chartX.domain(),inView=state.t>=start&&state.t<=end;cursor.style('display',inView?null:'none');cursorDots.style('display',inView?null:'none');cursor.attr('x1',chartX(state.t)).attr('x2',chartX(state.t));cursorDots.attr('cx',chartX(state.t)).attr('cy',d=>chartY(sampleAt(d.samples,state.t).speed)).attr('r',d=>d.driver_number===state.selected?4.3:2.7);positionCursor?.attr('x1',positionX(state.t)).attr('x2',positionX(state.t));}
function bindRaceControls(){
  d3.select('#lap-jump').selectAll('option').data(data.race_laps).join('option').attr('value',d=>d.lap_number).text(d=>'LAP '+String(d.lap_number).padStart(2,'0'));
  $('#lap-jump').addEventListener('change',e=>seek(data.race_laps.find(r=>r.lap_number===+e.target.value).t));
  d3.select('#event-jump').selectAll('option.event').data(data.events).join('option').attr('class','event').attr('value',(_,i)=>i).text(d=>`L${d.lap_number} · ${formatClock(d.t)} · ${d.label} · ${eventKind(d)}`);
  $('#event-jump').addEventListener('change',e=>{if(e.target.value==='')return;const event=data.events[+e.target.value];selectDriver(event.driver_number);seek(Math.max(0,event.t-6));setPlaying(true);e.target.value=''});
  $('#opening-battle').addEventListener('click',()=>{selectDriver(81);seek(data.events.find(e=>e.kind==='overtake'&&e.driver_number===81).t-10);setPlaying(true);scene.setFollowing(true,state.t);notify('播放首圈超車前十秒，鏡頭跟隨 Piastri')});
}
function bindControls(){
  $('#play').addEventListener('click',()=>{if(state.t>=maxTime)resetRace();setPlaying(!state.playing);renderMetrics()});
  $('#restart').addEventListener('click',resetRace);
  $('#timeline').max=maxTime;$('#timeline').addEventListener('input',e=>{seek(e.target.value)});
  $('#rate').addEventListener('change',e=>{state.rate=+e.target.value});
  $('#loop').addEventListener('click',()=>{state.loop=!state.loop;$('#loop').setAttribute('aria-pressed',String(state.loop))});
  function view(mode){scene.reset(mode);$('#view-perspective').setAttribute('aria-pressed',String(mode==='perspective'));$('#view-top').setAttribute('aria-pressed',String(mode==='top'));}
  $('#view-perspective').addEventListener('click',()=>view('perspective'));$('#view-top').addEventListener('click',()=>view('top'));$('#reset-camera').addEventListener('click',()=>{state.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false');scene.setAutoRotate(false);view('perspective')});
  $('#auto-rotate').addEventListener('click',()=>{state.autoRotate=!state.autoRotate;$('#auto-rotate').setAttribute('aria-pressed',String(state.autoRotate));scene.setAutoRotate(state.autoRotate)});
  function interaction(mode){
    scene.setInteractionMode(mode);$('#drag-pan').setAttribute('aria-pressed',String(mode==='pan'));$('#drag-rotate').setAttribute('aria-pressed',String(mode==='rotate'));
    renderCameraHints();
    $('#scene').setAttribute('aria-label',`3D 賽道回放，拖曳及方向鍵${mode==='pan'?'上下左右平移':'旋轉視角'}，滾輪或加減鍵縮放。點車輛或車手標籤選取。`);
  }
  $('#drag-pan').addEventListener('click',()=>interaction('pan'));$('#drag-rotate').addEventListener('click',()=>interaction('rotate'));
  $('#focus-driver').addEventListener('click',()=>{state.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false');scene.setAutoRotate(false);scene.focusSelected(state.t);document.querySelectorAll('#view-perspective,#view-top').forEach(b=>b.setAttribute('aria-pressed','false'));notify(state.following?'持續跟隨 '+selected().full_name+'，已保持對準與原有視角':'已對準 '+selected().full_name+'，保留目前縮放比例')});
  $('#follow-driver').addEventListener('click',()=>{state.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false');scene.setAutoRotate(false);scene.setFollowing(!state.following,state.t);document.querySelectorAll('#view-perspective,#view-top').forEach(b=>b.setAttribute('aria-pressed','false'));notify(state.following?'鏡頭開始跟隨 '+selected().full_name:'已停止跟隨車手')});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','INPUT','SELECT','A','SUMMARY'].includes(e.target.tagName)){e.preventDefault();setPlaying(!state.playing)}if(e.key==='Escape')setPlaying(false)});
  document.addEventListener('visibilitychange',()=>{lastFrame=0});
}
function frame(now){
  const delta=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
  if(state.playing&&!document.hidden){
    if(state.phase==='countdown'){state.countdown=Math.max(0,state.countdown-delta);if(state.countdown===0){state.phase='racing';notify('起跑')}}
    else{state.t+=delta*state.rate;if(state.t>=maxTime){if(state.loop){state.t=0;state.phase='countdown';state.countdown=3}else{state.t=maxTime;state.phase='finished';setPlaying(false)}}}
  }
  scene.update(state.t,delta,state.phase);if(now-lastUI>40){renderMetrics();updateChartCursor();lastUI=now}requestAnimationFrame(frame);
}
async function init(){try{
  data=await d3.json('data/race.json');drivers=data.drivers.map(d=>({...d,display_colour:({16:'FF6678',4:'FF9B42',81:'AFA2FF'})[d.driver_number]||d.team_colour}));data.drivers=drivers;maxTime=data.duration;
  $('#session-best').textContent=formatClock(drivers[0].result.duration);$('#session-best-driver').textContent=drivers[0].full_name;$('#session-max').innerHTML=Math.round(d3.max(drivers.flatMap(d=>d.samples),s=>s.speed))+'<em>km/h</em>';$('#total-time').textContent=formatClock(maxTime);
  buildDriverList();bindSpeedControls();buildSpeedChart();buildPositionChart();new ResizeObserver(()=>{chartWidth=0;buildSpeedChart()}).observe($('#speed-chart'));
  scene=createScene(data,selectDriver,()=>{state.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false')},syncFollowing);bindControls();bindRaceControls();selectDriver(state.selected);seek(0);setPlaying(false);scene.setFollowing(true,0);document.querySelectorAll('#view-perspective,#view-top').forEach(b=>b.setAttribute('aria-pressed','false'));$('#loading').remove();document.documentElement.dataset.ready='true';requestAnimationFrame(frame);
}catch(error){console.error(error);$('#loading').textContent='3D 圖表無法載入。請使用支援 WebGL 的瀏覽器重新整理；資料來源與啟動方式見專案 README。';document.documentElement.dataset.error=error.message;}}
init();
