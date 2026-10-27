export function sampleAt(samples,t){
  if(t<=samples[0].t)return {...samples[0]};
  if(t>=samples.at(-1).t)return {...samples.at(-1)};
  let lo=0,hi=samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].t<=t)lo=m;else hi=m}
  const a=samples[lo],b=samples[hi],u=(t-a.t)/(b.t-a.t),out={...(u<.5?a:b),t};
  for(const key of ['x','y','speed','throttle','rpm'])out[key]=a[key]+(b[key]-a[key])*u;
  return out;
}
export function formatLap(t){return `${Math.floor(t/60)}:${(t%60).toFixed(3).padStart(6,'0')}`}
export function formatClock(t){
  const s=Math.max(0,Math.floor(t));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export function recordAt(rows,t){
  if(!rows.length||t<rows[0].t)return null;
  let lo=0,hi=rows.length;while(lo+1<hi){const m=(lo+hi)>>1;if(rows[m].t<=t)lo=m;else hi=m}return rows[lo];
}
export function rankDrivers(drivers,t){
  return drivers.map(driver=>({driver,rank:recordAt(driver.positions,t)?.position??null})).sort((a,b)=>(a.rank??99)-(b.rank??99)||a.driver.driver_number-b.driver.driver_number);
}
export function worldTransform(drivers){
  const samples=drivers.flatMap(d=>d.samples),xs=samples.map(d=>d.x),ys=samples.map(d=>d.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=210/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return s=>[(s.y-cy)*scale,.32,-(s.x-cx)*scale];
}
export function carPoseAt(samples,t,toWorld,lateralOffset=0){
  const time=Math.max(samples[0].t,Math.min(samples.at(-1).t,t)),sample=sampleAt(samples,time),position=toWorld(sample);
  const before=toWorld(sampleAt(samples,time-.2)),after=toWorld(sampleAt(samples,time+.2));
  let dx=after[0]-before[0],dz=after[2]-before[2];
  // Stationary grid/pit samples use nearby motion, not the direction at the race finish.
  for(const window of [.5,1,2,4,8]){
    if(Math.hypot(dx,dz)>=.0001)break;
    const a=toWorld(sampleAt(samples,time-window)),b=toWorld(sampleAt(samples,time+window));dx=b[0]-a[0];dz=b[2]-a[2];
  }
  const length=Math.hypot(dx,dz)||1;position[0]+=dz/length*lateralOffset;position[2]-=dx/length*lateralOffset;
  return {sample,position,heading:Math.atan2(dx,dz)};
}

// Keep the playback cursor inside the view, including the first/last window.
export function speedWindow(t,maxTime,duration,manualStart=null){
  const length=duration==='all'?maxTime:Math.min(maxTime,duration);
  const step=length/4;
  const start=Math.max(0,Math.min(maxTime-length,manualStart??(Math.floor(Math.max(0,Math.min(maxTime,t))/step)*step-length/2)));
  return [start,start+length];
}

// Keep the time under the pointer anchored unless a race boundary intervenes.
export function zoomSpeedWindow(start,end,maxTime,fraction,factor){
  const ratio=Math.max(0,Math.min(1,fraction)),anchor=start+(end-start)*ratio;
  const length=Math.max(Math.min(5,maxTime),Math.min(maxTime,(end-start)*factor));
  const nextStart=Math.max(0,Math.min(maxTime-length,anchor-length*ratio));
  return [nextStart,nextStart+length];
}
