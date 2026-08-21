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
  objectFlip:$('objectFlip'),duplicate:$('duplicate'),moveForward:$('moveForward'),moveBack:$('moveBack'),resetObject:$('resetObject'),deleteObject:$('deleteObject'),
  nudgeUp:$('nudgeUp'),nudgeDown:$('nudgeDown'),nudgeLeft:$('nudgeLeft'),nudgeRight:$('nudgeRight'),centerObject:$('centerObject'),
  previewFinal:$('previewFinal'),download:$('download'),startOver:$('startOver'),status:$('status'),postMode:$('postMode'),pfpMode:$('pfpMode'),stageNote:$('stageNote'),outputNote:$('outputNote')
};

const assetSources={
  'beak-closed':'assets/beak-closed.png?v=20260820t','beak-open':'assets/beak-open.png?v=20260820t',
  'beak-squawk':'assets/beak-squawk.png?v=20260820t','beak-pursed':'assets/beak-pursed.png?v=20260820t',
  'tie-straight':'assets/tie-straight.png','tie-flying':'assets/tie-flying.png',
  'feather-orange':'assets/feather-orange.png','feather-green':'assets/feather-green.png',
  badge:'assets/plus1-chump.png'
};
const assets={};
const styleMap={beak:[['closed','CLOSED'],['open','OPEN'],['squawk','SQUAWK'],['pursed','PURSED']],tie:[['straight','STRAIGHT'],['flying','FLYING']],feather:[['orange','ORANGE'],['green','GREEN']],badge:[]};
const baseSize={beak:355,tie:315,feather:235,badge:560};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(a,b)=>{let d=a-b;while(d>180)d-=360;while(d<-180)d+=360;return d;};

function cleanBeakAsset(img){
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
  const data=x.getImageData(0,0,c.width,c.height),p=data.data;
  for(let i=0;i<p.length;i+=4){
    const a=p[i+3];if(a<=16){p[i+3]=0;continue;}
    const r=p[i],g=p[i+1],b=p[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=hi?(hi-lo)/hi:0;
    p[i+3]=(sat>.10||hi<150)?255:0;
  }
  x.clearRect(0,0,c.width,c.height);x.putImageData(data,0,0);return c;
}
for(const [key,src] of Object.entries(assetSources)){
  const img=new Image();img.decoding='async';assets[key]=img;
  img.onload=()=>{assets[key]=key.startsWith('beak-')?cleanBeakAsset(img):img;scheduleRender();};
  img.src=src;
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
const pointers=new Map();

function status(text){E.status.textContent=text;}
function mediaWidth(img){return img?(img.naturalWidth||img.width||0):0;}
function mediaHeight(img){return img?(img.naturalHeight||img.height||0):0;}
function imageReady(img){return mediaWidth(img)>0&&mediaHeight(img)>0;}
function selectedObject(){return typeof selected==='number'?objects.find(o=>o.id===selected)||null:null;}
function objectAssetKey(o){return o.type==='badge'?'badge':`${o.type}-${o.style}`;}
function objectImage(o){return assets[objectAssetKey(o)];}
function snapshot(){return JSON.stringify({photoState,objects,selected,nextId});}
function pushHistory(){
  if(!photo)return;
  const s=snapshot();
  if(history[history.length-1]!==s)history.push(s);
  if(history.length>60)history.shift();
  future=[];updateHistoryButtons();
}
function restoreSnapshot(s){
  const v=JSON.parse(s);photoState=v.photoState;objects=v.objects;selected=v.selected;nextId=v.nextId;
  syncControls();rebuildLayers();render();updateAddButtons();
}
function updateHistoryButtons(){E.undo.disabled=history.length<=1;E.redo.disabled=future.length===0;}
function scheduleRender(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;render();});}

