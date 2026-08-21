(()=>{
'use strict';

const $=id=>document.getElementById(id);
const canvas=$('editor');
const ctx=canvas.getContext('2d');

const E={
  file:$('fileInput'),empty:$('emptyState'),selectPhoto:$('selectPhoto'),lockPhoto:$('lockPhoto'),
  photoScale:$('photoScale'),photoScaleValue:$('photoScaleValue'),photoScaleMinus:$('photoScaleMinus'),photoScalePlus:$('photoScalePlus'),
  addBeak:$('addBeak'),addTie:$('addTie'),addFeather:$('addFeather'),addBadge:$('addBadge'),
  undo:$('undo'),redo:$('redo'),layerList:$('layerList'),stylePanel:$('stylePanel'),styleButtons:$('styleButtons'),
  lockObject:$('lockObject'),objectScale:$('objectScale'),objectScaleValue:$('objectScaleValue'),objectScaleMinus:$('objectScaleMinus'),objectScalePlus:$('objectScalePlus'),
  lengthPanel:$('lengthPanel'),objectLength:$('objectLength'),objectLengthValue:$('objectLengthValue'),objectLengthMinus:$('objectLengthMinus'),objectLengthPlus:$('objectLengthPlus'),
  objectRotate:$('objectRotate'),objectRotateValue:$('objectRotateValue'),objectRotateMinus:$('objectRotateMinus'),objectRotatePlus:$('objectRotatePlus'),
  objectYaw:$('objectYaw'),objectYawValue:$('objectYawValue'),objectPitch:$('objectPitch'),objectPitchValue:$('objectPitchValue'),
  warpPanel:$('warpPanel'),warpMode:$('warpMode'),warpTargetButtons:$('warpTargetButtons'),
  warpDepth:$('warpDepth'),warpDepthValue:$('warpDepthValue'),warpForward:$('warpForward'),warpBack:$('warpBack'),resetWarp:$('resetWarp'),
  objectFlip:$('objectFlip'),duplicate:$('duplicate'),moveForward:$('moveForward'),moveBack:$('moveBack'),resetObject:$('resetObject'),deleteObject:$('deleteObject'),
  nudgeUp:$('nudgeUp'),nudgeDown:$('nudgeDown'),nudgeLeft:$('nudgeLeft'),nudgeRight:$('nudgeRight'),centerObject:$('centerObject'),
  previewFinal:$('previewFinal'),download:$('download'),startOver:$('startOver'),status:$('status'),postMode:$('postMode'),pfpMode:$('pfpMode'),stageNote:$('stageNote'),outputNote:$('outputNote')
};

const assetSources={
  'beak-closed':'assets/beak-closed.png?v=20260820warp2',
  'beak-open':'assets/beak-open.png?v=20260820warp2',
  'beak-squawk':'assets/beak-squawk.png?v=20260820warp2',
  'beak-pursed':'assets/beak-pursed.png?v=20260820warp2',
  'tie-straight':'assets/tie-straight.png',
  'tie-flying':'assets/tie-flying.png',
  'feather-orange':'assets/feather-orange.png',
  'feather-green':'assets/feather-green.png',
  badge:'assets/plus1-chump.png'
};
const assets={};
const styleMap={
  beak:[['closed','CLOSED'],['open','OPEN'],['squawk','SQUAWK'],['pursed','PURSED']],
  tie:[['straight','STRAIGHT'],['flying','FLYING']],
  feather:[['orange','ORANGE'],['green','GREEN']],
  badge:[]
};
const baseSize={beak:355,tie:315,feather:235,badge:560};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(a,b)=>{let d=a-b;while(d>180)d-=360;while(d<-180)d+=360;return d;};
const freshWarp=()=>({corners:[
  {x:0,y:0,z:0},
  {x:0,y:0,z:0},
  {x:0,y:0,z:0},
  {x:0,y:0,z:0}
]});

for(const [key,src] of Object.entries(assetSources)){
  const img=new Image();
  img.decoding='async';
  img.onload=scheduleRender;
  img.src=src;
  assets[key]=img;
}

let photo=null;
let photoUrl=null;
let outputMode='post';
let previewClean=false;
let photoState={x:540,y:540,scale:1,locked:false};
let objects=[];
let selected='photo';
let nextId=1;
let history=[];
let future=[];
let framePending=false;
let gestureChanged=false;
let dragSession=null;
let gesture=null;
let warpModeActive=false;
let warpTarget='whole';
const pointers=new Map();

function status(text){E.status.textContent=text;}
function imageReady(img){return img&&img.complete&&img.naturalWidth>0;}
function selectedObject(){return typeof selected==='number'?objects.find(o=>o.id===selected)||null:null;}
function objectAssetKey(o){return o.type==='badge'?'badge':`${o.type}-${o.style}`;}
function objectImage(o){return assets[objectAssetKey(o)];}
function ensureWarp(o){if(o&&o.type==='beak'&&(!o.warp||!Array.isArray(o.warp.corners)||o.warp.corners.length!==4))o.warp=freshWarp();return o?.warp;}
function snapshot(){return JSON.stringify({photoState,objects,selected,nextId});}

function pushHistory(){
  if(!photo)return;
  const s=snapshot();
  if(history[history.length-1]!==s)history.push(s);
  if(history.length>60)history.shift();
  future=[];
  updateHistoryButtons();
}
function restoreSnapshot(s){
  const v=JSON.parse(s);
  photoState=v.photoState;
  objects=v.objects;
  selected=v.selected;
  nextId=v.nextId;
  objects.forEach(ensureWarp);
  warpModeActive=false;
  syncControls();
  rebuildLayers();
  render();
  updateAddButtons();
}
function updateHistoryButtons(){
  E.undo.disabled=history.length<=1;
  E.redo.disabled=future.length===0;
}
function scheduleRender(){
  if(framePending)return;
  framePending=true;
  requestAnimationFrame(()=>{framePending=false;render();});
}

function objectDimensions(o){
  const img=objectImage(o);
  if(!imageReady(img))return{w:1,h:1};
  const w=baseSize[o.type]*o.scale;
  const length=o.type==='tie'?o.length:1;
  return{w,h:w*(img.naturalHeight/img.naturalWidth)*length};
}
function drawPhoto(target){
  if(!photo)return;
  const cover=Math.max(1080/photo.naturalWidth,1080/photo.naturalHeight);
  const s=cover*photoState.scale;
  const w=photo.naturalWidth*s,h=photo.naturalHeight*s;
  target.drawImage(photo,photoState.x-w/2,photoState.y-h/2,w,h);
}

function beakCorner3D(o,d,index){
  ensureWarp(o);
  const base=[
    [-d.w/2,-d.h/2],
    [ d.w/2,-d.h/2],
    [ d.w/2, d.h/2],
    [-d.w/2, d.h/2]
  ][index];
  const c=o.warp.corners[index];
  let x=base[0]+c.x*d.w;
  let y=base[1]+c.y*d.h;
  let z=(c.z/100)*d.w*.72;

  const yaw=clamp(o.yaw,-70,70)*Math.PI/180;
  const pitch=clamp(o.pitch,-70,70)*Math.PI/180;

  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const x1=x*cy-z*sy;
  const z1=x*sy+z*cy;

  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  const y2=y*cp-z1*sp;
  const z2=y*sp+z1*cp;

  return{x:x1,y:y2,z:z2};
}
function bilerp3(a,b,c,d,u,v){
  const top={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u};
  const bottom={x:d.x+(c.x-d.x)*u,y:d.y+(c.y-d.y)*u,z:d.z+(c.z-d.z)*u};
  return{
    x:top.x+(bottom.x-top.x)*v,
    y:top.y+(bottom.y-top.y)*v,
    z:top.z+(bottom.z-top.z)*v
  };
}
function projectBeakLocal(o,p){
  const focal=850;
  const denom=Math.max(170,focal+p.z);
  const perspective=focal/denom;
  let x=p.x*perspective;
  let y=p.y*perspective;

  const r=o.rotation*Math.PI/180;
  const cr=Math.cos(r),sr=Math.sin(r);
  const xr=x*cr-y*sr;
  const yr=x*sr+y*cr;
  return{x:o.x+xr,y:o.y+yr,z:p.z};
}
function beakProjectedPoint(o,d,u,v){
  const a=beakCorner3D(o,d,0),b=beakCorner3D(o,d,1),c=beakCorner3D(o,d,2),dd=beakCorner3D(o,d,3);
  return projectBeakLocal(o,bilerp3(a,b,c,dd,u,v));
}
function beakQuad(o){
  const d=objectDimensions(o);
  return[
    beakProjectedPoint(o,d,0,0),
    beakProjectedPoint(o,d,1,0),
    beakProjectedPoint(o,d,1,1),
    beakProjectedPoint(o,d,0,1)
  ];
}
function triangleTransform(s0,s1,s2,d0,d1,d2){
  const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<1e-7)return null;
  return{
    a:(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den,
    c:(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den,
    e:(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den,
    b:(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den,
    d:(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den,
    f:(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den
  };
}
function drawTexturedTriangle(target,img,s0,s1,s2,d0,d1,d2){
  const m=triangleTransform(s0,s1,s2,d0,d1,d2);
  if(!m)return;
  target.save();
  target.beginPath();
  target.moveTo(d0.x,d0.y);
  target.lineTo(d1.x,d1.y);
  target.lineTo(d2.x,d2.y);
  target.closePath();
  target.clip();
  target.transform(m.a,m.b,m.c,m.d,m.e,m.f);
  target.drawImage(img,0,0);
  target.restore();
}
function drawBeakWarp(target,o,img){
  ensureWarp(o);
  const d=objectDimensions(o);
  const cols=8,rows=8;
  const iw=img.naturalWidth,ih=img.naturalHeight;
  target.imageSmoothingEnabled=true;

  for(let y=0;y<rows;y++){
    const v0=y/rows,v1=(y+1)/rows;
    for(let x=0;x<cols;x++){
      const u0=x/cols,u1=(x+1)/cols;
      const p00=beakProjectedPoint(o,d,u0,v0);
      const p10=beakProjectedPoint(o,d,u1,v0);
      const p11=beakProjectedPoint(o,d,u1,v1);
      const p01=beakProjectedPoint(o,d,u0,v1);

      const su0=(o.flip?1-u0:u0)*iw;
      const su1=(o.flip?1-u1:u1)*iw;
      const sv0=v0*ih,sv1=v1*ih;
      const s00={x:su0,y:sv0},s10={x:su1,y:sv0},s11={x:su1,y:sv1},s01={x:su0,y:sv1};

      drawTexturedTriangle(target,img,s00,s10,s11,p00,p10,p11);
      drawTexturedTriangle(target,img,s00,s11,s01,p00,p11,p01);
    }
  }
}
function drawAffineObject(target,o,img){
  const d=objectDimensions(o);
  const yaw=clamp(o.yaw,-70,70),pitch=clamp(o.pitch,-70,70);
  const xCompress=1-(Math.abs(yaw)/70)*.34;
  const yCompress=1-(Math.abs(pitch)/70)*.30;
  const shearX=Math.tan(yaw*.28*Math.PI/180);
  const shearY=Math.tan(pitch*.22*Math.PI/180);
  target.save();
  target.translate(o.x,o.y);
  target.rotate(o.rotation*Math.PI/180);
  target.scale((o.flip?-1:1)*xCompress,yCompress);
  target.transform(1,shearY,shearX,1,0,0);
  target.drawImage(img,-d.w/2,-d.h/2,d.w,d.h);
  target.restore();
}
function drawObject(target,o){
  const img=objectImage(o);
  if(!imageReady(img))return;
  if(o.type==='beak')drawBeakWarp(target,o,img);
  else drawAffineObject(target,o,img);
}

function drawWarpGuide(target,o){
  const q=beakQuad(o);
  target.save();
  target.strokeStyle=o.locked?'rgba(202,255,0,.45)':'rgba(202,255,0,.95)';
  target.lineWidth=3;
  target.setLineDash(o.locked?[5,9]:[11,8]);
  target.beginPath();
  target.moveTo(q[0].x,q[0].y);
  for(let i=1;i<q.length;i++)target.lineTo(q[i].x,q[i].y);
  target.closePath();
  target.stroke();
  target.setLineDash([]);

  if(warpModeActive&&!o.locked){
    const labels=['TL','TR','BR','BL'];
    const keys=['tl','tr','br','bl'];
    q.forEach((p,i)=>{
      const active=warpTarget===keys[i];
      target.beginPath();
      target.fillStyle=active?'#ffd866':'#caff00';
      target.strokeStyle='#07111c';
      target.lineWidth=5;
      target.arc(p.x,p.y,active?15:12,0,Math.PI*2);
      target.fill();
      target.stroke();
      target.fillStyle='#07111c';
      target.font='900 10px system-ui,sans-serif';
      target.textAlign='center';
      target.textBaseline='middle';
      target.fillText(labels[i],p.x,p.y+.5);
    });
  }else{
    target.fillStyle=o.locked?'#7b8b39':'#caff00';
    target.beginPath();
    target.arc(o.x,o.y,6,0,Math.PI*2);
    target.fill();
  }
  target.restore();
}
function drawSelectionGuide(target,o){
  if(o.type==='beak'){drawWarpGuide(target,o);return;}
  const d=objectDimensions(o);
  target.save();
  target.translate(o.x,o.y);
  target.rotate(o.rotation*Math.PI/180);
  target.strokeStyle=o.locked?'rgba(202,255,0,.45)':'rgba(202,255,0,.95)';
  target.lineWidth=3;
  target.setLineDash(o.locked?[5,9]:[11,8]);
  target.strokeRect(-d.w/2-10,-d.h/2-10,d.w+20,d.h+20);
  target.setLineDash([]);
  target.fillStyle=o.locked?'#7b8b39':'#caff00';
  target.beginPath();
  target.arc(0,0,6,0,Math.PI*2);
  target.fill();
  target.restore();
}
function drawPfpGuide(target){
  target.save();
  target.fillStyle='rgba(0,0,0,.48)';
  target.beginPath();
  target.rect(0,0,1080,1080);
  target.arc(540,540,528,0,Math.PI*2,true);
  target.fill('evenodd');
  target.strokeStyle='rgba(202,255,0,.95)';
  target.lineWidth=4;
  target.beginPath();
  target.arc(540,540,528,0,Math.PI*2);
  target.stroke();
  target.restore();
}
function drawScene(target,{guides=true}={}){
  target.clearRect(0,0,1080,1080);
  target.fillStyle='#05070b';
  target.fillRect(0,0,1080,1080);
  drawPhoto(target);
  for(const o of objects)drawObject(target,o);
  if(guides&&!previewClean){
    const o=selectedObject();
    if(o)drawSelectionGuide(target,o);
    if(outputMode==='pfp')drawPfpGuide(target);
  }
}
function render(){
  drawScene(ctx,{guides:true});
  canvas.classList.toggle('preview-mode',previewClean);
  canvas.classList.toggle('warp-mode',warpModeActive);
}

function layerLabel(o){
  const style=o.type==='badge'?'':` • ${String(o.style).toUpperCase()}`;
  return`${o.type.toUpperCase()}${style}`;
}
function rebuildLayers(){
  E.layerList.innerHTML='';
  const p=document.createElement('button');
  p.type='button';
  p.className='layer'+(selected==='photo'?' active':'')+(photoState.locked?' locked':'');
  p.innerHTML=`<span>PHOTO</span><small>${photoState.locked?'LOCKED':'MOVE + SIZE'}</small>`;
  p.addEventListener('click',()=>selectLayer('photo'));
  E.layerList.appendChild(p);

  objects.forEach((o,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='layer'+(selected===o.id?' active':'')+(o.locked?' locked':'');
    b.innerHTML=`<span>${i+1}. ${layerLabel(o)}</span><small>${o.locked?'LOCKED':'EDIT'}</small>`;
    b.addEventListener('click',()=>selectLayer(o.id));
    E.layerList.appendChild(b);
  });
}
function selectLayer(v){
  selected=v;
  previewClean=false;
  const o=selectedObject();
  if(!o||o.type!=='beak')warpModeActive=false;
  syncControls();
  rebuildLayers();
  scheduleRender();
}
function rebuildStyleButtons(o){
  E.styleButtons.innerHTML='';
  const styles=styleMap[o.type]||[];
  E.stylePanel.hidden=styles.length===0;
  for(const [value,label] of styles){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=label;
    b.classList.toggle('active',o.style===value);
    b.disabled=!!o.locked;
    b.addEventListener('click',()=>{
      if(o.locked)return;
      o.style=value;
      syncControls();
      scheduleRender();
      pushHistory();
    });
    E.styleButtons.appendChild(b);
  }
}
function setDisabled(elements,value){elements.forEach(el=>{if(el)el.disabled=value;});}
function warpTargetIndices(target=warpTarget){
  return({
    tl:[0],top:[0,1],tr:[1],
    left:[0,3],whole:[0,1,2,3],right:[1,2],
    bl:[3],bottom:[3,2],br:[2]
  })[target]||[0,1,2,3];
}
function warpDepthForTarget(o){
  ensureWarp(o);
  const ids=warpTargetIndices();
  return Math.round(ids.reduce((sum,i)=>sum+o.warp.corners[i].z,0)/ids.length);
}
function updateWarpTargetButtons(){
  if(!E.warpTargetButtons)return;
  E.warpTargetButtons.querySelectorAll('button[data-warp-target]').forEach(b=>{
    b.classList.toggle('active',b.dataset.warpTarget===warpTarget);
  });
}
function syncWarpControls(o,locked){
  const isBeak=!!(o&&o.type==='beak');
  E.warpPanel.hidden=!isBeak;
  if(!isBeak){
    warpModeActive=false;
    return;
  }
  ensureWarp(o);
  E.warpMode.disabled=locked;
  E.warpMode.classList.toggle('active',warpModeActive);
  E.warpMode.textContent=warpModeActive?'DONE WARPING':'EDIT 3D WARP';
  setDisabled([E.warpDepth,E.warpForward,E.warpBack,E.resetWarp],locked);
  E.warpTargetButtons.querySelectorAll('button').forEach(b=>{b.disabled=locked;});
  E.warpDepth.value=warpDepthForTarget(o);
  E.warpDepthValue.textContent=`${E.warpDepth.value}`;
  updateWarpTargetButtons();
}

function syncControls(){
  const hasPhoto=!!photo;
  const photoLocked=!hasPhoto||photoState.locked;
  E.photoScale.value=Math.round(photoState.scale*100);
  E.photoScaleValue.textContent=`${Math.round(photoState.scale*100)}%`;
  E.lockPhoto.textContent=photoState.locked?'UNLOCK PHOTO':'LOCK PHOTO';
  E.selectPhoto.disabled=!hasPhoto;
  E.lockPhoto.disabled=!hasPhoto;
  setDisabled([E.photoScale,E.photoScaleMinus,E.photoScalePlus],photoLocked);
  E.previewFinal.disabled=!hasPhoto;
  E.previewFinal.textContent=previewClean?'BACK TO EDIT':'PREVIEW FINAL';
  E.previewFinal.classList.toggle('active',previewClean);

  const o=selectedObject();
  const locked=!o||o.locked;
  E.lockObject.disabled=!o;
  E.lockObject.textContent=o&&o.locked?'UNLOCK':'LOCK';
  E.lockObject.classList.toggle('active',!!(o&&o.locked));

  setDisabled([
    E.objectScale,E.objectScaleMinus,E.objectScalePlus,
    E.objectRotate,E.objectRotateMinus,E.objectRotatePlus,
    E.objectYaw,E.objectPitch,E.objectFlip,
    E.moveForward,E.moveBack,E.resetObject,E.deleteObject,
    E.nudgeUp,E.nudgeDown,E.nudgeLeft,E.nudgeRight,E.centerObject
  ],locked);
  E.duplicate.disabled=locked||!o||o.type==='badge';
  E.lengthPanel.hidden=!(o&&o.type==='tie');
  E.stylePanel.hidden=true;
  E.styleButtons.innerHTML='';
  setDisabled([E.objectLength,E.objectLengthMinus,E.objectLengthPlus],locked||!(o&&o.type==='tie'));

  if(!o){
    E.objectScaleValue.textContent=E.objectRotateValue.textContent=E.objectYawValue.textContent=E.objectPitchValue.textContent='—';
    syncWarpControls(null,true);
    status(selected==='photo'?(photoState.locked?'Photo locked.':'Photo selected. Drag inside the image to reposition.'):'Ready.');
    return;
  }

  ensureWarp(o);
  rebuildStyleButtons(o);
  E.objectScale.value=Math.round(o.scale*100);
  E.objectScaleValue.textContent=`${Math.round(o.scale*100)}%`;
  E.objectRotate.value=Math.round(o.rotation);
  E.objectRotateValue.textContent=`${Math.round(o.rotation)}°`;
  E.objectYaw.value=o.yaw;
  E.objectYawValue.textContent=Math.round(o.yaw);
  E.objectPitch.value=o.pitch;
  E.objectPitchValue.textContent=Math.round(o.pitch);
  E.objectFlip.checked=o.flip;
  if(o.type==='tie'){
    E.objectLength.value=Math.round(o.length*100);
    E.objectLengthValue.textContent=`${Math.round(o.length*100)}%`;
  }
  syncWarpControls(o,locked);
  status(o.locked
    ?`${o.type.toUpperCase()} locked. Unlock it to edit.`
    :o.type==='beak'&&warpModeActive
      ?'3D WARP: drag a corner handle. Pick a corner or side below for forward/back depth.'
      :`${o.type.toUpperCase()} selected. Drag, pinch, or twist directly on the image.`);
}
function updateTransformUi(){
  const o=selectedObject();
  if(!o)return;
  E.objectScale.value=Math.round(o.scale*100);
  E.objectScaleValue.textContent=`${Math.round(o.scale*100)}%`;
  E.objectRotate.value=Math.round(o.rotation);
  E.objectRotateValue.textContent=`${Math.round(o.rotation)}°`;
}

function addObject(type){
  if(!photo)return;
  if(type==='badge'&&objects.some(o=>o.type==='badge')){
    status('Only one +1 badge is used per image.');
    return;
  }
  if(objects.length>=30){
    status('Maximum 30 CHUMP objects per image.');
    return;
  }
  const defaults={beak:'closed',tie:'straight',feather:'orange',badge:null};
  const count=objects.filter(o=>o.type===type).length;
  const o={
    id:nextId++,type,style:defaults[type],
    x:540+((count%5)-2)*34,
    y:type==='tie'?520:type==='badge'?805:type==='feather'?300:445,
    scale:1,length:1,rotation:0,yaw:0,pitch:0,flip:false,locked:false
  };
  if(type==='beak')o.warp=freshWarp();
  objects.push(o);
  selected=o.id;
  warpModeActive=false;
  previewClean=false;
  syncControls();
  rebuildLayers();
  scheduleRender();
  pushHistory();
  updateAddButtons();
}
function updateAddButtons(){
  const hasPhoto=!!photo;
  E.addBeak.disabled=!hasPhoto;
  E.addTie.disabled=!hasPhoto;
  E.addFeather.disabled=!hasPhoto;
  E.addBadge.disabled=!hasPhoto||objects.some(o=>o.type==='badge');
}
function deleteSelected(){
  const o=selectedObject();
  if(!o||o.locked)return;
  objects=objects.filter(x=>x.id!==o.id);
  selected='photo';
  warpModeActive=false;
  syncControls();
  rebuildLayers();
  scheduleRender();
  pushHistory();
  updateAddButtons();
}
function duplicateSelected(){
  const o=selectedObject();
  if(!o||o.locked||o.type==='badge')return;
  const copy=JSON.parse(JSON.stringify(o));
  copy.id=nextId++;
  copy.x=o.x+35;
  copy.y=o.y+35;
  copy.locked=false;
  objects.push(copy);
  selected=copy.id;
  warpModeActive=false;
  syncControls();
  rebuildLayers();
  scheduleRender();
  pushHistory();
}
function moveLayer(delta){
  const o=selectedObject();
  if(!o||o.locked)return;
  const i=objects.findIndex(x=>x.id===o.id),j=i+delta;
  if(j<0||j>=objects.length)return;
  [objects[i],objects[j]]=[objects[j],objects[i]];
  rebuildLayers();
  scheduleRender();
  pushHistory();
}
function resetWarpState(o){
  if(!o||o.type!=='beak')return;
  o.warp=freshWarp();
}
function resetSelected(){
  const o=selectedObject();
  if(!o||o.locked)return;
  o.scale=1;
  o.length=1;
  o.rotation=0;
  o.yaw=0;
  o.pitch=0;
  o.flip=false;
  resetWarpState(o);
  syncControls();
  scheduleRender();
  pushHistory();
}
function toggleObjectLock(){
  const o=selectedObject();
  if(!o)return;
  o.locked=!o.locked;
  if(o.locked)warpModeActive=false;
  syncControls();
  rebuildLayers();
  scheduleRender();
  pushHistory();
}
function nudge(dx,dy){
  const o=selectedObject();
  if(!o||o.locked)return;
  o.x=clamp(o.x+dx,-200,1280);
  o.y=clamp(o.y+dy,-200,1280);
  scheduleRender();
  pushHistory();
}
function centerSelected(){
  const o=selectedObject();
  if(!o||o.locked)return;
  o.x=540;o.y=540;
  scheduleRender();
  pushHistory();
}

function pointInPolygon(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    const hit=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x);
    if(hit)inside=!inside;
  }
  return inside;
}
function hitObject(p){
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i];
    if(o.type==='beak'){
      if(pointInPolygon(p,beakQuad(o)))return o;
      continue;
    }
    const d=objectDimensions(o);
    const rad=-o.rotation*Math.PI/180;
    const dx=p.x-o.x,dy=p.y-o.y;
    const rx=dx*Math.cos(rad)-dy*Math.sin(rad);
    const ry=dx*Math.sin(rad)+dy*Math.cos(rad);
    if(Math.abs(rx)<=d.w*.62&&Math.abs(ry)<=d.h*.62)return o;
  }
  return null;
}
function canvasPointFromEvent(e){
  const r=canvas.getBoundingClientRect();
  return{x:(e.clientX-r.left)*1080/r.width,y:(e.clientY-r.top)*1080/r.height};
}
function warpHandleHit(p,o){
  if(!warpModeActive||!o||o.type!=='beak'||o.locked)return null;
  const r=canvas.getBoundingClientRect();
  const hitRadius=Math.max(32,24*1080/Math.max(1,r.width));
  const q=beakQuad(o);
  const keys=['tl','tr','br','bl'];
  for(let i=0;i<q.length;i++){
    if(Math.hypot(p.x-q[i].x,p.y-q[i].y)<=hitRadius)return{index:i,key:keys[i]};
  }
  return null;
}
function pointerPair(){
  const a=[...pointers.values()];
  return a.length>=2?[a[0],a[1]]:null;
}
function pairMetrics(pair){
  const [a,b]=pair,dx=b.p.x-a.p.x,dy=b.p.y-a.p.y;
  return{
    distance:Math.max(1,Math.hypot(dx,dy)),
    angle:Math.atan2(dy,dx)*180/Math.PI,
    center:{x:(a.p.x+b.p.x)/2,y:(a.p.y+b.p.y)/2}
  };
}
function beginGesture(){
  const o=selectedObject(),pair=pointerPair();
  if(!o||o.locked||!pair||warpModeActive)return false;
  const m=pairMetrics(pair);
  gesture={
    objectId:o.id,startScale:o.scale,startRotation:o.rotation,
    startX:o.x,startY:o.y,startDistance:m.distance,startAngle:m.angle,startCenter:m.center
  };
  dragSession=null;
  gestureChanged=false;
  return true;
}
function endPointer(e){
  pointers.delete(e.pointerId);
  if(gesture){
    if(gestureChanged)pushHistory();
    gesture=null;
    gestureChanged=false;
    dragSession=null;
  }else if(dragSession&&dragSession.pointerId===e.pointerId){
    if(dragSession.moved)pushHistory();
    dragSession=null;
  }
  if(pointers.size>=2)beginGesture();
}

canvas.addEventListener('pointerdown',e=>{
  if(!photo||previewClean)return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  const p=canvasPointFromEvent(e);
  pointers.set(e.pointerId,{p});

  const current=selectedObject();
  const handle=warpHandleHit(p,current);
  if(handle){
    warpTarget=handle.key;
    updateWarpTargetButtons();
    syncWarpControls(current,false);
    dragSession={
      pointerId:e.pointerId,target:'warp-corner',id:current.id,corner:handle.index,
      start:p,last:p,moved:false
    };
    scheduleRender();
    return;
  }

  const hit=hitObject(p);
  if(hit){
    if(selected!==hit.id){
      selected=hit.id;
      if(hit.type!=='beak')warpModeActive=false;
      syncControls();
      rebuildLayers();
      scheduleRender();
    }
    if(!hit.locked&&!warpModeActive){
      dragSession={pointerId:e.pointerId,target:'object',id:hit.id,start:p,last:p,moved:false};
    }else{
      dragSession=null;
    }
  }else if(selected==='photo'&&!photoState.locked&&!warpModeActive){
    dragSession={pointerId:e.pointerId,target:'photo',start:p,last:p,moved:false};
  }else{
    dragSession=null;
  }
  if(pointers.size>=2)beginGesture();
});

canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||previewClean)return;
  e.preventDefault();
  const p=canvasPointFromEvent(e);
  pointers.get(e.pointerId).p=p;

  if(gesture&&pointers.size>=2){
    const o=objects.find(x=>x.id===gesture.objectId);
    if(!o||o.locked)return;
    const m=pairMetrics(pointerPair()),ratio=m.distance/gesture.startDistance;
    o.scale=clamp(gesture.startScale*ratio,.1,3);
    o.rotation=clamp(gesture.startRotation+angleDelta(m.angle,gesture.startAngle),-180,180);
    o.x=clamp(gesture.startX+(m.center.x-gesture.startCenter.x),-200,1280);
    o.y=clamp(gesture.startY+(m.center.y-gesture.startCenter.y),-200,1280);
    gestureChanged=true;
    updateTransformUi();
    scheduleRender();
    return;
  }
  if(!dragSession||dragSession.pointerId!==e.pointerId)return;

  const total=Math.hypot(p.x-dragSession.start.x,p.y-dragSession.start.y);
  if(!dragSession.moved&&total<8)return;
  dragSession.moved=true;
  const dx=p.x-dragSession.last.x,dy=p.y-dragSession.last.y;
  dragSession.last=p;

  if(dragSession.target==='photo'&&!photoState.locked){
    photoState.x+=dx;
    photoState.y+=dy;
    scheduleRender();
    return;
  }
  if(dragSession.target==='object'){
    const o=objects.find(x=>x.id===dragSession.id);
    if(o&&!o.locked){
      o.x=clamp(o.x+dx,-200,1280);
      o.y=clamp(o.y+dy,-200,1280);
      scheduleRender();
    }
    return;
  }
  if(dragSession.target==='warp-corner'){
    const o=objects.find(x=>x.id===dragSession.id);
    if(!o||o.locked||o.type!=='beak')return;
    ensureWarp(o);
    const d=objectDimensions(o);
    const rad=-o.rotation*Math.PI/180;
    const localDx=dx*Math.cos(rad)-dy*Math.sin(rad);
    const localDy=dx*Math.sin(rad)+dy*Math.cos(rad);
    const c=o.warp.corners[dragSession.corner];
    c.x=clamp(c.x+localDx/Math.max(1,d.w),-.42,.42);
    c.y=clamp(c.y+localDy/Math.max(1,d.h),-.42,.42);
    scheduleRender();
  }
});
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))endPointer(e);});

