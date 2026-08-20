(()=>{
'use strict';

const $=id=>document.getElementById(id);
const canvas=$('editor');
const ctx=canvas.getContext('2d');
const E={
  file:$('fileInput'), empty:$('emptyState'), selectPhoto:$('selectPhoto'), lockPhoto:$('lockPhoto'),
  photoScale:$('photoScale'), photoScaleValue:$('photoScaleValue'), addBeak:$('addBeak'), addTie:$('addTie'),
  addFeather:$('addFeather'), addBadge:$('addBadge'), undo:$('undo'), redo:$('redo'), layerList:$('layerList'),
  stylePanel:$('stylePanel'), styleButtons:$('styleButtons'), objectScale:$('objectScale'), objectScaleValue:$('objectScaleValue'),
  lengthPanel:$('lengthPanel'), objectLength:$('objectLength'), objectLengthValue:$('objectLengthValue'),
  objectRotate:$('objectRotate'), objectRotateValue:$('objectRotateValue'), objectYaw:$('objectYaw'), objectYawValue:$('objectYawValue'),
  objectPitch:$('objectPitch'), objectPitchValue:$('objectPitchValue'), objectFlip:$('objectFlip'), duplicate:$('duplicate'),
  moveForward:$('moveForward'), moveBack:$('moveBack'), resetObject:$('resetObject'), deleteObject:$('deleteObject'),
  download:$('download'), startOver:$('startOver'), status:$('status'), postMode:$('postMode'), pfpMode:$('pfpMode'),
  stageNote:$('stageNote'), outputNote:$('outputNote')
};

const assetSources={
  'beak-closed':'assets/beak-closed.png',
  'beak-open':'assets/beak-open.png',
  'tie-straight':'assets/tie-straight.png',
  'tie-flying':'assets/tie-flying.png',
  'feather-orange':'assets/feather-orange.png',
  'feather-green':'assets/feather-green.png',
  'badge':'assets/plus1-chump.png'
};
const assets={};
for(const [key,src] of Object.entries(assetSources)){
  const img=new Image(); img.decoding='async'; img.src=src; assets[key]=img;
}

const styleMap={
  beak:[['closed','CLOSED'],['open','OPEN']],
  tie:[['straight','STRAIGHT'],['flying','FLYING']],
  feather:[['orange','ORANGE'],['green','GREEN']],
  badge:[]
};
const baseSize={beak:355,tie:315,feather:235,badge:560};

let photo=null;
let photoUrl=null;
let outputMode='post';
let photoState={x:540,y:540,scale:1,locked:false};
let objects=[];
let selected='photo';
let nextId=1;
let history=[];
let future=[];
let dragging=false;
let lastPoint={x:0,y:0};
let framePending=false;
let gestureChanged=false;

function status(text){E.status.textContent=text;}
function imageReady(img){return img.complete && img.naturalWidth>0;}
function selectedObject(){return typeof selected==='number'?objects.find(o=>o.id===selected)||null:null;}
function objectAssetKey(o){return o.type==='badge'?'badge':`${o.type}-${o.style}`;}
function objectImage(o){return assets[objectAssetKey(o)];}
function snapshot(){return JSON.stringify({photoState,objects,selected,nextId});}
function pushHistory(){
  const s=snapshot();
  if(history.at(-1)!==s)history.push(s);
  if(history.length>50)history.shift();
  future=[]; updateHistoryButtons();
}
function restoreSnapshot(s){
  const v=JSON.parse(s); photoState=v.photoState; objects=v.objects; selected=v.selected; nextId=v.nextId;
  syncControls(); rebuildLayers(); render();
}
function updateHistoryButtons(){E.undo.disabled=history.length<=1;E.redo.disabled=future.length===0;}

function scheduleRender(){
  if(framePending)return; framePending=true;
  requestAnimationFrame(()=>{framePending=false;render();});
}

function objectDimensions(o){
  const img=objectImage(o);
  if(!imageReady(img))return {w:1,h:1};
  const w=baseSize[o.type]*o.scale;
  const length=o.type==='tie'?o.length:1;
  return {w,h:w*(img.naturalHeight/img.naturalWidth)*length};
}

function drawPhoto(target){
  if(!photo)return;
  const cover=Math.max(1080/photo.naturalWidth,1080/photo.naturalHeight);
  const s=cover*photoState.scale;
  const w=photo.naturalWidth*s, h=photo.naturalHeight*s;
  target.drawImage(photo,photoState.x-w/2,photoState.y-h/2,w,h);
}

function drawObject(target,o){
  const img=objectImage(o); if(!imageReady(img))return;
  const d=objectDimensions(o);
  const yaw=Math.max(-70,Math.min(70,o.yaw));
  const pitch=Math.max(-70,Math.min(70,o.pitch));
  const xCompress=1-(Math.abs(yaw)/70)*0.34;
  const yCompress=1-(Math.abs(pitch)/70)*0.30;
  const shearX=Math.tan(yaw*0.28*Math.PI/180);
  const shearY=Math.tan(pitch*0.22*Math.PI/180);

  target.save();
  target.translate(o.x,o.y);
  target.rotate(o.rotation*Math.PI/180);
  target.scale((o.flip?-1:1)*xCompress,yCompress);
  target.transform(1,shearY,shearX,1,0,0);
  target.drawImage(img,-d.w/2,-d.h/2,d.w,d.h);
  target.restore();
}

function drawSelectionGuide(target,o){
  const d=objectDimensions(o);
  target.save();
  target.translate(o.x,o.y);
  target.rotate(o.rotation*Math.PI/180);
  target.strokeStyle='rgba(202,255,0,.95)';
  target.lineWidth=3;
  target.setLineDash([11,8]);
  target.strokeRect(-d.w/2-10,-d.h/2-10,d.w+20,d.h+20);
  target.setLineDash([]);
  target.fillStyle='#caff00';
  target.beginPath();target.arc(0,0,6,0,Math.PI*2);target.fill();
  target.restore();
}

function drawPfpGuide(target){
  target.save();
  target.fillStyle='rgba(0,0,0,.48)';
  target.beginPath();target.rect(0,0,1080,1080);target.arc(540,540,528,0,Math.PI*2,true);target.fill('evenodd');
  target.strokeStyle='rgba(202,255,0,.95)';target.lineWidth=4;
  target.beginPath();target.arc(540,540,528,0,Math.PI*2);target.stroke();
  target.restore();
}

function drawScene(target,{guides=true}={}){
  target.clearRect(0,0,1080,1080);target.fillStyle='#05070b';target.fillRect(0,0,1080,1080);
  drawPhoto(target);
  for(const o of objects)drawObject(target,o);
  if(guides){
    const o=selectedObject(); if(o)drawSelectionGuide(target,o);
    if(outputMode==='pfp')drawPfpGuide(target);
  }
}
function render(){drawScene(ctx,{guides:true});}

function layerLabel(o){
  const style=o.type==='badge'?'':` • ${String(o.style).toUpperCase()}`;
  return `${o.type.toUpperCase()}${style}`;
}
function rebuildLayers(){
  E.layerList.innerHTML='';
  const p=document.createElement('button');p.type='button';p.className='layer'+(selected==='photo'?' active':'');
  p.innerHTML=`<span>PHOTO</span><small>${photoState.locked?'LOCKED':'MOVE + SIZE'}</small>`;
  p.addEventListener('click',()=>selectLayer('photo'));E.layerList.appendChild(p);
  objects.forEach((o,i)=>{
    const b=document.createElement('button');b.type='button';b.className='layer'+(selected===o.id?' active':'');
    b.innerHTML=`<span>${i+1}. ${layerLabel(o)}</span><small>EDIT</small>`;
    b.addEventListener('click',()=>selectLayer(o.id));E.layerList.appendChild(b);
  });
}
function selectLayer(v){selected=v;syncControls();rebuildLayers();scheduleRender();}

function rebuildStyleButtons(o){
  E.styleButtons.innerHTML='';
  const styles=styleMap[o.type]||[];
  E.stylePanel.hidden=styles.length===0;
  for(const [value,label] of styles){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.classList.toggle('active',o.style===value);
    b.addEventListener('click',()=>{o.style=value;syncControls();scheduleRender();pushHistory();});
    E.styleButtons.appendChild(b);
  }
}
function syncControls(){
  E.photoScale.value=Math.round(photoState.scale*100);E.photoScaleValue.textContent=`${Math.round(photoState.scale*100)}%`;
  E.lockPhoto.textContent=photoState.locked?'UNLOCK PHOTO':'LOCK PHOTO';
  E.selectPhoto.disabled=!photo;E.lockPhoto.disabled=!photo;E.photoScale.disabled=!photo;

  const o=selectedObject();
  const controls=[E.objectScale,E.objectRotate,E.objectYaw,E.objectPitch,E.objectFlip,E.moveForward,E.moveBack,E.resetObject,E.deleteObject];
  controls.forEach(el=>el.disabled=!o);
  E.duplicate.disabled=!o||o.type==='badge';
  E.lengthPanel.hidden=!(o&&o.type==='tie');
  E.stylePanel.hidden=true;E.styleButtons.innerHTML='';

  if(!o){
    E.objectScaleValue.textContent=E.objectRotateValue.textContent=E.objectYawValue.textContent=E.objectPitchValue.textContent='—';
    status(selected==='photo'?(photoState.locked?'Photo locked.':'Photo selected. Drag to reposition.'):'Ready.');
    return;
  }
  rebuildStyleButtons(o);
  E.objectScale.value=Math.round(o.scale*100);E.objectScaleValue.textContent=`${Math.round(o.scale*100)}%`;
  E.objectRotate.value=o.rotation;E.objectRotateValue.textContent=`${Math.round(o.rotation)}°`;
  E.objectYaw.value=o.yaw;E.objectYawValue.textContent=Math.round(o.yaw);
  E.objectPitch.value=o.pitch;E.objectPitchValue.textContent=Math.round(o.pitch);
  E.objectFlip.checked=o.flip;
  if(o.type==='tie'){
    E.objectLength.disabled=false;E.objectLength.value=Math.round(o.length*100);E.objectLengthValue.textContent=`${Math.round(o.length*100)}%`;
  }else E.objectLength.disabled=true;
  status(`${o.type.toUpperCase()} selected. Drag it directly on the image.`);
}

function addObject(type){
  if(!photo)return;
  if(type==='badge'&&objects.some(o=>o.type==='badge')){status('Only one +1 badge is used per image.');return;}
  if(objects.length>=30){status('Maximum 30 CHUMP objects per image.');return;}
  const defaults={beak:'closed',tie:'straight',feather:'orange',badge:null};
  const count=objects.filter(o=>o.type===type).length;
  const o={id:nextId++,type,style:defaults[type],x:540+((count%5)-2)*34,y:type==='tie'?520:type==='badge'?805:type==='feather'?300:445,scale:1,length:1,rotation:0,yaw:0,pitch:0,flip:false};
  objects.push(o);selected=o.id;syncControls();rebuildLayers();scheduleRender();pushHistory();updateAddButtons();
}
function updateAddButtons(){
  const hasPhoto=!!photo;E.addBeak.disabled=!hasPhoto;E.addTie.disabled=!hasPhoto;E.addFeather.disabled=!hasPhoto;
  E.addBadge.disabled=!hasPhoto||objects.some(o=>o.type==='badge');
}
function deleteSelected(){
  const o=selectedObject();if(!o)return;
  objects=objects.filter(x=>x.id!==o.id);selected='photo';syncControls();rebuildLayers();scheduleRender();pushHistory();updateAddButtons();
}
function duplicateSelected(){
  const o=selectedObject();if(!o||o.type==='badge')return;
  const copy={...o,id:nextId++,x:o.x+35,y:o.y+35};objects.push(copy);selected=copy.id;syncControls();rebuildLayers();scheduleRender();pushHistory();
}
function moveLayer(delta){
  const o=selectedObject();if(!o)return;
  const i=objects.findIndex(x=>x.id===o.id),j=i+delta;if(j<0||j>=objects.length)return;
  [objects[i],objects[j]]=[objects[j],objects[i]];rebuildLayers();scheduleRender();pushHistory();
}
function resetSelected(){
  const o=selectedObject();if(!o)return;
  o.scale=1;o.length=1;o.rotation=0;o.yaw=0;o.pitch=0;o.flip=false;syncControls();scheduleRender();pushHistory();
}

function canvasPoint(e){
  const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*1080/r.width,y:(e.clientY-r.top)*1080/r.height};
}
function hitObject(p){
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i],d=objectDimensions(o);
    if(Math.abs(p.x-o.x)<=d.w*.68&&Math.abs(p.y-o.y)<=d.h*.68)return o;
  }
  return null;
}

