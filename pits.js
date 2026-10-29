// In this Monza export pit.t is close to the pit-lane exit timestamp.
// Entry is estimated from the recorded lane duration, not an independent timing beam.
const stopCache=new WeakMap();
export function pitStopsFor(driver){
  if(stopCache.has(driver))return stopCache.get(driver);
  const stops=(driver.pits??[]).map((pit,index)=>{
    const duration=pit.lane_duration??pit.pit_duration;
    if(!Number.isFinite(pit.t)||!Number.isFinite(duration)||duration<=0)return null;
    return {...pit,driver_number:driver.driver_number,stop_index:index+1,
      entry_t:Math.max(0,pit.t-duration),exit_t:pit.t,lane_duration:duration,estimated_entry:true};
  }).filter(Boolean).sort((a,b)=>a.entry_t-b.entry_t);
  stopCache.set(driver,stops);return stops;
}
export function pitAt(driver,t){
  return pitStopsFor(driver).find(pit=>t>=pit.entry_t&&t<pit.exit_t)??null;
}

// Cars are enlarged and normally spread sideways for readability. Ease that
// display offset to zero in the pit lane so they follow their recorded XY path.
export function pitOffsetFactor(driver,t){
  let factor=1;
  for(const pit of pitStopsFor(driver)){
    if(t>=pit.entry_t-5&&t<=pit.exit_t+5){
      const u=t<pit.entry_t?(pit.entry_t-t)/5:t>pit.exit_t?(t-pit.exit_t)/5:0;
      const clamped=Math.max(0,Math.min(1,u));
      factor=Math.min(factor,clamped*clamped*(3-2*clamped));
    }
  }
  return factor;
}

// A single recorded traversal gives the schematic lane its real XY alignment.
// Padding retains the approach/exit rather than joining disjoint track points.
export function buildPitLaneSamples(data){
  for(const driver of data.drivers??[]){
    for(const pit of pitStopsFor(driver)){
      const samples=driver.samples.filter(s=>s.t>=pit.entry_t-5&&s.t<=pit.exit_t+6);
      const path=[];
      for(const sample of samples){
        const previous=path.at(-1);
        if(!previous||Math.hypot(sample.x-previous.x,sample.y-previous.y)>=8)path.push(sample);
      }
      if(path.length>4)return path;
    }
  }
  return [];
}