E.file.addEventListener('change',()=>{
  const f=E.file.files&&E.file.files[0];
  if(!f)return;
  if(!/^image\/(png|jpeg|webp)$/.test(f.type)){
    status('Choose a JPG, PNG, or WEBP image.');
    return;
  }
  if(f.size>30*1024*1024){
    status('Choose an image under 30 MB.');
    return;
  }
  if(photoUrl)URL.revokeObjectURL(photoUrl);
  photoUrl=URL.createObjectURL(f);
  const img=new Image();
  img.onload=()=>{
    photo=img;
    photoState={x:540,y:540,scale:1,locked:false};
    objects=[];
    selected='photo';
    nextId=1;
    history=[];
    future=[];
    previewClean=false;
    warpModeActive=false;
    E.empty.style.display='none';
    E.startOver.disabled=false;
    E.download.disabled=false;
    syncControls();
    rebuildLayers();
    updateAddButtons();
    scheduleRender();
    pushHistory();
    status('Image loaded. Position the photo, then start adding CHUMP parts.');
  };
  img.onerror=()=>status('Could not open that image.');
  img.src=photoUrl;
});
E.selectPhoto.addEventListener('click',()=>selectLayer('photo'));
E.lockPhoto.addEventListener('click',()=>{
  if(!photo)return;
  photoState.locked=!photoState.locked;
  syncControls();
  rebuildLayers();
  pushHistory();
});
E.photoScale.addEventListener('input',()=>{
  if(photoState.locked)return;
  photoState.scale=Number(E.photoScale.value)/100;
  E.photoScaleValue.textContent=`${E.photoScale.value}%`;
  scheduleRender();
});
E.photoScale.addEventListener('change',pushHistory);

