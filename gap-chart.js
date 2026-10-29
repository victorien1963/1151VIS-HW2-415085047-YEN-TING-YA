import {buildGapSeries} from './gap-model.js';
import {pitStopsFor} from './pits.js';
import {formatClock,formatLap} from './model.js';
const d3=window.d3,$=s=>document.querySelector(s);
const gapLabel=v=>v===null?'缺少圈次資料':Math.abs(v)<.05?'基準 · 0.0 秒':`${v<0?'領先':'落後'}約 ${Math.abs(v).toFixed(1)} 秒`;
export function createGapChart({drivers,onSelectLap,onSelectRange,onPitSelect}){
  const series=buildGapSeries(drivers,16),reference=series.find(s=>s.driver_number===16);
  const stops=series.flatMap(s=>pitStopsFor(s.driver).map((p,i)=>({...p,driver:s.driver,point:s.points.find(v=>v.lap_number===p.lap_number),id:`${s.driver_number}-${i}`}))).filter(p=>Number.isFinite(p.point?.gap));
  const svg=$('#gap-chart'),chart=d3.select(svg),panel=$('.gap-panel');
  let width=0,x,y,cursor,hoverLine,selectionRect,drag=null,range=null,selectedLap=1,lastTime=0,lastDriver=81;
  const height=244,left=75,right=32,top=27,bottom=204;
  function showReading(lap){
    $('#gap-reading-lap').textContent=`第 ${lap} 圈結束時`;
    d3.select('#gap-readings').selectAll('.gap-reading').data(series).join('div').attr('class','gap-reading').style('--driver',s=>'#'+s.driver.display_colour).html(s=>{
      const p=s.points.find(p=>p.lap_number===lap),pit=stops.some(v=>v.driver.driver_number===s.driver_number&&v.lap_number===lap);
      const pitOut=s.driver.laps.find(l=>l.lap_number===lap)?.is_pit_out_lap;
      const official=lap===53&&Number.isFinite(p?.official_gap)?` · 官方完賽 ${s.driver_number===16?'冠軍':'+'+p.official_gap.toFixed(3)+' 秒'}`:'';
      return `<b>${s.driver.name_acronym}</b><span>${gapLabel(p?.gap??null)}</span><small>圈速 ${p?.lap_duration?formatLap(p.lap_duration):'—'}${pit?' · 進站圈':pitOut?' · 出站圈':''}${official}</small>`;
    });
  }
  function drawSelection(){if(!selectionRect)return;selectionRect.attr('display',range?null:'none');if(range)selectionRect.attr('x',x(Math.max(0,range[0]-.5))).attr('width',x(Math.min(53,range[1]+.5))-x(Math.max(0,range[0]-.5)))}
  function showLap(lap){selectedLap=Math.max(1,Math.min(53,Math.round(lap)));showReading(selectedLap)}
  function selectLap(lap){showLap(lap);range=[selectedLap,selectedLap];drawSelection();onSelectLap(selectedLap)}
  function choosePit(p){range=[p.lap_number,p.lap_number];drawSelection();showLap(p.lap_number);$('#gap-tooltip').hidden=true;onPitSelect(p.driver,p)}
  function tooltip(e,p){const tip=$('#gap-tooltip'),box=panel.getBoundingClientRect();tip.hidden=false;tip.textContent=`${p.driver.name_acronym} · 第 ${p.lap_number} 圈進站 → ${p.lap_number+1} 圈出站\n約 ${formatClock(p.entry_t)}–${formatClock(p.exit_t)}\n維修區通行約 ${p.lane_duration.toFixed(1)} 秒（含行駛與停車）\n點擊定位進站前 8 秒`;tip.style.left=Math.max(4,Math.min(box.width-290,e.clientX-box.left+12))+'px';tip.style.top=Math.max(45,e.clientY-box.top-115)+'px'}
  function build(){
    width=Math.max(300,Math.round(svg.clientWidth));chart.attr('viewBox',`0 0 ${width} ${height}`).selectAll('*').remove();
    x=d3.scaleLinear().domain([0,53]).range([left,width-right]);
    const extent=d3.extent(series.flatMap(s=>s.points.map(p=>p.gap)).filter(Number.isFinite));y=d3.scaleLinear().domain([Math.min(-5,extent[0]-4),Math.max(5,extent[1]+4)]).nice().range([top,bottom]);
    chart.append('g').attr('class','chart-grid').attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width-left-right)).tickFormat(''));
    chart.append('g').attr('class','axis gap-axis').attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(10).tickFormat(n=>n===0?'0 秒':Math.abs(n)+' 秒'));
    chart.append('g').attr('class','axis').attr('transform',`translate(0,${bottom})`).call(d3.axisBottom(x).tickValues(width<600?[1,10,20,30,40,53]:[1,5,10,15,20,25,30,35,40,45,50,53]).tickSize(0).tickPadding(12));
    chart.append('text').attr('class','axis-title').attr('x',width-12).attr('y',height-8).attr('text-anchor','end').text('圈');
    chart.append('text').attr('class','gap-direction').attr('x',left).attr('y',12).text('↑ 領先 Leclerc');chart.append('text').attr('class','gap-direction').attr('x',left).attr('y',height-4).text('↓ 落後 Leclerc');
    selectionRect=chart.append('rect').attr('class','gap-selection').attr('y',top).attr('height',bottom-top).attr('display','none');
    chart.append('line').attr('class','gap-zero').attr('x1',x(0)).attr('x2',x(53)).attr('y1',y(0)).attr('y2',y(0));
    const line=d3.line().defined(p=>Number.isFinite(p.gap)).x(p=>x(p.lap_number)).y(p=>y(p.gap));
    chart.selectAll('.gap-path').data(series).join('path').attr('class','gap-path').attr('stroke',s=>'#'+s.driver.display_colour).attr('d',s=>line(s.points));
    hoverLine=chart.append('line').attr('class','gap-hover-line').attr('y1',top).attr('y2',bottom).attr('display','none');cursor=chart.append('line').attr('class','chart-cursor gap-cursor').attr('y1',top).attr('y2',bottom);
    const markers=chart.append('g').selectAll('g').data(stops).join('g').attr('class','pit-marker').attr('data-pit-id',p=>p.id).attr('transform',p=>`translate(${x(p.lap_number)},${y(p.point.gap)})`).attr('tabindex',0).attr('role','button').attr('aria-label',p=>`${p.driver.full_name} 第 ${p.lap_number} 圈進站，跳至進站前`);
    markers.append('circle').attr('r',8).attr('stroke',p=>'#'+p.driver.display_colour);markers.append('text').attr('text-anchor','middle').attr('dy','.35em').text('P');
    markers.on('pointerdown',e=>e.stopPropagation()).on('pointerup',e=>e.stopPropagation()).on('click',(e,p)=>{e.stopPropagation();choosePit(p)}).on('pointermove',(e,p)=>{e.stopPropagation();showReading(p.lap_number);tooltip(e,p)}).on('pointerleave',()=>{$('#gap-tooltip').hidden=true;showReading(selectedLap)}).on('keydown',(e,p)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();choosePit(p)}});
    drawSelection();update(lastTime,lastDriver);showReading(selectedLap);
  }
  function inPlot(e){const [px,py]=d3.pointer(e,svg);return px>=left&&px<=width-right&&py>=top&&py<=bottom}
  const pointerLap=e=>Math.max(1,Math.min(53,x.invert(d3.pointer(e,svg)[0])));
  svg.addEventListener('pointerdown',e=>{if(e.target.closest('.pit-marker')||!e.isPrimary||e.button!==0||!inPlot(e))return;drag={id:e.pointerId,clientX:e.clientX,lap:pointerLap(e),moved:false,previousRange:range?[...range]:null};svg.setPointerCapture(e.pointerId);$('#gap-tooltip').hidden=true});
  svg.addEventListener('pointermove',e=>{
    if(drag){if(drag.id!==e.pointerId)return;if(Math.abs(e.clientX-drag.clientX)>5)drag.moved=true;if(drag.moved){range=[Math.max(1,Math.floor(Math.min(drag.lap,pointerLap(e)))),Math.min(53,Math.ceil(Math.max(drag.lap,pointerLap(e))))];drawSelection()}return}
    if(!inPlot(e))return;const lap=Math.round(pointerLap(e));hoverLine.attr('display',null).attr('x1',x(lap)).attr('x2',x(lap));showReading(lap);
  });
  svg.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(d.moved){showLap(range[0]);onSelectRange(...range)}else selectLap(pointerLap(e))});
  function cancel(e){if(!drag||drag.id!==e.pointerId)return;range=drag.previousRange;drag=null;drawSelection();if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)}
  svg.addEventListener('pointercancel',cancel);svg.addEventListener('lostpointercapture',cancel);
  svg.addEventListener('pointerleave',()=>{hoverLine?.attr('display','none');if(!drag)showReading(selectedLap);$('#gap-tooltip').hidden=true});
  svg.addEventListener('keydown',e=>{if(e.target.closest('.pit-marker'))return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectLap(e.key==='Home'?1:e.key==='End'?53:selectedLap+(e.key==='ArrowRight'?1:-1))}});
  function update(t,selectedNumber){lastTime=t;lastDriver=selectedNumber;if(!x)return;const p=reference.points.find(p=>t>=p.start_t&&t<p.end_t);const progress=t<=0?0:p?p.lap_number-1+Math.max(0,Math.min(1,(t-p.start_t)/(p.end_t-p.start_t))):reference.points.filter(p=>p.end_t!==null&&p.end_t<=t).at(-1)?.lap_number??0;cursor.attr('x1',x(progress)).attr('x2',x(progress));chart.selectAll('.gap-path').classed('is-selected',s=>s.driver_number===selectedNumber);$('#gap-now').textContent=t<=0?'回放：起跑前':`LEC 進度：第 ${Math.min(53,Math.floor(progress)+1)} 圈 · ${formatClock(t)}`}
  build();new ResizeObserver(()=>{if(Math.round(svg.clientWidth)!==width)build()}).observe(svg);
  return {update,clearSelection(){range=null;drawSelection()},setSelection(a,b){range=[a,b];showLap(a);drawSelection()}};
}