function objectDimensions(o){
  const img=objectImage(o);if(!imageReady(img))return{w:1,h:1};
  const w=baseSize[o.type]*o.scale,length=o.type==='tie'?o.length:1,iw=mediaWidth(img),ih=mediaHeight(img);
  return{w,h:w*(ih/iw)*length};
}
function drawPhoto(target){
  if(!photo)return;
  const cover=Math.max(1080/photo.naturalWidth,1080/photo.naturalHeight);const s=cover*photoState.scale;
  const w=photo.naturalWidth*s,h=photo.naturalHeight*s;target.drawImage(photo,photoState.x-w/2,photoState.y-h/2,w,h);
}
function drawObject(target,o){
  const img=objectImage(o);if(!imageReady(img))return;
  const d=objectDimensions(o),yaw=clamp(o.yaw,-70,70),pitch=clamp(o.pitch,-70,70);
  const xCompress=1-(Math.abs(yaw)/70)*.34,yCompress=1-(Math.abs(pitch)/70)*.30;
  const shearX=Math.tan(yaw*.28*Math.PI/180),shearY=Math.tan(pitch*.22*Math.PI/180);
  target.save();target.translate(o.x,o.y);target.rotate(o.rotation*Math.PI/180);target.scale((o.flip?-1:1)*xCompress,yCompress);target.transform(1,shearY,shearX,1,0,0);target.drawImage(img,-d.w/2,-d.h/2,d.w,d.h);target.restore();
}
function drawSelectionGuide(target,o){
  const d=objectDimensions(o);target.save();target.translate(o.x,o.y);target.rotate(o.rotation*Math.PI/180);
  target.strokeStyle=o.locked?'rgba(202,255,0,.45)':'rgba(202,255,0,.95)';target.lineWidth=3;target.setLineDash(o.locked?[5,9]:[11,8]);
  target.strokeRect(-d.w/2-10,-d.h/2-10,d.w+20,d.h+20);target.setLineDash([]);
  target.fillStyle=o.locked?'#7b8b39':'#caff00';target.beginPath();target.arc(0,0,6,0,Math.PI*2);target.fill();target.restore();
}
function drawPfpGuide(target){
  target.save();target.fillStyle='rgba(0,0,0,.48)';target.beginPath();target.rect(0,0,1080,1080);target.arc(540,540,528,0,Math.PI*2,true);target.fill('evenodd');
  target.strokeStyle='rgba(202,255,0,.95)';target.lineWidth=4;target.beginPath();target.arc(540,540,528,0,Math.PI*2);target.stroke();target.restore();
}
function drawScene(target,{guides=true}={}){
  target.clearRect(0,0,1080,1080);target.fillStyle='#05070b';target.fillRect(0,0,1080,1080);drawPhoto(target);for(const o of objects)drawObject(target,o);
  if(guides&&!previewClean){const o=selectedObject();if(o)drawSelectionGuide(target,o);if(outputMode==='pfp')drawPfpGuide(target);}
}
function render(){drawScene(ctx,{guides:true});canvas.classList.toggle('preview-mode',previewClean);}