E.addBeak.addEventListener('click',()=>addObject('beak'));
E.addTie.addEventListener('click',()=>addObject('tie'));
E.addFeather.addEventListener('click',()=>addObject('feather'));
E.addBadge.addEventListener('click',()=>addObject('badge'));

function bindRange(el,key,valueEl,converter,formatter){
  el.addEventListener('input',()=>{
    const o=selectedObject();
    if(!o||o.locked)return;
    o[key]=converter(el.value);
    valueEl.textContent=formatter(el.value);
    scheduleRender();
  });
  el.addEventListener('change',pushHistory);
}
bindRange(E.objectScale,'scale',E.objectScaleValue,v=>Number(v)/100,v=>`${v}%`);
bindRange(E.objectRotate,'rotation',E.objectRotateValue,v=>Number(v),v=>`${v}°`);
bindRange(E.objectYaw,'yaw',E.objectYawValue,v=>Number(v),v=>v);
bindRange(E.objectPitch,'pitch',E.objectPitchValue,v=>Number(v),v=>v);
bindRange(E.objectLength,'length',E.objectLengthValue,v=>Number(v)/100,v=>`${v}%`);

function stepInput(input,delta,apply){
  if(input.disabled)return;
  const min=Number(input.min),max=Number(input.max);
  input.value=clamp(Number(input.value)+delta,min,max);
  apply(input.value);
  pushHistory();
}
E.photoScaleMinus.addEventListener('click',()=>stepInput(E.photoScale,-5,v=>{
  photoState.scale=Number(v)/100;E.photoScaleValue.textContent=`${v}%`;scheduleRender();
}));
E.photoScalePlus.addEventListener('click',()=>stepInput(E.photoScale,5,v=>{
  photoState.scale=Number(v)/100;E.photoScaleValue.textContent=`${v}%`;scheduleRender();
}));
E.objectScaleMinus.addEventListener('click',()=>stepInput(E.objectScale,-5,v=>{
  const o=selectedObject();if(o){o.scale=Number(v)/100;E.objectScaleValue.textContent=`${v}%`;scheduleRender();}
}));
E.objectScalePlus.addEventListener('click',()=>stepInput(E.objectScale,5,v=>{
  const o=selectedObject();if(o){o.scale=Number(v)/100;E.objectScaleValue.textContent=`${v}%`;scheduleRender();}
}));
E.objectRotateMinus.addEventListener('click',()=>stepInput(E.objectRotate,-2,v=>{
  const o=selectedObject();if(o){o.rotation=Number(v);E.objectRotateValue.textContent=`${v}°`;scheduleRender();}
}));
E.objectRotatePlus.addEventListener('click',()=>stepInput(E.objectRotate,2,v=>{
  const o=selectedObject();if(o){o.rotation=Number(v);E.objectRotateValue.textContent=`${v}°`;scheduleRender();}
}));
E.objectLengthMinus.addEventListener('click',()=>stepInput(E.objectLength,-5,v=>{
  const o=selectedObject();if(o){o.length=Number(v)/100;E.objectLengthValue.textContent=`${v}%`;scheduleRender();}
}));
E.objectLengthPlus.addEventListener('click',()=>stepInput(E.objectLength,5,v=>{
  const o=selectedObject();if(o){o.length=Number(v)/100;E.objectLengthValue.textContent=`${v}%`;scheduleRender();}
}));