E.file.addEventListener('change',()=>{
  const f=E.file.files&&E.file.files[0];if(!f)return;
  if(!/^image\/(png|jpeg|webp)$/.test(f.type)){status('Choose a JPG, PNG, or WEBP image.');return;}
  if(f.size>30*1024*1024){status('Choose an image under 30 MB.');return;}
  if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(f);
  const img=new Image();img.onload=()=>{
    photo=img;photoState={x:540,y:540,scale:1,locked:false};objects=[];selected='photo';nextId=1;history=[];future=[];
    E.empty.style.display='none';E.startOver.disabled=false;E.download.disabled=false;syncControls();rebuildLayers();updateAddButtons();scheduleRender();pushHistory();status('Image loaded. Position the photo, then start adding CHUMP parts.');
  };img.onerror=()=>status('Could not open that image.');img.src=photoUrl;
});

E.selectPhoto.addEventListener('click',()=>selectLayer('photo'));
E.lockPhoto.addEventListener('click',()=>{if(!photo)return;photoState.locked=!photoState.locked;syncControls();rebuildLayers();pushHistory();});
E.photoScale.addEventListener('input',()=>{photoState.scale=Number(E.photoScale.value)/100;E.photoScaleValue.textContent=`${E.photoScale.value}%`;scheduleRender();});
E.photoScale.addEventListener('change',pushHistory);
E.addBeak.addEventListener('click',()=>addObject('beak'));
E.addTie.addEventListener('click',()=>addObject('tie'));
E.addFeather.addEventListener('click',()=>addObject('feather'));
E.addBadge.addEventListener('click',()=>addObject('badge'));