function layerLabel(o){const style=o.type==='badge'?'':` • ${String(o.style).toUpperCase()}`;return`${o.type.toUpperCase()}${style}`;}
function rebuildLayers(){
  E.layerList.innerHTML='';
  const p=document.createElement('button');p.type='button';p.className='layer'+(selected==='photo'?' active':'')+(photoState.locked?' locked':'');
  p.innerHTML=`<span>PHOTO</span><small>${photoState.locked?'LOCKED':'MOVE + SIZE'}</small>`;p.addEventListener('click',()=>selectLayer('photo'));E.layerList.appendChild(p);
  objects.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.className='layer'+(selected===o.id?' active':'')+(o.locked?' locked':'');b.innerHTML=`<span>${i+1}. ${layerLabel(o)}</span><small>${o.locked?'LOCKED':'EDIT'}</small>`;b.addEventListener('click',()=>selectLayer(o.id));E.layerList.appendChild(b);});
}
function selectLayer(v){selected=v;previewClean=false;syncControls();rebuildLayers();scheduleRender();}
function rebuildStyleButtons(o){
  E.styleButtons.innerHTML='';const styles=styleMap[o.type]||[];E.stylePanel.hidden=styles.length===0;
  for(const [value,label] of styles){const b=document.createElement('button');b.type='button';b.textContent=label;b.classList.toggle('active',o.style===value);b.disabled=!!o.locked;b.addEventListener('click',()=>{if(o.locked)return;o.style=value;syncControls();scheduleRender();pushHistory();});E.styleButtons.appendChild(b);}
}
function setDisabled(elements,value){elements.forEach(el=>{if(el)el.disabled=value;});}
function syncControls(){
  const hasPhoto=!!photo;const photoLocked=!hasPhoto||photoState.locked;
  E.photoScale.value=Math.round(photoState.scale*100);E.photoScaleValue.textContent=`${Math.round(photoState.scale*100)}%`;E.lockPhoto.textContent=photoState.locked?'UNLOCK PHOTO':'LOCK PHOTO';
  E.selectPhoto.disabled=!hasPhoto;E.lockPhoto.disabled=!hasPhoto;setDisabled([E.photoScale,E.photoScaleMinus,E.photoScalePlus],photoLocked);
  E.previewFinal.disabled=!hasPhoto;E.previewFinal.textContent=previewClean?'BACK TO EDIT':'PREVIEW FINAL';E.previewFinal.classList.toggle('active',previewClean);

  const o=selectedObject(),locked=!o||o.locked;
  E.lockObject.disabled=!o;E.lockObject.textContent=o&&o.locked?'UNLOCK':'LOCK';E.lockObject.classList.toggle('active',!!(o&&o.locked));
  setDisabled([E.objectScale,E.objectScaleMinus,E.objectScalePlus,E.objectRotate,E.objectRotateMinus,E.objectRotatePlus,E.objectYaw,E.objectPitch,E.objectFlip,E.moveForward,E.moveBack,E.resetObject,E.deleteObject,E.nudgeUp,E.nudgeDown,E.nudgeLeft,E.nudgeRight,E.centerObject],locked);
  E.duplicate.disabled=locked||!o||o.type==='badge';E.lengthPanel.hidden=!(o&&o.type==='tie');E.stylePanel.hidden=true;E.styleButtons.innerHTML='';
  setDisabled([E.objectLength,E.objectLengthMinus,E.objectLengthPlus],locked||!(o&&o.type==='tie'));

  if(!o){
    E.objectScaleValue.textContent=E.objectRotateValue.textContent=E.objectYawValue.textContent=E.objectPitchValue.textContent='—';
    status(selected==='photo'?(photoState.locked?'Photo locked.':'Photo selected. Drag inside the image to reposition.'):'Ready.');return;
  }
  rebuildStyleButtons(o);E.objectScale.value=Math.round(o.scale*100);E.objectScaleValue.textContent=`${Math.round(o.scale*100)}%`;
  E.objectRotate.value=Math.round(o.rotation);E.objectRotateValue.textContent=`${Math.round(o.rotation)}°`;E.objectYaw.value=o.yaw;E.objectYawValue.textContent=Math.round(o.yaw);E.objectPitch.value=o.pitch;E.objectPitchValue.textContent=Math.round(o.pitch);E.objectFlip.checked=o.flip;
  if(o.type==='tie'){E.objectLength.value=Math.round(o.length*100);E.objectLengthValue.textContent=`${Math.round(o.length*100)}%`;}
  status(o.locked?`${o.type.toUpperCase()} locked. Unlock it to edit.`:`${o.type.toUpperCase()} selected. Drag, pinch, or twist directly on the image.`);
}
function updateTransformUi(){
  const o=selectedObject();if(!o)return;
  E.objectScale.value=Math.round(o.scale*100);E.objectScaleValue.textContent=`${Math.round(o.scale*100)}%`;E.objectRotate.value=Math.round(o.rotation);E.objectRotateValue.textContent=`${Math.round(o.rotation)}°`;
}