E.warpMode.addEventListener('click',()=>{
  const o=selectedObject();
  if(!o||o.type!=='beak'||o.locked)return;
  warpModeActive=!warpModeActive;
  syncControls();
  scheduleRender();
});
E.warpTargetButtons.addEventListener('click',e=>{
  const b=e.target.closest('button[data-warp-target]');
  const o=selectedObject();
  if(!b||!o||o.type!=='beak'||o.locked)return;
  warpTarget=b.dataset.warpTarget;
  updateWarpTargetButtons();
  E.warpDepth.value=warpDepthForTarget(o);
  E.warpDepthValue.textContent=E.warpDepth.value;
  scheduleRender();
});
function setWarpDepthValue(value){
  const o=selectedObject();
  if(!o||o.type!=='beak'||o.locked)return;
  ensureWarp(o);
  const v=clamp(Number(value),-100,100);
  for(const i of warpTargetIndices())o.warp.corners[i].z=v;
  E.warpDepth.value=v;
  E.warpDepthValue.textContent=`${Math.round(v)}`;
  scheduleRender();
}
E.warpDepth.addEventListener('input',()=>setWarpDepthValue(E.warpDepth.value));
E.warpDepth.addEventListener('change',pushHistory);
E.warpForward.addEventListener('click',()=>{
  const o=selectedObject();if(!o||o.type!=='beak'||o.locked)return;
  setWarpDepthValue(warpDepthForTarget(o)-5);pushHistory();
});
E.warpBack.addEventListener('click',()=>{
  const o=selectedObject();if(!o||o.type!=='beak'||o.locked)return;
  setWarpDepthValue(warpDepthForTarget(o)+5);pushHistory();
});
E.resetWarp.addEventListener('click',()=>{
  const o=selectedObject();
  if(!o||o.type!=='beak'||o.locked)return;
  resetWarpState(o);
  o.yaw=0;o.pitch=0;
  syncControls();
  scheduleRender();
  pushHistory();
});