function bindRange(el,key,valueEl,converter,formatter){
  el.addEventListener('input',()=>{const o=selectedObject();if(!o)return;o[key]=converter(el.value);valueEl.textContent=formatter(el.value);scheduleRender();});
  el.addEventListener('change',pushHistory);
}
bindRange(E.objectScale,'scale',E.objectScaleValue,v=>Number(v)/100,v=>`${v}%`);
bindRange(E.objectRotate,'rotation',E.objectRotateValue,v=>Number(v),v=>`${v}°`);
bindRange(E.objectYaw,'yaw',E.objectYawValue,v=>Number(v),v=>v);
bindRange(E.objectPitch,'pitch',E.objectPitchValue,v=>Number(v),v=>v);
bindRange(E.objectLength,'length',E.objectLengthValue,v=>Number(v)/100,v=>`${v}%`);
E.objectFlip.addEventListener('change',()=>{const o=selectedObject();if(!o)return;o.flip=E.objectFlip.checked;scheduleRender();pushHistory();});
E.duplicate.addEventListener('click',duplicateSelected);E.moveForward.addEventListener('click',()=>moveLayer(1));E.moveBack.addEventListener('click',()=>moveLayer(-1));E.resetObject.addEventListener('click',resetSelected);E.deleteObject.addEventListener('click',deleteSelected);