function addObject(type){
  if(!photo)return;if(type==='badge'&&objects.some(o=>o.type==='badge')){status('Only one +1 badge is used per image.');return;}if(objects.length>=30){status('Maximum 30 CHUMP objects per image.');return;}
  const defaults={beak:'closed',tie:'straight',feather:'orange',badge:null},count=objects.filter(o=>o.type===type).length;
  const o={id:nextId++,type,style:defaults[type],x:540+((count%5)-2)*34,y:type==='tie'?520:type==='badge'?805:type==='feather'?300:445,scale:1,length:1,rotation:0,yaw:0,pitch:0,flip:false,locked:false};
  objects.push(o);selected=o.id;previewClean=false;syncControls();rebuildLayers();scheduleRender();pushHistory();updateAddButtons();
}
function updateAddButtons(){const hasPhoto=!!photo;E.addBeak.disabled=!hasPhoto;E.addTie.disabled=!hasPhoto;E.addFeather.disabled=!hasPhoto;E.addBadge.disabled=!hasPhoto||objects.some(o=>o.type==='badge');}
function deleteSelected(){const o=selectedObject();if(!o||o.locked)return;objects=objects.filter(x=>x.id!==o.id);selected='photo';syncControls();rebuildLayers();scheduleRender();pushHistory();updateAddButtons();}
function duplicateSelected(){const o=selectedObject();if(!o||o.locked||o.type==='badge')return;const copy={...o,id:nextId++,x:o.x+35,y:o.y+35,locked:false};objects.push(copy);selected=copy.id;syncControls();rebuildLayers();scheduleRender();pushHistory();}
function moveLayer(delta){const o=selectedObject();if(!o||o.locked)return;const i=objects.findIndex(x=>x.id===o.id),j=i+delta;if(j<0||j>=objects.length)return;[objects[i],objects[j]]=[objects[j],objects[i]];rebuildLayers();scheduleRender();pushHistory();}
function resetSelected(){const o=selectedObject();if(!o||o.locked)return;o.scale=1;o.length=1;o.rotation=0;o.yaw=0;o.pitch=0;o.flip=false;syncControls();scheduleRender();pushHistory();}
function toggleObjectLock(){const o=selectedObject();if(!o)return;o.locked=!o.locked;syncControls();rebuildLayers();scheduleRender();pushHistory();}
function nudge(dx,dy){const o=selectedObject();if(!o||o.locked)return;o.x=clamp(o.x+dx,-200,1280);o.y=clamp(o.y+dy,-200,1280);scheduleRender();pushHistory();}
function centerSelected(){const o=selectedObject();if(!o||o.locked)return;o.x=540;o.y=540;scheduleRender();pushHistory();}