E.objectFlip.addEventListener('change',()=>{
  const o=selectedObject();
  if(!o||o.locked)return;
  o.flip=E.objectFlip.checked;
  scheduleRender();
  pushHistory();
});
E.lockObject.addEventListener('click',toggleObjectLock);
E.duplicate.addEventListener('click',duplicateSelected);
E.moveForward.addEventListener('click',()=>moveLayer(1));
E.moveBack.addEventListener('click',()=>moveLayer(-1));
E.resetObject.addEventListener('click',resetSelected);
E.deleteObject.addEventListener('click',deleteSelected);
E.nudgeUp.addEventListener('click',()=>nudge(0,-12));
E.nudgeDown.addEventListener('click',()=>nudge(0,12));
E.nudgeLeft.addEventListener('click',()=>nudge(-12,0));
E.nudgeRight.addEventListener('click',()=>nudge(12,0));
E.centerObject.addEventListener('click',centerSelected);

E.undo.addEventListener('click',()=>{
  if(history.length<=1)return;
  future.push(history.pop());
  restoreSnapshot(history[history.length-1]);
  updateHistoryButtons();
});
E.redo.addEventListener('click',()=>{
  if(!future.length)return;
  const s=future.pop();
  history.push(s);
  restoreSnapshot(s);
  updateHistoryButtons();
});

