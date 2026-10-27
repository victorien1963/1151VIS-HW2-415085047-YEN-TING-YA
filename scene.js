import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {carPoseAt,worldTransform} from './model.js';

export function createScene(data,onSelect,onManualCamera,onFollowChange){
  const container=document.querySelector('#scene'),host=document.querySelector('#canvas-host');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,1400);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=85;controls.maxDistance=550;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.02;controls.autoRotateSpeed=.5;
  controls.screenSpacePanning=true;controls.zoomToCursor=true;
  let interactionMode='pan';
  function setInteractionMode(mode){
    interactionMode=mode;const pan=mode==='pan';controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;controls.mouseButtons.RIGHT=pan?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
    controls.touches.ONE=pan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;container.dataset.interactionMode=mode;
  }
  setInteractionMode('pan');
  scene.add(new THREE.HemisphereLight(0xdbeaff,0x334735,2.6));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-70,160,90);scene.add(sun);
  const transform=worldTransform([{samples:data.track_samples}]),objects=new Map(),picking=[];
  const grid=new THREE.GridHelper(310,25,0x293a41,0x1c2a32);grid.position.y=-.8;grid.material.transparent=true;grid.material.opacity=.36;scene.add(grid);
  const points=data.track_samples.map(s=>new THREE.Vector3(...transform(s)).setY(0));
  // One race lap defines the road; all cars share the race UTC clock.
  points.pop();const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');
  function ribbon(inner,outer,y,colour,striped=false){
    const positions=[],colours=[],count=1000,a=new THREE.Color(colour),b=new THREE.Color(0xd4dedc);
    for(let i=0;i<count;i++){
      const p=curve.getPointAt(i/count),q=curve.getPointAt((i+1)/count),ta=curve.getTangentAt(i/count),tb=curve.getTangentAt((i+1)/count);
      const A=[p.x+ta.z*inner,y,p.z-ta.x*inner],B=[p.x+ta.z*outer,y,p.z-ta.x*outer],C=[q.x+tb.z*inner,y,q.z-tb.x*inner],D=[q.x+tb.z*outer,y,q.z-tb.x*outer];
      positions.push(...A,...C,...B,...B,...C,...D);const c=striped&&Math.floor(i/4)%2?b:a;for(let j=0;j<6;j++)colours.push(c.r,c.g,c.b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1}));scene.add(mesh);return mesh;
  }
  ribbon(-7.4,7.4,-.35,0x183a32);ribbon(-5.25,5.25,0,0x313d49);
  ribbon(-5.8,-5.25,.03,0x98464b,true);ribbon(5.25,5.8,.03,0x98464b,true);
  ribbon(-5.14,-4.98,.06,0xb2bfc7);ribbon(4.98,5.14,.06,0xb2bfc7);
  function textSprite(text,colour='#788d9c',width=35){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d');ctx.font='500 46px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=colour;ctx.fillText(text,384,64);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));sprite.scale.set(width,width/6,1);return sprite;
  }
  const start=carPoseAt(data.track_samples,0,transform),finish=new THREE.Group();finish.position.set(...start.position);finish.position.y=.09;finish.rotation.y=start.heading;
  for(let x=0;x<12;x++)for(let z=0;z<2;z++){const square=new THREE.Mesh(new THREE.PlaneGeometry(.84,.8),new THREE.MeshBasicMaterial({color:(x+z)%2?0xdde5e7:0x0d141b,side:THREE.DoubleSide}));square.rotation.x=-Math.PI/2;square.position.set((x-5.5)*.84,0,(z-.5)*.8);finish.add(square)}scene.add(finish);
  const finishLabel=textSprite('FINISH / TIMING','#b4c6d5',27);finishLabel.position.set(start.position[0]-9,3,start.position[2]+13);scene.add(finishLabel);
  // Monza's start line is 309 m downstream of the timing line (FIA 2024).
  // Arc length on the sampled road is illustrative, not surveyed coordinates.
  const startU=309/5793,startPoint=curve.getPointAt(startU),startTangent=curve.getTangentAt(startU);
  const startLine=new THREE.Mesh(new THREE.PlaneGeometry(10.5,.55),new THREE.MeshBasicMaterial({color:0xe8eef6,side:THREE.DoubleSide}));
  startLine.rotation.set(-Math.PI/2,0,Math.atan2(startTangent.x,startTangent.z));startLine.position.copy(startPoint).setY(.1);scene.add(startLine);
  const startLabel=textSprite('START','#e8eef6',18);startLabel.position.copy(startPoint).add(new THREE.Vector3(0,3,-15));scene.add(startLabel);
  container.dataset.startLineOffsetMetres='309';
  const monza=textSprite('MONZA','#546b75',61);monza.position.set(-4,.1,-2);scene.add(monza);
  function buildCar(driver){
    const group=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color:'#'+driver.display_colour,metalness:.3,roughness:.36}),dark=new THREE.MeshStandardMaterial({color:0x101820,roughness:.8}),rubber=new THREE.MeshStandardMaterial({color:0x080c12,roughness:1}),silver=new THREE.MeshStandardMaterial({color:0xa6b6c4,metalness:.6,roughness:.3});
    function box(w,h,l,x,y,z,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,l),material);m.position.set(x,y,z);group.add(m);picking.push(m);m.userData.driver=driver.driver_number;return m}
    box(1.25,.5,2.6,0,.65,-.2,paint);box(.42,.28,1.55,0,.42,1.6,paint);box(2.5,.17,.48,0,.24,2.3,paint);box(2.4,.19,.56,0,1,-2,paint);box(.18,.7,.18,-.85,.55,-1.95,dark);box(.18,.7,.18,.85,.55,-1.95,dark);
    box(.8,.18,1.05,0,.95,-.1,dark);box(.16,.27,.85,0,1.12,-.05,silver);box(2.05,.25,1.3,0,.35,-.6,paint);
    for(const x of [-1.08,1.08])for(const z of [-1.45,1.35]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.47,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.46,z);wheel.userData.driver=driver.driver_number;group.add(wheel);picking.push(wheel)}
    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.25,12,8),new THREE.MeshStandardMaterial({color:0xe9eef4}));helmet.position.set(0,1.1,-.42);group.add(helmet);
    const badge=document.createElement('canvas');badge.width=128;badge.height=128;const ctx=badge.getContext('2d');ctx.fillStyle='#101820';ctx.font='bold 83px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(driver.driver_number),64,65);
    const number=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(badge),transparent:true,side:THREE.DoubleSide}));number.rotation.x=-Math.PI/2;number.rotation.z=Math.PI;number.position.set(0,.92,.8);group.add(number);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.2,5.4),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.22;group.add(shadow);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.6,2.85,48),new THREE.MeshBasicMaterial({color:'#'+driver.display_colour,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.scale.y=1.28;ring.position.y=-.15;group.add(ring);
    group.scale.set(1.1,1.1,1.5);scene.add(group);return {group,ring};
  }
  data.drivers.forEach((driver,index)=>{
    const {group,ring}=buildCar(driver),offset=(index-(data.drivers.length-1)/2)*2.85;
    const label=document.createElement('button');label.className='car-label';label.dataset.driver=driver.driver_number;label.style.setProperty('--driver','#'+driver.display_colour);label.innerHTML=`<b>${driver.name_acronym}</b><span class="label-speed"></span><small>km/h</small>`;label.setAttribute('aria-label',`選取 ${driver.full_name}`);label.setAttribute('aria-pressed','false');label.addEventListener('click',()=>onSelect(driver.driver_number));document.querySelector('#car-labels').append(label);
    const connector=document.createElementNS('http://www.w3.org/2000/svg','line');connector.setAttribute('stroke','#'+driver.display_colour);document.querySelector('#label-lines').append(connector);
    objects.set(driver.driver_number,{driver,group,ring,offset,label,connector});
  });
  let selected=data.drivers[0].driver_number,width=1,height=1,pointerStart=null,pointerPan=false,pointerDragged=false,following=false,currentTime=0;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown',e=>{
    pointerStart=[e.clientX,e.clientY];pointerDragged=false;
    pointerPan=e.pointerType==='touch'?interactionMode==='pan':e.button===0?interactionMode==='pan':e.button===2&&interactionMode==='rotate';
    if(e.pointerType!=='touch'&&[0,2].includes(e.button)&&(e.ctrlKey||e.metaKey||e.shiftKey))pointerPan=!pointerPan;
  });
  renderer.domElement.addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5){pointerDragged=true;if(pointerPan&&following)setFollowing(false)}},{capture:true});
  renderer.domElement.addEventListener('pointercancel',()=>{pointerStart=null;pointerDragged=false});
  renderer.domElement.addEventListener('pointerup',e=>{
    const start=pointerStart;pointerStart=null;
    if(!start||pointerDragged||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;
    const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(picking)[0];if(hit)onSelect(hit.object.userData.driver);
  });
  function settleControls(){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping}
  function reset(view='perspective'){setFollowing(false);settleControls();controls.target.set(0,0,0);camera.position.set(...(view==='top'?[0,310,.1]:[28,232,140]));camera.lookAt(controls.target);controls.update();container.dataset.camera=view}
  function focusSelected(t=currentTime){
    // The follow loop already centers the car every frame. Do not flush pending
    // OrbitControls damping or apply a second camera transform while following.
    if(following)return;
    settleControls();const o=objects.get(selected),pose=carPoseAt(o.driver.samples,t,transform,o.offset),offset=camera.position.clone().sub(controls.target);
    controls.target.set(pose.position[0],2,pose.position[2]);camera.position.copy(controls.target).add(offset);controls.update();container.dataset.camera='focused';
  }
  function setFollowing(value,t=currentTime){if(value&&!following)focusSelected(t);following=value;controls.zoomToCursor=!value;container.dataset.following=String(value);onFollowChange?.(value)}
  function recordCamera(){container.dataset.cameraPosition=camera.position.toArray().map(v=>v.toFixed(1)).join(',');container.dataset.cameraTarget=controls.target.toArray().map(v=>v.toFixed(2)).join(',');container.dataset.cameraDistance=camera.position.distanceTo(controls.target).toFixed(2)}
  controls.addEventListener('change',recordCamera);
  function manualCamera(){controls.autoRotate=false;onManualCamera?.();document.querySelectorAll('#view-perspective,#view-top').forEach(b=>b.setAttribute('aria-pressed','false'));container.dataset.camera='custom'}
  controls.addEventListener('start',manualCamera);
  container.addEventListener('keydown',e=>{
    if(e.target!==container)return;const offset=camera.position.clone().sub(controls.target);
    if(interactionMode==='pan'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();setFollowing(false);manualCamera();const step=offset.length()*.045,dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
      const shift=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0).multiplyScalar(-dx*step).add(new THREE.Vector3().setFromMatrixColumn(camera.matrix,1).multiplyScalar(dy*step));
      camera.position.add(shift);controls.target.add(shift);controls.update();return;
    }
    if(['ArrowLeft','ArrowRight'].includes(e.key))offset.applyAxisAngle(new THREE.Vector3(0,1,0),e.key==='ArrowLeft'?.16:-.16);
    else if(['ArrowUp','ArrowDown'].includes(e.key)){const spherical=new THREE.Spherical().setFromVector3(offset);spherical.phi=THREE.MathUtils.clamp(spherical.phi+(e.key==='ArrowUp'?-.1:.1),.05,Math.PI*.43);offset.setFromSpherical(spherical)}
    else if(e.key==='+'||e.key==='=')offset.multiplyScalar(.9);else if(e.key==='-')offset.multiplyScalar(1.1);else return;
    e.preventDefault();manualCamera();camera.position.copy(controls.target).add(offset);controls.update();
  });
  function resize(){width=host.clientWidth;height=host.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.zoom=Math.min(1,camera.aspect/1.5);camera.updateProjectionMatrix();document.querySelector('#label-lines').setAttribute('viewBox',`0 0 ${width} ${height}`)}
  new ResizeObserver(resize).observe(host);resize();reset();
  function select(number){selected=number;for(const [id,o]of objects){const active=id===number;o.ring.visible=active;o.label.setAttribute('aria-pressed',String(active));o.label.style.zIndex=active?'3':'2'}}
  function update(t,delta,phase){
    currentTime=t;controls.update(delta);
    if(following){
      const o=objects.get(selected),pose=carPoseAt(o.driver.samples,t,transform,o.offset),target=new THREE.Vector3(pose.position[0],2,pose.position[2]);
      camera.position.add(target.clone().sub(controls.target));controls.target.copy(target);camera.updateMatrixWorld();recordCamera();container.dataset.camera='following';
    }
    const labels=[];
    for(const o of objects.values()){
      const pose=carPoseAt(o.driver.samples,t,transform,o.offset);o.group.position.set(...pose.position);o.group.rotation.y=pose.heading;const finished=t>=o.driver.finish_t;o.label.querySelector('.label-speed').textContent=finished?'FIN':Math.round(pose.sample.speed);o.label.querySelector('small').hidden=finished;
      o.label.dataset.position=pose.position.map(v=>v.toFixed(2)).join(',');o.label.dataset.heading=pose.heading.toFixed(3);
      const p=o.group.position.clone().setY(2).project(camera),screenX=(p.x*.5+.5)*width,screenY=(-p.y*.5+.5)*height;
      o.label.dataset.screenX=screenX.toFixed(1);o.label.dataset.screenY=screenY.toFixed(1);
      const visible=p.z<1&&p.z>-1&&screenX>-25&&screenX<width+25&&screenY>0&&screenY<height;o.label.hidden=!visible;o.connector.style.display=visible?'':'none';
      if(visible)labels.push({o,x:screenX,y:screenY,lx:Math.min(width-112,Math.max(8,screenX+22)),ly:Math.min(height-70,Math.max(45,screenY-18))});
    }
    labels.sort((a,b)=>a.ly-b.ly);
    for(let i=0;i<labels.length;i++)for(let j=0;j<i;j++)if(Math.abs(labels[i].lx-labels[j].lx)<112&&labels[i].ly-labels[j].ly<32)labels[i].ly=labels[j].ly+32;
    const overflow=Math.max(0,...labels.map(l=>l.ly+28-(height-42)));if(overflow)labels.forEach(l=>l.ly-=overflow);
    for(const l of labels){l.o.label.style.transform=`translate(${l.lx}px,${l.ly}px)`;l.o.connector.setAttribute('x1',l.x);l.o.connector.setAttribute('y1',l.y);l.o.connector.setAttribute('x2',l.lx);l.o.connector.setAttribute('y2',l.ly+13)}
    renderer.render(scene,camera);
  }
  select(selected);return {update,select,reset,focusSelected,setFollowing,setInteractionMode,setAutoRotate(value){controls.autoRotate=value},getSelected(){return selected}};
}