function canvasPointFromEvent(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*1080/r.width,y:(e.clientY-r.top)*1080/r.height};}
function hitObject(p){
  for(let i=objects.length-1;i>=0;i--){const o=objects[i],d=objectDimensions(o),rad=-o.rotation*Math.PI/180,dx=p.x-o.x,dy=p.y-o.y;const rx=dx*Math.cos(rad)-dy*Math.sin(rad),ry=dx*Math.sin(rad)+dy*Math.cos(rad);if(Math.abs(rx)<=d.w*.62&&Math.abs(ry)<=d.h*.62)return o;}return null;
}
function pointerPair(){const a=[...pointers.values()];return a.length>=2?[a[0],a[1]]:null;}
function pairMetrics(pair){const [a,b]=pair,dx=b.p.x-a.p.x,dy=b.p.y-a.p.y;return{distance:Math.max(1,Math.hypot(dx,dy)),angle:Math.atan2(dy,dx)*180/Math.PI,center:{x:(a.p.x+b.p.x)/2,y:(a.p.y+b.p.y)/2}};}
function beginGesture(){
  const o=selectedObject(),pair=pointerPair();if(!o||o.locked||!pair)return false;const m=pairMetrics(pair);gesture={objectId:o.id,startScale:o.scale,startRotation:o.rotation,startX:o.x,startY:o.y,startDistance:m.distance,startAngle:m.angle,startCenter:m.center};dragSession=null;gestureChanged=false;return true;
}
function endPointer(e){
  pointers.delete(e.pointerId);
  if(gesture){if(gestureChanged)pushHistory();gesture=null;gestureChanged=false;dragSession=null;}
  else if(dragSession&&dragSession.pointerId===e.pointerId){if(dragSession.moved)pushHistory();dragSession=null;}
  if(pointers.size>=2)beginGesture();
}
canvas.addEventListener('pointerdown',e=>{
  if(!photo||previewClean)return;e.preventDefault();canvas.setPointerCapture?.(e.pointerId);const p=canvasPointFromEvent(e);pointers.set(e.pointerId,{p});
  const hit=hitObject(p);
  if(hit){if(selected!==hit.id){selected=hit.id;syncControls();rebuildLayers();scheduleRender();}if(!hit.locked)dragSession={pointerId:e.pointerId,target:'object',id:hit.id,start:p,last:p,moved:false};}
  else if(selected==='photo'&&!photoState.locked){dragSession={pointerId:e.pointerId,target:'photo',start:p,last:p,moved:false};}
  else dragSession=null;
  if(pointers.size>=2)beginGesture();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||previewClean)return;e.preventDefault();const p=canvasPointFromEvent(e);pointers.get(e.pointerId).p=p;
  if(gesture&&pointers.size>=2){const o=objects.find(x=>x.id===gesture.objectId);if(!o||o.locked)return;const m=pairMetrics(pointerPair()),ratio=m.distance/gesture.startDistance;o.scale=clamp(gesture.startScale*ratio,.1,3);o.rotation=clamp(gesture.startRotation+angleDelta(m.angle,gesture.startAngle),-180,180);o.x=clamp(gesture.startX+(m.center.x-gesture.startCenter.x),-200,1280);o.y=clamp(gesture.startY+(m.center.y-gesture.startCenter.y),-200,1280);gestureChanged=true;updateTransformUi();scheduleRender();return;}
  if(!dragSession||dragSession.pointerId!==e.pointerId)return;
  const total=Math.hypot(p.x-dragSession.start.x,p.y-dragSession.start.y);if(!dragSession.moved&&total<12)return;dragSession.moved=true;const dx=p.x-dragSession.last.x,dy=p.y-dragSession.last.y;dragSession.last=p;
  if(dragSession.target==='photo'&&!photoState.locked){photoState.x+=dx;photoState.y+=dy;scheduleRender();}
  if(dragSession.target==='object'){const o=objects.find(x=>x.id===dragSession.id);if(o&&!o.locked){o.x=clamp(o.x+dx,-200,1280);o.y=clamp(o.y+dy,-200,1280);scheduleRender();}}
});
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))endPointer(e);});

E.file.addEventListener('change',()=>{
  const f=E.file.files&&E.file.files[0];if(!f)return;if(!/^image\/(png|jpeg|webp)$/.test(f.type)){status('Choose a JPG, PNG, or WEBP image.');return;}if(f.size>30*1024*1024){status('Choose an image under 30 MB.');return;}
  if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(f);const img=new Image();img.onload=()=>{photo=img;photoState={x:540,y:540,scale:1,locked:false};objects=[];selected='photo';nextId=1;history=[];future=[];previewClean=false;E.empty.style.display='none';E.startOver.disabled=false;E.download.disabled=false;syncControls();rebuildLayers();updateAddButtons();scheduleRender();pushHistory();status('Image loaded. Position the photo, then start adding CHUMP parts.');};img.onerror=()=>status('Could not open that image.');img.src=photoUrl;
});
E.selectPhoto.addEventListener('click',()=>selectLayer('photo'));
E.lockPhoto.addEventListener('click',()=>{if(!photo)return;photoState.locked=!photoState.locked;syncControls();rebuildLayers();pushHistory();});
E.photoScale.addEventListener('input',()=>{if(photoState.locked)return;photoState.scale=Number(E.photoScale.value)/100;E.photoScaleValue.textContent=`${E.photoScale.value}%`;scheduleRender();});E.photoScale.addEventListener('change',pushHistory);
E.addBeak.addEventListener('click',()=>addObject('beak'));E.addTie.addEventListener('click',()=>addObject('tie'));E.addFeather.addEventListener('click',()=>addObject('feather'));E.addBadge.addEventListener('click',()=>addObject('badge'));