function setMode(mode){
  outputMode=mode;
  previewClean=false;
  warpModeActive=false;
  E.postMode.classList.toggle('active',mode==='post');
  E.pfpMode.classList.toggle('active',mode==='pfp');
  if(mode==='pfp'){
    E.stageNote.textContent='X PFP safe-area preview • 400 × 400 export';
    E.outputNote.textContent='The circle is an editing guide only. X receives a square 400 × 400 image.';
    E.download.textContent='DOWNLOAD X PFP 400 × 400';
  }else{
    E.stageNote.textContent='Square post preview • 1080 × 1080 export';
    E.outputNote.textContent='Optimized for an X post, reply, or general square image.';
    E.download.textContent='DOWNLOAD 1080 × 1080';
  }
  syncControls();
  scheduleRender();
}
E.postMode.addEventListener('click',()=>setMode('post'));
E.pfpMode.addEventListener('click',()=>setMode('pfp'));
E.previewFinal.addEventListener('click',()=>{
  if(!photo)return;
  previewClean=!previewClean;
  if(previewClean)warpModeActive=false;
  syncControls();
  scheduleRender();
  status(previewClean?'Final preview: editing gestures are paused.':'Back to editing.');
});

function triggerDownload(blob,name){
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=name;a.rel='noopener';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),2500);
}
function exportCanvas(size){
  const out=document.createElement('canvas');
  out.width=out.height=size;
  const c=out.getContext('2d');
  c.save();
  c.scale(size/1080,size/1080);
  const wasPreview=previewClean,wasWarp=warpModeActive;
  previewClean=true;warpModeActive=false;
  drawScene(c,{guides:false});
  previewClean=wasPreview;warpModeActive=wasWarp;
  c.restore();
  return out;
}
E.download.addEventListener('click',()=>{
  if(!photo)return;
  const size=outputMode==='pfp'?400:1080;
  const out=exportCanvas(size);
  out.toBlob(blob=>{
    if(!blob){status('Could not create the finished image.');return;}
    if(outputMode==='pfp'&&blob.size>2*1024*1024){
      out.toBlob(jpg=>{
        if(!jpg){status('Could not create the finished image.');return;}
        triggerDownload(jpg,'chumped-up-x-pfp-400.jpg');
        status(`X PFP downloaded • ${(jpg.size/1024/1024).toFixed(2)} MB`);
      },'image/jpeg',.92);
      return;
    }
    const name=outputMode==='pfp'?'chumped-up-x-pfp-400.png':'chumped-up-post-1080.png';
    triggerDownload(blob,name);
    status(`${outputMode==='pfp'?'X PFP':'Square image'} downloaded • ${(blob.size/1024/1024).toFixed(2)} MB`);
  },'image/png');
});
E.startOver.addEventListener('click',()=>{
  if(photoUrl)URL.revokeObjectURL(photoUrl);
  photoUrl=null;photo=null;
  photoState={x:540,y:540,scale:1,locked:false};
  objects=[];selected='photo';nextId=1;
  history=[];future=[];previewClean=false;warpModeActive=false;
  pointers.clear();gesture=null;dragSession=null;
  E.file.value='';
  E.empty.style.display='grid';
  E.startOver.disabled=true;
  E.download.disabled=true;
  syncControls();
  rebuildLayers();
  updateAddButtons();
  scheduleRender();
  updateHistoryButtons();
  status('Ready.');
});

syncControls();
rebuildLayers();
updateAddButtons();
updateHistoryButtons();
render();
})();