E.undo.addEventListener('click',()=>{
  if(history.length<=1)return;future.push(history.pop());restoreSnapshot(history.at(-1));updateHistoryButtons();updateAddButtons();
});
E.redo.addEventListener('click',()=>{
  if(!future.length)return;const s=future.pop();history.push(s);restoreSnapshot(s);updateHistoryButtons();updateAddButtons();
});

canvas.addEventListener('pointerdown',e=>{
  if(!photo)return;const p=canvasPoint(e),hit=hitObject(p);if(hit)selectLayer(hit.id);
  dragging=true;gestureChanged=false;lastPoint=p;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(!dragging)return;const p=canvasPoint(e),dx=p.x-lastPoint.x,dy=p.y-lastPoint.y,o=selectedObject();
  if(o){o.x+=dx;o.y+=dy;gestureChanged=true;}
  else if(selected==='photo'&&!photoState.locked){photoState.x+=dx;photoState.y+=dy;gestureChanged=true;}
  lastPoint=p;scheduleRender();
});
function endDrag(){if(!dragging)return;dragging=false;if(gestureChanged)pushHistory();gestureChanged=false;}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);

function setMode(mode){
  outputMode=mode;E.postMode.classList.toggle('active',mode==='post');E.pfpMode.classList.toggle('active',mode==='pfp');
  if(mode==='pfp'){
    E.stageNote.textContent='X PFP safe-area preview • 400 × 400 export';E.outputNote.textContent='The circle is only a preview. X receives a square 400 × 400 image.';E.download.textContent='DOWNLOAD X PFP 400 × 400';
  }else{
    E.stageNote.textContent='Square post preview • 1080 × 1080 export';E.outputNote.textContent='Optimized for an X post, reply, or general square image.';E.download.textContent='DOWNLOAD 1080 × 1080';
  }
  scheduleRender();
}
E.postMode.addEventListener('click',()=>setMode('post'));E.pfpMode.addEventListener('click',()=>setMode('pfp'));

function exportCanvas(size){
  const out=document.createElement('canvas');out.width=size;out.height=size;const ox=out.getContext('2d');ox.scale(size/1080,size/1080);drawScene(ox,{guides:false});return out;
}
function triggerDownload(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
E.download.addEventListener('click',()=>{
  if(!photo)return;
  const size=outputMode==='pfp'?400:1080,out=exportCanvas(size);
  out.toBlob(blob=>{
    if(!blob){status('Could not create the image.');return;}
    if(outputMode==='pfp'&&blob.size>2*1024*1024){
      out.toBlob(jpg=>{if(!jpg)return;triggerDownload(jpg,'chumped-up-x-pfp-400.jpg');status(`X PFP downloaded • ${(jpg.size/1024/1024).toFixed(2)} MB`);},'image/jpeg',.92);
      return;
    }
    const name=outputMode==='pfp'?'chumped-up-x-pfp-400.png':'chumped-up-post-1080.png';triggerDownload(blob,name);status(`${outputMode==='pfp'?'X PFP':'Square image'} downloaded • ${(blob.size/1024/1024).toFixed(2)} MB`);
  },'image/png');
});
E.startOver.addEventListener('click',()=>location.reload());

for(const img of Object.values(assets))img.addEventListener('load',scheduleRender);
rebuildLayers();syncControls();updateAddButtons();updateHistoryButtons();setMode('post');render();
})();