function bindRange(el,key,valueEl,converter,formatter){el.addEventListener('input',()=>{const o=selectedObject();if(!o||o.locked)return;o[key]=converter(el.value);valueEl.textContent=formatter(el.value);scheduleRender();});el.addEventListener('change',pushHistory);}
bindRange(E.objectScale,'scale',E.objectScaleValue,v=>Number(v)/100,v=>`${v}%`);bindRange(E.objectRotate,'rotation',E.objectRotateValue,v=>Number(v),v=>`${v}°`);bindRange(E.objectYaw,'yaw',E.objectYawValue,v=>Number(v),v=>v);bindRange(E.objectPitch,'pitch',E.objectPitchValue,v=>Number(v),v=>v);bindRange(E.objectLength,'length',E.objectLengthValue,v=>Number(v)/100,v=>`${v}%`);

function stepInput(input,delta,apply){if(input.disabled)return;const min=Number(input.min),max=Number(input.max);input.value=clamp(Number(input.value)+delta,min,max);apply(input.value);pushHistory();}
E.photoScaleMinus.addEventListener('click',()=>stepInput(E.photoScale,-5,v=>{photoState.scale=Number(v)/100;E.photoScaleValue.textContent=`${v}%`;scheduleRender();}));
E.photoScalePlus.addEventListener('click',()=>stepInput(E.photoScale,5,v=>{photoState.scale=Number(v)/100;E.photoScaleValue.textContent=`${v}%`;scheduleRender();}));
E.objectScaleMinus.addEventListener('click',()=>stepInput(E.objectScale,-5,v=>{const o=selectedObject();if(o){o.scale=Number(v)/100;E.objectScaleValue.textContent=`${v}%`;scheduleRender();}}));
E.objectScalePlus.addEventListener('click',()=>stepInput(E.objectScale,5,v=>{const o=selectedObject();if(o){o.scale=Number(v)/100;E.objectScaleValue.textContent=`${v}%`;scheduleRender();}}));
E.objectRotateMinus.addEventListener('click',()=>stepInput(E.objectRotate,-2,v=>{const o=selectedObject();if(o){o.rotation=Number(v);E.objectRotateValue.textContent=`${v}°`;scheduleRender();}}));
E.objectRotatePlus.addEventListener('click',()=>stepInput(E.objectRotate,2,v=>{const o=selectedObject();if(o){o.rotation=Number(v);E.objectRotateValue.textContent=`${v}°`;scheduleRender();}}));
E.objectLengthMinus.addEventListener('click',()=>stepInput(E.objectLength,-5,v=>{const o=selectedObject();if(o){o.length=Number(v)/100;E.objectLengthValue.textContent=`${v}%`;scheduleRender();}}));
E.objectLengthPlus.addEventListener('click',()=>stepInput(E.objectLength,5,v=>{const o=selectedObject();if(o){o.length=Number(v)/100;E.objectLengthValue.textContent=`${v}%`;scheduleRender();}}));

E.objectFlip.addEventListener('change',()=>{const o=selectedObject();if(!o||o.locked)return;o.flip=E.objectFlip.checked;scheduleRender();pushHistory();});
E.lockObject.addEventListener('click',toggleObjectLock);E.duplicate.addEventListener('click',duplicateSelected);E.moveForward.addEventListener('click',()=>moveLayer(1));E.moveBack.addEventListener('click',()=>moveLayer(-1));E.resetObject.addEventListener('click',resetSelected);E.deleteObject.addEventListener('click',deleteSelected);
E.nudgeUp.addEventListener('click',()=>nudge(0,-12));E.nudgeDown.addEventListener('click',()=>nudge(0,12));E.nudgeLeft.addEventListener('click',()=>nudge(-12,0));E.nudgeRight.addEventListener('click',()=>nudge(12,0));E.centerObject.addEventListener('click',centerSelected);

E.undo.addEventListener('click',()=>{if(history.length<=1)return;future.push(history.pop());restoreSnapshot(history[history.length-1]);updateHistoryButtons();});
E.redo.addEventListener('click',()=>{if(!future.length)return;const s=future.pop();history.push(s);restoreSnapshot(s);updateHistoryButtons();});

function setMode(mode){outputMode=mode;previewClean=false;E.postMode.classList.toggle('active',mode==='post');E.pfpMode.classList.toggle('active',mode==='pfp');if(mode==='pfp'){E.stageNote.textContent='X PFP safe-area preview • 400 × 400 export';E.outputNote.textContent='The circle is an editing guide only. X receives a square 400 × 400 image.';E.download.textContent='DOWNLOAD X PFP 400 × 400';}else{E.stageNote.textContent='Square post preview • 1080 × 1080 export';E.outputNote.textContent='Optimized for an X post, reply, or general square image.';E.download.textContent='DOWNLOAD 1080 × 1080';}syncControls();scheduleRender();}
E.postMode.addEventListener('click',()=>setMode('post'));E.pfpMode.addEventListener('click',()=>setMode('pfp'));
E.previewFinal.addEventListener('click',()=>{if(!photo)return;previewClean=!previewClean;syncControls();scheduleRender();status(previewClean?'Final preview: editing gestures are paused.':'Back to editing.');});

function triggerDownload(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500);}
function exportCanvas(size){const out=document.createElement('canvas');out.width=out.height=size;const c=out.getContext('2d');c.save();c.scale(size/1080,size/1080);const wasPreview=previewClean;previewClean=true;drawScene(c,{guides:false});previewClean=wasPreview;c.restore();return out;}
E.download.addEventListener('click',()=>{
  if(!photo)return;const size=outputMode==='pfp'?400:1080,out=exportCanvas(size);out.toBlob(blob=>{if(!blob){status('Could not create the finished image.');return;}if(outputMode==='pfp'&&blob.size>2*1024*1024){out.toBlob(jpg=>{if(!jpg){status('Could not create the finished image.');return;}triggerDownload(jpg,'chumped-up-x-pfp-400.jpg');status(`X PFP downloaded • ${(jpg.size/1024/1024).toFixed(2)} MB`);},'image/jpeg',.92);return;}const name=outputMode==='pfp'?'chumped-up-x-pfp-400.png':'chumped-up-post-1080.png';triggerDownload(blob,name);status(`${outputMode==='pfp'?'X PFP':'Square image'} downloaded • ${(blob.size/1024/1024).toFixed(2)} MB`);},'image/png');
});
E.startOver.addEventListener('click',()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;photo=null;photoState={x:540,y:540,scale:1,locked:false};objects=[];selected='photo';nextId=1;history=[];future=[];previewClean=false;pointers.clear();gesture=null;dragSession=null;E.file.value='';E.empty.style.display='grid';E.startOver.disabled=true;E.download.disabled=true;syncControls();rebuildLayers();updateAddButtons();scheduleRender();updateHistoryButtons();status('Ready.');});

syncControls();rebuildLayers();updateAddButtons();updateHistoryButtons();render();
})();
