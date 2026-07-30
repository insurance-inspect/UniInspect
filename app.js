// UniInspect — Vehicle Inspection App
// Brevo email sending — All config in app.js
// Apps Script only for report count logging

const { useState, useRef, useEffect } = React;

// ── Backend (for logging only) ────────────────────────────────
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbyORTcrl8od8fyASkkNhb4flChpbOuAXmlonNjXAFOvYvyu_gy67mWTnr55o6LryY8h3A/exec";

// ── Obfuscation helper ────────────────────────────────────────
function _b(a,b,c){var t=atob;return t(a)+t(b).split("").reverse().join("")+t(c);}

// ── Office Configuration ──────────────────────────────────────
// To add Brevo key: share key here → get obfuscated code → paste in brevoKey
// To add sender email: add verified Brevo sender email
var OFFICE_CODES = {
  "101783": {
    name       : "UIIC MO PANDALAM",
    email      : "101783mopandalam@gmail.com",
    senderEmail: "101783mopandalam.sender@gmail.com",
    brevoKey   : _b("eGtleXNpYi02OTRlMzA5MmVkYjJjOTZhZjBlZDk=","ZTRiODBkNmQxZDIzNTEwODg5NThhODA4NDg0ZjRj","YjkwYmMxOTJjOTMxNC1qSWY1QTNKTkFkRm9yeUdq"),
  },
  "300502": {
    name       : "UIIC BO SULTHAN BATHERY",
    email      : "uibathery@gmail.com",
    senderEmail: "101783mopandalam.sender@gmail.com",
    brevoKey   : _b("eGtleXNpYi02OTRlMzA5MmVkYjJjOTZhZjBlZDk=","ZTRiODBkNmQxZDIzNTEwODg5NThhODA4NDg0ZjRj","YjkwYmMxOTJjOTMxNC1qSWY1QTNKTkFkRm9yeUdq"),
  },
};

// ── Photo Slots ───────────────────────────────────────────────
const PHOTO_SLOTS = [
  { id:"front",    label:"Front",         icon:"⬆️", required:true,  hint:"Full front of the vehicle" },
  { id:"rear",     label:"Rear",          icon:"⬇️", required:true,  hint:"Full rear / boot area" },
  { id:"right",    label:"Right Side",    icon:"➡️", required:true,  hint:"Passenger side, full length" },
  { id:"left",     label:"Left Side",     icon:"⬅️", required:true,  hint:"Driver side, full length" },
  { id:"odometer", label:"Odometer",      icon:"🔢", required:true,  hint:"Dashboard reading clearly visible" },
  { id:"chassis",  label:"Chassis / VIN", icon:"🔡", required:false, hint:"VIN plate on dash or door frame" },
  { id:"ped1",     label:"PED 1",         icon:"🔍", required:false, hint:"Close up of damage area 1" },
  { id:"ped2",     label:"PED 2",         icon:"🔍", required:false, hint:"Close up of damage area 2" },
];

// ── Utilities ─────────────────────────────────────────────────
function formatTs(date) {
  if(!date) return "";
  return date.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function generateReportId(reg) {
  var d=new Date();
  var dt=d.getFullYear().toString()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
  return "UI-"+dt+"-"+(reg||"XX").replace(/\s/g,"")+"-"+Math.random().toString(36).substring(2,6).toUpperCase();
}

function isSameDay(dateStr) {
  try {
    var saved=new Date(dateStr),now=new Date();
    return saved.getDate()===now.getDate()&&saved.getMonth()===now.getMonth()&&saved.getFullYear()===now.getFullYear();
  } catch(e){return false;}
}

function validateOfficeCode(code) {
  var trimmed=code.toString().trim().toUpperCase();
  var found=null,foundKey=null;
  Object.keys(OFFICE_CODES).forEach(function(key){
    if(key.toUpperCase()===trimmed){found=OFFICE_CODES[key];foundKey=key;}
  });
  if(found) return {success:true,officeName:found.name,officeEmail:found.email,senderEmail:found.senderEmail,brevoKey:found.brevoKey,officeCode:foundKey};
  return {success:false,error:"Please contact your Parent office for office code mapping."};
}

// ── GPS ───────────────────────────────────────────────────────
function getGPS() {
  return new Promise(function(resolve){
    if(!navigator.geolocation){resolve(null);return;}
    var done=false;
    var timer=setTimeout(function(){if(!done){done=true;resolve(null);}},5000);
    navigator.geolocation.getCurrentPosition(
      function(pos){if(!done){done=true;clearTimeout(timer);resolve({lat:pos.coords.latitude.toFixed(6),lng:pos.coords.longitude.toFixed(6),accuracy:Math.round(pos.coords.accuracy)});}},
      function(){if(!done){done=true;clearTimeout(timer);resolve(null);}},
      {timeout:5000,enableHighAccuracy:false,maximumAge:60000}
    );
  });
}

async function getPlaceName(lat,lng) {
  try {
    var resp=await fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat="+lat+"&lon="+lng+"&zoom=14&addressdetails=1",{headers:{"Accept-Language":"en"}});
    var data=await resp.json();
    if(data&&data.address){
      var a=data.address,parts=[];
      if(a.suburb||a.neighbourhood||a.village) parts.push(a.suburb||a.neighbourhood||a.village);
      if(a.city||a.town||a.county) parts.push(a.city||a.town||a.county);
      if(a.state) parts.push(a.state);
      return parts.join(", ")||data.display_name.split(",").slice(0,3).join(",");
    }
    return null;
  }catch(e){return null;}
}

// ── Internet Time ─────────────────────────────────────────────
async function getTrueTime() {
  var sources=["https://worldtimeapi.org/api/timezone/Asia/Kolkata","https://timeapi.io/api/time/current/zone?timeZone=Asia%2FKolkata"];
  for(var i=0;i<sources.length;i++){
    try{
      var resp=await fetch(sources[i],{cache:"no-store",signal:AbortSignal.timeout(3000)});
      var data=await resp.json();
      var dt=data.datetime||data.dateTime;
      if(dt) return {date:new Date(dt),verified:true};
    }catch(e){}
  }
  try{
    await fetch("https://www.google.com",{cache:"no-store",mode:"no-cors",signal:AbortSignal.timeout(3000)});
    return {date:new Date(),verified:true};
  }catch(e){}
  return {date:null,verified:false};
}

// ── Email via Brevo ───────────────────────────────────────────
async function sendViaBrevo(apiKey,senderEmail,to,subject,bodyText,pdfBase64,pdfFilename) {
  if(!apiKey) throw new Error("Brevo API key not configured. Please contact admin.");
  if(!senderEmail) throw new Error("Sender email not configured. Please contact admin.");
  var payload={
    sender     :{name:"UniInspect",email:senderEmail},
    to         :[{email:to}],
    subject    :subject,
    textContent:bodyText,
    attachment :[{name:pdfFilename,content:pdfBase64}]
  };
  var resp=await fetch("https://api.brevo.com/v3/smtp/email",{
    method:"POST",
    headers:{"Content-Type":"application/json","api-key":apiKey},
    body:JSON.stringify(payload)
  });
  var result=await resp.json();
  if(!resp.ok) throw new Error(result.message||"Brevo send failed");
  return result;
}

// ── Log to Sheets (fire and forget) ──────────────────────────
function logReport(officeCode,officeName) {
  try {
    fetch(BACKEND_URL,{
      method:"POST",
      body:JSON.stringify({action:"logReport",officeCode:officeCode,officeName:officeName})
    }).catch(function(){});
  } catch(e){}
}

// ── IndexedDB Queue ───────────────────────────────────────────
var DB_NAME="UniInspectDB",DB_VERSION=1,STORE_NAME="pendingReports",QUEUE_KEY="ui_pending_queue";

function openDB(){
  return new Promise(function(resolve,reject){
    var req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"reportId"});};
    req.onsuccess=function(e){resolve(e.target.result);};
    req.onerror=function(e){reject(e);};
  });
}

async function dbAdd(report){try{var db=await openDB();return new Promise(function(r){var tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).put(report);tx.oncomplete=function(){r();};});}catch(e){}}
async function dbDelete(id){try{var db=await openDB();return new Promise(function(r){var tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=function(){r();};});}catch(e){}}
async function dbGet(id){try{var db=await openDB();return new Promise(function(r){var tx=db.transaction(STORE_NAME,"readonly");var req=tx.objectStore(STORE_NAME).get(id);req.onsuccess=function(e){r(e.target.result||null);};req.onerror=function(){r(null);};});}catch(e){return null;}}

function getQueue(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]");}catch(e){return[];}}
async function addToQueue(report){await dbAdd(report);try{var q=getQueue();if(!q.find(function(r){return r.reportId===report.reportId;})){q.push({reportId:report.reportId,registration:report.registration,officeName:report.officeName,savedAt:report.savedAt,placeName:report.placeName});localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}}catch(e){}}
async function removeFromQueue(id){await dbDelete(id);try{var q=getQueue().filter(function(r){return r.reportId!==id;});localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}catch(e){}}

// ── Image Processing ──────────────────────────────────────────
function stampImage(dataUrl,label,timestamp,gps,placeName,verified,sentTime){
  return new Promise(function(res){
    var img=new Image();
    img.onload=function(){
      var fh=Math.max(13,Math.round(img.width*0.030)),pad=10;
      var locationLine=placeName?placeName:(gps?(gps.lat+", "+gps.lng):"GPS: Unavailable");
      var lines=[],colors=[];
      lines.push(label.toUpperCase());colors.push("#ffffff");
      if(verified&&timestamp){lines.push("🕐 "+timestamp+" IST ✓");colors.push("#fbbf24");}
      else if(sentTime){lines.push("🌐 "+sentTime+" IST");colors.push("#60a5fa");lines.push("(Offline at capture — sent time)");colors.push("#94a3b8");}
      lines.push(locationLine);colors.push("#86efac");
      var ctx0=document.createElement("canvas").getContext("2d");
      ctx0.font="bold "+fh+"px monospace";
      var maxW=0;lines.forEach(function(l){var w=ctx0.measureText(l).width;if(w>maxW)maxW=w;});
      var stripH=fh*lines.length+pad*(lines.length+1);
      var c=document.createElement("canvas");c.width=img.width;c.height=img.height+stripH;
      var ctx=c.getContext("2d");
      ctx.drawImage(img,0,0);
      ctx.fillStyle="#0f172a";ctx.fillRect(0,img.height,c.width,stripH);
      ctx.font="bold "+fh+"px monospace";
      lines.forEach(function(line,i){ctx.fillStyle=colors[i]||"#ffffff";ctx.fillText(line,pad,img.height+pad*(i+1)+fh*(i+1));});
      res(c.toDataURL("image/jpeg",0.78));
    };
    img.src=dataUrl;
  });
}

function resizeImage(dataUrl,maxW,quality){
  maxW=maxW||1080;quality=quality||0.72;
  return new Promise(function(res){
    var img=new Image();
    img.onload=function(){
      var scale=Math.min(1,maxW/img.width);
      var c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      var ctx=c.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
      ctx.drawImage(img,0,0,c.width,c.height);
      var out=c.toDataURL("image/jpeg",quality);
      if(out.length>467000){out=c.toDataURL("image/jpeg",quality-0.10);}
      if(out.length>467000){out=c.toDataURL("image/jpeg",quality-0.20);}
      res(out);
    };
    img.src=dataUrl;
  });
}

function getCompressionSettings(n){
  if(n<=5) return {maxW:1080,quality:0.72};
  if(n===6) return {maxW:1000,quality:0.68};
  if(n===7) return {maxW:900,quality:0.64};
  return {maxW:800,quality:0.60};
}

function generateQRDataURL(text){
  try{
    if(!window.qrcode) return null;
    var qr=window.qrcode(0,"L");qr.addData(text.substring(0,200));qr.make();
    var mc=qr.getModuleCount(),cs=5,size=mc*cs;
    var canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
    var ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,size,size);ctx.fillStyle="#000000";
    for(var r=0;r<mc;r++) for(var col=0;col<mc;col++) if(qr.isDark(r,col)) ctx.fillRect(col*cs,r*cs,cs,cs);
    return canvas.toDataURL("image/png");
  }catch(e){return null;}
}

async function generateQR(text){
  var local=generateQRDataURL(text);if(local) return local;
  try{
    var resp=await fetch("https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl="+encodeURIComponent(text.substring(0,200))+"&choe=UTF-8");
    var blob=await resp.blob();
    return await new Promise(function(resolve){var reader=new FileReader();reader.onload=function(e){resolve(e.target.result);};reader.readAsDataURL(blob);});
  }catch(e){return null;}
}

// ── PDF Builder ───────────────────────────────────────────────
async function buildPDF(opts){
  var vehicle=opts.vehicle,photos=opts.photos,generatedAt=opts.generatedAt;
  var reportId=opts.reportId,gps=opts.gps,placeName=opts.placeName;
  var qrDataUrl=opts.qrDataUrl,officeName=opts.officeName,remarks=opts.remarks;
  var jsPDF=window.jspdf.jsPDF;
  var doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  var W=210,H=297,margin=14;

  doc.setFillColor(15,23,42);doc.rect(0,0,W,52,"F");
  doc.setFillColor(29,78,216);doc.roundedRect(margin,10,24,24,4,4,"F");
  doc.setFontSize(14);doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.text("U",margin+7,26);
  doc.setTextColor(241,245,249);doc.setFontSize(22);doc.setFont("helvetica","bold");doc.text("UniInspect",margin+30,22);
  doc.setFontSize(10);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);doc.text("VEHICLE INSPECTION REPORT",margin+30,30);
  doc.setFillColor(127,29,29);doc.roundedRect(W-margin-44,14,44,10,3,3,"F");
  doc.setTextColor(252,165,165);doc.setFontSize(7);doc.setFont("helvetica","bold");doc.text("POLICY EXPIRED",W-margin-42,20.5);
  doc.setTextColor(100,116,139);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Generated: "+generatedAt,margin+30,38);

  doc.setFillColor(29,78,216);doc.rect(0,52,W,14,"F");
  doc.setFontSize(8);doc.setFont("helvetica","bold");doc.setTextColor(255,255,255);doc.text("REPORT ID: "+reportId,margin,60);
  doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(191,219,254);doc.text("Office: "+officeName,margin,64);
  if(qrDataUrl){try{doc.addImage(qrDataUrl,"PNG",W-margin-30,55,26,26);}catch(e){}}

  var bx=margin,by=74,bw=W-margin*2-(qrDataUrl?32:0),bh=56;
  doc.setFillColor(248,250,252);doc.roundedRect(bx,by,bw,bh,4,4,"F");
  doc.setDrawColor(226,232,240);doc.roundedRect(bx,by,bw,bh,4,4,"S");
  doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(100,116,139);doc.text("VEHICLE DETAILS",bx+6,by+9);
  [["Registration",vehicle.reg||"—"],["Make & Model",vehicle.make||"—"],["Owner",vehicle.owner||"—"],["Expired Policy",vehicle.policy||"—"]].forEach(function(pair,i){
    var fy=by+18+i*11;
    doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(71,85,105);doc.text(pair[0],bx+6,fy);
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(15,23,42);doc.text(pair[1],bx+50,fy);
  });

  var iy=by+bh+6;
  doc.setFillColor(239,246,255);doc.roundedRect(margin,iy,W-margin*2,14,4,4,"F");
  doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(100,116,139);doc.text("OFFICE",margin+6,iy+6);
  doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(15,23,42);doc.text(officeName,margin+6,iy+12);

  var ly=iy+20;
  doc.setFillColor(240,253,244);doc.roundedRect(margin,ly,W-margin*2,18,4,4,"F");
  doc.setDrawColor(134,239,172);doc.roundedRect(margin,ly,W-margin*2,18,4,4,"S");
  doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(21,128,61);doc.text("GPS LOCATION",margin+6,ly+7);
  doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(15,23,42);doc.text(placeName||"Not available",margin+6,ly+14);
  if(gps){doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);doc.text("("+gps.lat+", "+gps.lng+" +/-"+gps.accuracy+"m)",margin+6+doc.getTextWidth(placeName||"Not available")+2,ly+14);}

  var ry2=ly+24;
  if(remarks&&remarks.trim()){
    doc.setFillColor(255,251,235);doc.roundedRect(margin,ry2,W-margin*2,20,4,4,"F");
    doc.setDrawColor(253,230,138);doc.roundedRect(margin,ry2,W-margin*2,20,4,4,"S");
    doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(146,64,14);doc.text("INSPECTOR REMARKS",margin+6,ry2+7);
    doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(15,23,42);
    var rmLines=doc.splitTextToSize(remarks,W-margin*2-12);doc.text(rmLines,margin+6,ry2+14);
    ry2=ry2+24;
  }

  var ty=ry2;
  doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(100,116,139);doc.text("PHOTOS CAPTURED",margin+6,ty);
  PHOTO_SLOTS.forEach(function(slot,i){
    var captured=photos[slot.id];var ry=ty+7+i*9;
    doc.setFillColor(captured?240:254,captured?253:242,captured?244:242);
    doc.roundedRect(margin,ry,W-margin*2,8,2,2,"F");
    doc.setFontSize(8);doc.setFont("helvetica","bold");
    doc.setTextColor(captured?21:185,captured?128:28,captured?61:26);
    doc.text(captured?"✓":"—",margin+5,ry+5.5);
    doc.setFont("helvetica","normal");doc.setTextColor(51,65,85);doc.text(slot.label,margin+12,ry+5.5);
    doc.setTextColor(100,116,139);doc.setFontSize(7);
    doc.text(captured?(formatTs(photos[slot.id].ts)||"Time unavailable"):"Not captured",margin+56,ry+5.5);
    if(captured&&photos[slot.id].placeName){doc.setTextColor(21,128,61);doc.text(photos[slot.id].placeName,margin+110,ry+5.5);}
  });

  doc.setFillColor(15,23,42);doc.rect(0,H-12,W,12,"F");
  doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);
  doc.text("UniInspect | "+reportId+" | "+officeName,margin,H-4.5);doc.text("Page 1",W-margin-8,H-4.5);

  var capturedSlots=PHOTO_SLOTS.filter(function(s){return photos[s.id];});
  for(var i=0;i<capturedSlots.length;i++){
    var slot=capturedSlots[i];var ph=photos[slot.id];
    doc.addPage();
    doc.setFillColor(15,23,42);doc.rect(0,0,W,22,"F");
    doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(241,245,249);doc.text(slot.label.toUpperCase(),margin,14);
    doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);doc.text(reportId,W-margin-doc.getTextWidth(reportId),14);
    var px=margin,py=28,pw=W-margin*2;
    await new Promise(function(resolve){
      var tmp=new Image();
      tmp.onload=function(){
        var ar=tmp.height/tmp.width,ph_h=Math.min(pw*ar,H-py-40);
        try{doc.addImage(ph.url,"JPEG",px,py,pw,ph_h,undefined,"FAST");}catch(e){}
        var sy=py+ph_h+4;
        doc.setFillColor(248,250,252);doc.roundedRect(px,sy,pw,24,3,3,"F");
        doc.setDrawColor(226,232,240);doc.roundedRect(px,sy,pw,24,3,3,"S");
        doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(100,116,139);doc.text("CAPTURED AT",px+5,sy+7);
        doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(15,23,42);doc.text(formatTs(ph.ts)||"Time unavailable",px+5,sy+14);
        doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(21,128,61);doc.text("LOCATION:",px+5,sy+21);
        doc.setFont("helvetica","normal");doc.setTextColor(15,23,42);
        doc.text(ph.placeName||(ph.gps?(ph.gps.lat+", "+ph.gps.lng):"Not available"),px+24,sy+21);
        if(qrDataUrl){try{doc.addImage(qrDataUrl,"PNG",W-margin-18,sy+2,16,16);}catch(e){}}
        doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);
        doc.text("Photo "+(i+1)+" of "+capturedSlots.length,W-margin-20,sy+14);
        resolve();
      };
      tmp.src=ph.url;
    });
    doc.setFillColor(15,23,42);doc.rect(0,H-12,W,12,"F");
    doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(100,116,139);
    doc.text("UniInspect | "+reportId,margin,H-4.5);doc.text("Page "+(i+2),W-margin-8,H-4.5);
  }
  return doc;
}

// ── Photo Preview ─────────────────────────────────────────────
function PhotoPreview(props){
  var photo=props.photo,onClose=props.onClose,onRetake=props.onRetake;
  var scaleRef=useRef(1),lastDistRef=useRef(null),imgRef=useRef(null);
  var posRef=useRef({x:0,y:0}),lastPosRef=useRef(null),lastTapRef=useRef(0);

  function getDistance(t1,t2){var dx=t1.clientX-t2.clientX,dy=t1.clientY-t2.clientY;return Math.sqrt(dx*dx+dy*dy);}
  function applyTransform(){if(imgRef.current)imgRef.current.style.transform="translate("+posRef.current.x+"px,"+posRef.current.y+"px) scale("+scaleRef.current+")";}

  function onTouchStart(e){
    if(e.touches.length===2) lastDistRef.current=getDistance(e.touches[0],e.touches[1]);
    else if(e.touches.length===1) lastPosRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }
  function onTouchMove(e){
    e.preventDefault();
    if(e.touches.length===2){
      var dist=getDistance(e.touches[0],e.touches[1]);
      if(lastDistRef.current){scaleRef.current=Math.min(Math.max(scaleRef.current*(dist/lastDistRef.current),1),5);applyTransform();}
      lastDistRef.current=dist;
    } else if(e.touches.length===1&&scaleRef.current>1){
      if(lastPosRef.current){posRef.current={x:posRef.current.x+(e.touches[0].clientX-lastPosRef.current.x),y:posRef.current.y+(e.touches[0].clientY-lastPosRef.current.y)};applyTransform();}
      lastPosRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
  }
  function onTouchEnd(e){
    if(e.touches.length<2) lastDistRef.current=null;
    if(scaleRef.current<=1){scaleRef.current=1;posRef.current={x:0,y:0};applyTransform();}
    if(e.changedTouches.length===1){
      var now=Date.now();
      if(now-lastTapRef.current<300){scaleRef.current=scaleRef.current>1?1:2.5;posRef.current={x:0,y:0};applyTransform();}
      lastTapRef.current=now;
    }
  }

  return React.createElement("div",{style:S.previewOverlay},
    React.createElement("div",{style:S.previewHeader},
      React.createElement("span",{style:{color:"#fff",fontWeight:700,fontSize:15}},photo.label+" — Check Clarity"),
      React.createElement("button",{style:S.previewClose,onClick:onClose},"✕")
    ),
    React.createElement("div",{style:S.previewImgWrap,onTouchStart:onTouchStart,onTouchMove:onTouchMove,onTouchEnd:onTouchEnd},
      React.createElement("img",{ref:imgRef,src:photo.url,style:S.previewImg,alt:"Preview"})
    ),
    React.createElement("div",{style:S.previewHint},"👆 Pinch to zoom • Double tap to zoom in/out"),
    React.createElement("div",{style:S.previewActions},
      React.createElement("button",{style:{flex:1,background:"#dc2626",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"},onClick:onRetake},"📷 Retake"),
      React.createElement("button",{style:{flex:1,background:"#15803d",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"},onClick:onClose},"✅ OK — Keep")
    )
  );
}

// ── Admin Panel ──────────────────────────────────────────────
function AdminPanel(props){
  var onClose=props.onClose;
  var uap=useState("");      var adminPass=uap[0],  setAdminPass=uap[1];
  var uauth=useState(false); var authed=uauth[0],   setAuthed=uauth[1];
  var uerr=useState("");     var adminErr=uerr[0],   setAdminErr=uerr[1];
  var ust=useState(null);    var stats=ust[0],        setStats=ust[1];
  var uload=useState(false); var loading=uload[0],   setLoading=uload[1];

  var ADMIN_PASSWORD = "Dhwani@123";
  var BREVO_LIMIT    = 300;

  function login(){
    if(adminPass===ADMIN_PASSWORD){setAuthed(true);loadStats();}
    else setAdminErr("Wrong password");
  }

  async function loadStats(){
    setLoading(true);
    try{
      var resp=await fetch(BACKEND_URL+"?action=getStats&t="+Date.now());
      var data=await resp.json();
      setStats(data&&!data.error?data:{});
    }catch(e){setStats({});}
    setLoading(false);
  }

  // Group offices by brevoKey
  function getGroups(){
    var groups={};
    Object.keys(OFFICE_CODES).forEach(function(code){
      var office=OFFICE_CODES[code];
      // Use first 12 chars of key as group identifier
      var keyId=office.brevoKey?office.brevoKey.toString().substring(0,20):"no-key";
      if(!groups[keyId]) groups[keyId]={offices:[],totalSent:0,keyPreview:office.brevoKey?office.brevoKey.toString().substring(0,16)+"...":"No key set",keyId:keyId};
      var sent=(stats&&stats[code])?stats[code].count||0:0;
      groups[keyId].offices.push({code:code,name:office.name,sent:sent});
      groups[keyId].totalSent+=sent;
    });
    // Sort groups by totalSent descending
    var sorted=Object.values(groups).sort(function(a,b){return b.totalSent-a.totalSent;});
    return sorted;
  }

  // Login screen
  if(!authed) return React.createElement("div",{style:S.adminOverlay},
    React.createElement("div",{style:S.adminModal},
      React.createElement("div",{style:{fontSize:40,marginBottom:10}},"🔐"),
      React.createElement("h2",{style:{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:4}},"Admin Panel"),
      React.createElement("p",{style:{fontSize:12,color:"#64748b",marginBottom:20}},"Enter admin password"),
      React.createElement("input",{
        style:Object.assign({},S.input,{marginBottom:12,textAlign:"center",letterSpacing:2}),
        type:"password",placeholder:"Password",value:adminPass,
        onChange:function(e){setAdminPass(e.target.value);setAdminErr("");},
        onKeyDown:function(e){if(e.key==="Enter")login();}
      }),
      adminErr&&React.createElement("div",{style:{color:"#dc2626",fontSize:12,marginBottom:10}},adminErr),
      React.createElement("div",{style:{display:"flex",gap:10}},
        React.createElement("button",{style:Object.assign({},S.btn,{flex:1}),onClick:login},"Login"),
        React.createElement("button",{style:Object.assign({},S.btn,{flex:1,background:"#64748b"}),onClick:onClose},"Cancel")
      )
    )
  );

  var groups=stats!==null?getGroups():[];
  var grandTotal=groups.reduce(function(sum,g){return sum+g.totalSent;},0);

  return React.createElement("div",{style:S.adminOverlay},
    React.createElement("div",{style:Object.assign({},S.adminModal,{maxWidth:440,maxHeight:"90vh",overflowY:"auto",padding:0})},
      // Header
      React.createElement("div",{style:{background:"#0f172a",padding:"16px 20px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}},
        React.createElement("div",null,
          React.createElement("div",{style:{color:"#fff",fontWeight:800,fontSize:16}},"🛡️ Admin Panel"),
          React.createElement("div",{style:{color:"#64748b",fontSize:11,marginTop:2}},"Today's Report Tracking")
        ),
        React.createElement("button",{style:{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:14},onClick:onClose},"✕")
      ),

      React.createElement("div",{style:{padding:"16px"}},

        // Refresh + date
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
          React.createElement("div",{style:{fontSize:12,color:"#64748b"}},
            new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
          ),
          React.createElement("button",{
            style:{background:"#f1f5f9",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,cursor:"pointer",fontWeight:600},
            onClick:loadStats
          },"🔄 Refresh")
        ),

        loading?React.createElement("div",{style:{textAlign:"center",padding:"40px",color:"#64748b"}},"Loading..."):

        stats===null?React.createElement("div",{style:{textAlign:"center",padding:"40px",color:"#94a3b8"}},"No data"):

        React.createElement("div",null,
          // Grand total bar
          React.createElement("div",{style:{background:"#f8fafc",borderRadius:12,padding:"14px",marginBottom:16,border:"1px solid #e2e8f0"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
              React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"#0f172a"}},"Grand Total Today"),
              React.createElement("div",{style:{fontSize:13,fontWeight:800,color:"#1d4ed8"}}),grandTotal+" sent"
            )
          ),

          // Groups
          groups.map(function(group,gi){
            var pct=Math.min(100,Math.round((group.totalSent/BREVO_LIMIT)*100));
            var barColor=pct>=90?"#dc2626":pct>=70?"#f59e0b":"#22c55e";
            var remaining=Math.max(0,BREVO_LIMIT-group.totalSent);

            return React.createElement("div",{key:gi,style:{background:"#fff",borderRadius:12,padding:"14px",marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1.5px solid #e2e8f0"}},
              // Key identifier + Brevo status
              React.createElement("div",{style:{marginBottom:10}},
                React.createElement("div",{style:{fontSize:10,color:"#94a3b8",fontFamily:"monospace",background:"#f8fafc",padding:"4px 8px",borderRadius:6,marginBottom:6}},
                  "🔑 "+group.keyPreview
                ),
                (function(){
                  var bst=brevoStatus[group.keyId];
                  if(!bst) return React.createElement("div",{style:{fontSize:11,color:"#94a3b8"}},"⏳ Checking Brevo status...");
                  if(!bst.active) return React.createElement("div",{style:{fontSize:11,color:"#dc2626",fontWeight:700}},"❌ Brevo key inactive — "+( bst.error||"Check key"));
                  var bpct=Math.min(100,Math.round((bst.used/bst.credits)*100));
                  var bcolor=bpct>=90?"#dc2626":bpct>=70?"#f59e0b":"#22c55e";
                  return React.createElement("div",{style:{background:"#f0fdf4",borderRadius:8,padding:"6px 10px",border:"1px solid #bbf7d0"}},
                    React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                      React.createElement("span",{style:{fontSize:11,color:"#15803d",fontWeight:700}},"✅ Brevo Active"),
                      React.createElement("span",{style:{fontSize:11,color:bcolor,fontWeight:700}},bst.remaining+" remaining")
                    )
                  );
                })()
              ),

              // Offices in this group sorted by sent count
              group.offices.sort(function(a,b){return b.sent-a.sent;}).map(function(o,oi){
                return React.createElement("div",{key:o.code,style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                  React.createElement("div",null,
                    oi===0&&group.offices.length>1&&React.createElement("span",{style:{fontSize:11}},"🥇 "),
                    oi===1&&React.createElement("span",{style:{fontSize:11}},"🥈 "),
                    oi===2&&React.createElement("span",{style:{fontSize:11}},"🥉 "),
                    React.createElement("span",{style:{fontSize:13,fontWeight:600,color:"#0f172a"}},o.name)
                  ),
                  React.createElement("div",{style:{fontSize:14,fontWeight:800,color:"#334155"}},o.sent)
                );
              }),

              // Divider
              React.createElement("div",{style:{height:1,background:"#f1f5f9",margin:"10px 0"}}),

              // Group total + progress bar
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
                React.createElement("div",{style:{fontSize:12,fontWeight:700,color:"#0f172a"}},"Total: "+group.totalSent+" / "+BREVO_LIMIT),
                React.createElement("div",{style:{fontSize:12,fontWeight:700,color:barColor}},remaining+" remaining")
              ),
              // Progress bar
              React.createElement("div",{style:{height:8,background:"#f1f5f9",borderRadius:8,overflow:"hidden"}},
                React.createElement("div",{style:{height:"100%",width:pct+"%",background:barColor,borderRadius:8,transition:"width 0.3s"}})
              ),
              React.createElement("div",{style:{fontSize:10,color:"#94a3b8",marginTop:4}},pct+"% of daily limit used")
            );
          }),

          groups.length===0&&React.createElement("div",{style:{textAlign:"center",padding:"30px",color:"#94a3b8"}},
            React.createElement("div",{style:{fontSize:32,marginBottom:8}},"📭"),
            React.createElement("div",null,"No reports sent today")
          )
        )
      )
    )
  );
}

// ── Screens ───────────────────────────────────────────────────
var SCREEN={INSPECT:"inspect",SENDING:"sending",DONE:"done",QUEUE:"queue",SAVED:"saved"};

// ── Main App ──────────────────────────────────────────────────
function App(){
  var officeInit=null;
  try{
    var stored=JSON.parse(localStorage.getItem("ui_office")||"null");
    if(stored&&stored.code&&OFFICE_CODES[stored.code]) officeInit=stored;
    else if(stored) localStorage.removeItem("ui_office");
  }catch(e){}

  var us=useState(SCREEN.INSPECT);   var screen=us[0],        setScreen=us[1];
  var uof=useState(officeInit);      var office=uof[0],       setOffice=uof[1];
  var uoc=useState("");              var officeCode=uoc[0],   setOfficeCode=uoc[1];
  var uv=useState({reg:"",make:"",owner:"",policy:""}); var vehicle=uv[0],setVehicle=uv[1];
  var uph=useState({});              var photos=uph[0],       setPhotos=uph[1];
  var ugp=useState(null);            var gps=ugp[0],          setGps=ugp[1];
  var upl=useState(null);            var placeName=upl[0],    setPlaceName=upl[1];
  var uer=useState("");              var error=uer[0],         setError=uer[1];
  var uss=useState("");              var sendStatus=uss[0],    setSendStatus=uss[1];
  var ulr=useState("");              var lastReportId=ulr[0],  setLastReportId=ulr[1];
  var uq=useState(getQueue());       var queue=uq[0],          setQueue=uq[1];
  var uret=useState({});             var retrying=uret[0],     setRetrying=uret[1];
  var urm=useState("");              var remarks=urm[0],       setRemarks=urm[1];
  var uupd=useState(false);          var updateAvailable=uupd[0],setUpdateAvailable=uupd[1];
  var upv=useState(null);            var previewPhoto=upv[0],  setPreviewPhoto=upv[1];
  var utaps=useState(0);             var logoTaps=utaps[0],    setLogoTaps=utaps[1];
  var uadm=useState(false);          var showAdmin=uadm[0],    setShowAdmin=uadm[1];
  var videoRef=useRef(null);
  var streamRef=useRef(null);
  var ucs=useState(null);            var activeSlot=ucs[0],   setActiveSlot=ucs[1];
  var ucf=useState("environment");   var camFacing=ucf[0],    setCamFacing=ucf[1];
  var ucp=useState(false);           var camOpen=ucp[0],      setCamOpen=ucp[1];
  var lastSavedReport=useRef(null);

  function refreshQueue(){var q=getQueue();setQueue(q);return q;}

  // Auto retry
  useEffect(function(){
    var interval=setInterval(async function(){
      var q=getQueue();
      if(q.length===0) return;
      var expired=q.filter(function(r){return !isSameDay(r.savedAt);});
      for(var ei=0;ei<expired.length;ei++) await removeFromQueue(expired[ei].reportId);
      if(expired.length>0){refreshQueue();return;}
      var todayQ=q.filter(function(r){return isSameDay(r.savedAt);});
      if(todayQ.length===0) return;
      var fullReport=await dbGet(todayQ[0].reportId);
      if(!fullReport){await removeFromQueue(todayQ[0].reportId);refreshQueue();return;}
      try{
        await sendReport(fullReport);
        await removeFromQueue(fullReport.reportId);
        refreshQueue();
      }catch(e){}
    },30000);
    return function(){clearInterval(interval);};
  },[]);

  // SW update
  useEffect(function(){
    if(!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message",function(event){
      if(event.data&&event.data.type==="UPDATE_AVAILABLE") setUpdateAvailable(true);
    });
    var checkInterval=setInterval(function(){
      navigator.serviceWorker.getRegistration().then(function(reg){if(reg) reg.update();});
    },5*60*1000);
    return function(){clearInterval(checkInterval);};
  },[]);

  function applyUpdate(){
    if(!("serviceWorker" in navigator)){window.location.reload();return;}
    navigator.serviceWorker.getRegistration().then(function(reg){
      if(reg&&reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
    });
    setUpdateAvailable(false);
    setTimeout(function(){window.location.reload();},500);
  }

  // Logo tap for admin (future use)
  function handleLogoTap(){
    var newTaps=logoTaps+1;
    setLogoTaps(newTaps);
    if(newTaps>=5){setLogoTaps(0);setShowAdmin(true);}
    setTimeout(function(){setLogoTaps(0);},2000);
  }

  // Camera
  useEffect(function(){
    if(!camOpen) return;
    var active=true;
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}})
    .then(function(stream){
      if(!active) return stream.getTracks().forEach(function(t){t.stop();});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}
      setCamFacing("environment");
    }).catch(function(){
      navigator.mediaDevices.getUserMedia({video:true}).then(function(stream){
        if(!active) return stream.getTracks().forEach(function(t){t.stop();});
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}
      }).catch(function(e){alert("Camera error: "+e.message);setCamOpen(false);});
    });
    return function(){active=false;if(streamRef.current){streamRef.current.getTracks().forEach(function(t){t.stop();});streamRef.current=null;}};
  },[camOpen]);

  function openCamera(slotId){setActiveSlot(slotId);setCamOpen(true);}

  function switchCamera(){
    var newFacing=camFacing==="environment"?"user":"environment";
    if(streamRef.current){streamRef.current.getTracks().forEach(function(t){t.stop();});streamRef.current=null;}
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:newFacing},width:{ideal:1280},height:{ideal:720}}})
    .then(function(stream){streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}setCamFacing(newFacing);})
    .catch(function(){});
  }

  function closeCamera(){
    if(streamRef.current){streamRef.current.getTracks().forEach(function(t){t.stop();});streamRef.current=null;}
    setCamOpen(false);setActiveSlot(null);
  }

  async function captureFromCamera(){
    if(!activeSlot||!videoRef.current) return;
    var video=videoRef.current;
    var w=video.videoWidth||640,h=video.videoHeight||480;
    var canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext("2d");
    if(camFacing==="user"){ctx.translate(w,0);ctx.scale(-1,1);}
    ctx.drawImage(video,0,0,w,h);
    var dataUrl=canvas.toDataURL("image/jpeg",0.92);
    var slotId=activeSlot;
    closeCamera();
    var slot=PHOTO_SLOTS.find(function(s){return s.id===slotId;});
    setPhotos(function(p){var n=Object.assign({},p);n[slotId]={url:dataUrl,ts:null,gps:null,placeName:null,processing:true,verified:false};return n;});
    var totalCaptured=Object.keys(photos).filter(function(k){return photos[k]&&!photos[k].processing;}).length+1;
    var compress=getCompressionSettings(totalCaptured);
    var resized=await resizeImage(dataUrl,compress.maxW,compress.quality);
    var timeResult=await getTrueTime();
    var ts=timeResult.verified?timeResult.date:null;
    var tsVerified=timeResult.verified;
    var photoGps=await getGPS();
    var photoPlace=photoGps?(await getPlaceName(photoGps.lat,photoGps.lng)):null;
    var tsStr=ts?formatTs(ts):null;
    var stamped=await stampImage(resized,slot.label,tsStr,photoGps,photoPlace,tsVerified,null);
    setPhotos(function(p){var n=Object.assign({},p);n[slotId]={url:stamped,ts:ts,gps:photoGps,placeName:photoPlace,processing:false,verified:tsVerified,originalDataUrl:resized};return n;});
    if(photoGps) setGps(photoGps);
    if(photoPlace) setPlaceName(photoPlace);
  }

  function handleValidateOffice(){
    if(!officeCode.trim()){setError("Please enter your office code.");return;}
    setError("");
    var result=validateOfficeCode(officeCode.trim());
    if(result.success){
      var officeData={
        code       :result.officeCode,
        name       :result.officeName,
        email      :result.officeEmail,
        senderEmail:result.senderEmail,
        brevoKey   :result.brevoKey,
      };
      setOffice(officeData);
      localStorage.setItem("ui_office",JSON.stringify(officeData));
    } else {
      setError(result.error);
    }
  }

  async function sendReport(payload){
    await sendViaBrevo(
      payload.brevoKey,
      payload.senderEmail,
      payload.to,
      payload.subject,
      payload.bodyText,
      payload.pdfBase64,
      payload.pdfFilename
    );
    logReport(payload.officeCode,payload.officeName);
  }

  var requiredDone=PHOTO_SLOTS.filter(function(s){return s.required;}).every(function(s){return photos[s.id]&&!photos[s.id].processing;});
  var canSubmit=requiredDone&&vehicle.reg.trim()&&office;

  async function handleSubmit(){
    setScreen(SCREEN.SENDING);setError("");
    try{
      setSendStatus("Getting GPS location...");
      var currentGps=gps||(await getGPS());
      var currentPlace=placeName||(currentGps?(await getPlaceName(currentGps.lat,currentGps.lng)):null);
      var reportId=generateReportId(vehicle.reg);
      var generatedAt=formatTs(new Date());

      setSendStatus("Generating QR code...");
      var qrContent=["UNINSPECT VERIFICATION","Report ID: "+reportId,"Office: "+(office?office.name:"—"),"Submitted: "+generatedAt,"Registration: "+vehicle.reg,"Location: "+(currentPlace||"—")].join("\n");
      var qrDataUrl=await generateQR(qrContent);

      setSendStatus("Generating PDF...");
      var doc=await buildPDF({vehicle:vehicle,photos:photos,generatedAt:generatedAt,reportId:reportId,gps:currentGps,placeName:currentPlace,qrDataUrl:qrDataUrl,officeName:office?office.name:"—",remarks:remarks});
      var pdfFilename="UniInspect_"+(vehicle.reg||"inspection").replace(/\s+/g,"_")+"_"+new Date().toISOString().slice(0,10)+".pdf";
      var pdfBase64=doc.output("datauristring").split(",")[1];

      var subject="Vehicle Inspection Report - "+vehicle.reg+" - "+new Date().toLocaleDateString("en-GB");
      var bodyText=[
        "UNINSPECT VEHICLE INSPECTION REPORT",
        "Report ID  : "+reportId,
        "Generated  : "+generatedAt,
        "Office     : "+(office?office.name:"—"),
        "Location   : "+(currentPlace||"—"),
        "GPS        : "+(currentGps?(currentGps.lat+", "+currentGps.lng):"—"),
        "","VEHICLE DETAILS",
        "Registration  : "+vehicle.reg,
        "Make / Model  : "+(vehicle.make||"—"),
        "Owner         : "+(vehicle.owner||"—"),
        "Expired Policy: "+(vehicle.policy||"—"),
        "",remarks?"REMARKS: "+remarks:"",
        "","Photos: "+PHOTO_SLOTS.filter(function(s){return photos[s.id];}).map(function(s){return s.label;}).join(", "),
        "","PDF report is attached.","---","Sent via UniInspect"
      ].join("\n");

      doc.save(pdfFilename);

      setSendStatus("Sending report...");
      var payload={
        reportId   :reportId,
        to         :office.email,
        subject    :subject,
        bodyText   :bodyText,
        pdfBase64  :pdfBase64,
        pdfFilename:pdfFilename,
        officeCode :office.code,
        officeName :office.name,
        brevoKey   :office.brevoKey,
        senderEmail:office.senderEmail,
        savedAt    :new Date().toISOString(),
        registration:vehicle.reg,
        placeName  :currentPlace||"—",
        photos     :photos,
        vehicle    :vehicle,
        gps        :currentGps,
        qrDataUrl  :qrDataUrl,
      };

      try{
        await sendReport(payload);
        setLastReportId(reportId);
        setScreen(SCREEN.DONE);
      }catch(e){
        if(e.message&&(e.message.indexOf("key")!==-1||e.message.indexOf("sender")!==-1||e.message.indexOf("admin")!==-1)){
          setError(e.message);setScreen(SCREEN.INSPECT);setSendStatus("");return;
        }
        await addToQueue(payload);
        lastSavedReport.current=payload;
        refreshQueue();
        setLastReportId(reportId);
        setScreen(SCREEN.SAVED);
      }
    }catch(e){
      setError(e.message||"Something went wrong.");
      setScreen(SCREEN.INSPECT);setSendStatus("");
    }
  }

  async function retryReport(minReport){
    var report=await dbGet(minReport.reportId);
    if(!report){alert("Report data not found.");return;}
    setRetrying(function(r){var n=Object.assign({},r);n[report.reportId]=true;return n;});
    try{
      var sentTimeResult=await getTrueTime();
      var sentTime=sentTimeResult.verified?sentTimeResult.date:new Date();
      var hasUnverified=report.photos&&Object.values(report.photos).some(function(p){return p&&!p.verified;});
      var pdfBase64=report.pdfBase64;
      if(hasUnverified&&report.photos){
        var restampedPhotos=Object.assign({},report.photos);
        for(var slotId in report.photos){
          var ph=report.photos[slotId];
          if(ph&&!ph.verified&&ph.originalDataUrl){
            var slot=PHOTO_SLOTS.find(function(s){return s.id===slotId;});
            if(slot) restampedPhotos[slotId]=Object.assign({},ph,{url:await stampImage(ph.originalDataUrl,slot.label,null,ph.gps,ph.placeName,false,formatTs(sentTime))});
          }
        }
        var doc=await buildPDF({vehicle:report.vehicle,photos:restampedPhotos,generatedAt:formatTs(new Date(report.savedAt)),reportId:report.reportId,gps:report.gps,placeName:report.placeName,qrDataUrl:report.qrDataUrl,officeName:report.officeName});
        pdfBase64=doc.output("datauristring").split(",")[1];
        doc.save(report.pdfFilename.replace(".pdf","_sent.pdf"));
      }
      await sendReport(Object.assign({},report,{pdfBase64:pdfBase64}));
      await removeFromQueue(report.reportId);
      refreshQueue();
    }catch(e){alert("Still failed: "+e.message);}
    setRetrying(function(r){var n=Object.assign({},r);delete n[report.reportId];return n;});
  }

  async function retryAll(){
    var q=getQueue();
    for(var i=0;i<q.length;i++){
      try{var full=await dbGet(q[i].reportId);if(full){await sendReport(full);await removeFromQueue(q[i].reportId);}}catch(e){}
    }
    refreshQueue();
  }

  async function deleteReport(reportId){
    if(!window.confirm("Delete this pending report?")) return;
    await removeFromQueue(reportId);refreshQueue();
  }

  // SENDING
  if(screen===SCREEN.SENDING) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:48,marginBottom:14}},"📤"),
        React.createElement("h2",{style:S.bigTitle},"Please wait..."),
        React.createElement("p",{style:S.subTitle},sendStatus),
        React.createElement("div",{style:S.loaderWrap},React.createElement("div",{style:S.loaderBar}))
      )
    )
  );

  // SAVED
  if(screen===SCREEN.SAVED) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:10}},"⚠️"),
        React.createElement("h2",{style:S.bigTitle},"Saved to Queue"),
        React.createElement("p",{style:{fontSize:13,color:"#64748b",marginBottom:16}},"No internet connection. Report saved and will send automatically when connected."),
        React.createElement("div",{style:Object.assign({},S.reportIdBox,{background:"#fffbeb",border:"1.5px solid #fde68a"})},
          React.createElement("div",{style:{fontSize:10,color:"#92400e",fontWeight:700,marginBottom:4}},"REPORT ID"),
          React.createElement("div",{style:{fontSize:13,fontWeight:800,color:"#0f172a"}},lastReportId)
        ),
        React.createElement("div",{style:{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#15803d"}},"✅ PDF downloaded to your device"),
        React.createElement("div",{style:{background:"#eff6ff",borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:12,color:"#1d4ed8"}},"🔄 Auto-retry every 30 seconds"),
        React.createElement("div",{style:{display:"flex",gap:10}},
          React.createElement("button",{style:S.btn,onClick:async function(){
            if(lastSavedReport.current) await retryReport({reportId:lastSavedReport.current.reportId});
            if(getQueue().findIndex(function(r){return r.reportId===lastSavedReport.current.reportId;})===-1) setScreen(SCREEN.DONE);
          }},"Retry Now"),
          React.createElement("button",{style:Object.assign({},S.btn,{background:"#64748b"}),onClick:function(){
            setPhotos({});setVehicle({reg:"",make:"",owner:"",policy:""});setRemarks("");
            setSendStatus("");setGps(null);setPlaceName(null);setScreen(SCREEN.INSPECT);
          }},"New Inspection")
        )
      )
    )
  );

  // DONE
  if(screen===SCREEN.DONE) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.center},
      React.createElement("div",{style:S.centerCard},
        React.createElement("div",{style:{fontSize:52,marginBottom:10}},"✅"),
        React.createElement("h2",{style:S.bigTitle},"Report Sent!"),
        React.createElement("p",{style:S.subTitle},"Delivered to "+(office?office.name:"")),
        React.createElement("div",{style:S.reportIdBox},
          React.createElement("div",{style:{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}},"Report ID"),
          React.createElement("div",{style:{fontSize:14,fontWeight:800,color:"#0f172a"}},lastReportId)
        ),
        placeName&&React.createElement("div",{style:S.locationBox},placeName),
        React.createElement("div",{style:S.tags},
          React.createElement("span",{style:S.tag},vehicle.reg),
          React.createElement("span",{style:S.tag},PHOTO_SLOTS.filter(function(s){return photos[s.id];}).length+" photos"),
          React.createElement("span",{style:S.tag},gps?"GPS Active":"No GPS")
        ),
        React.createElement("p",{style:{fontSize:12,color:"#64748b",marginBottom:20}},"PDF downloaded to your device."),
        React.createElement("button",{style:S.btn,onClick:function(){
          setPhotos({});setVehicle({reg:"",make:"",owner:"",policy:""});setRemarks("");
          setSendStatus("");setGps(null);setPlaceName(null);setLastReportId("");setScreen(SCREEN.INSPECT);
        }},"Start New Inspection")
      )
    )
  );

  // QUEUE
  if(screen===SCREEN.QUEUE) return React.createElement("div",{style:S.page},
    React.createElement("div",{style:S.header},
      React.createElement("div",{style:S.headerRow},
        React.createElement("button",{style:{background:"transparent",border:"none",color:"#fff",fontSize:16,cursor:"pointer",padding:"4px 8px"},onClick:function(){setScreen(SCREEN.INSPECT);}},"← Back"),
        React.createElement("div",{style:S.brand},"Pending Reports"),
        React.createElement("div",{style:{width:60}})
      )
    ),
    React.createElement("div",{style:S.body},
      queue.length===0
        ?React.createElement("div",{style:Object.assign({},S.card,{textAlign:"center",padding:"40px 20px"})},
            React.createElement("div",{style:{fontSize:48,marginBottom:12}},"✅"),
            React.createElement("div",{style:{fontSize:16,fontWeight:700,color:"#0f172a"}},"No Pending Reports"),
            React.createElement("p",{style:{color:"#64748b",fontSize:13}},"All reports sent successfully.")
          )
        :React.createElement(React.Fragment,null,
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"14px 0 8px"}},
              React.createElement("div",{style:{fontSize:13,color:"#64748b",fontWeight:600}},queue.length+" report"+(queue.length>1?"s":"")+" pending"),
              React.createElement("button",{style:{background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"},onClick:retryAll},"Retry All")
            ),
            queue.map(function(report){
              return React.createElement("div",{key:report.reportId,style:S.queueCard},
                React.createElement("div",{style:S.queueHeader},
                  React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"#f59e0b"}},"⏳ PENDING"),
                  React.createElement("div",{style:{fontSize:10,color:"#94a3b8"}},new Date(report.savedAt).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}))
                ),
                React.createElement("div",{style:{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:4}},report.registration),
                React.createElement("div",{style:{fontSize:12,color:"#64748b",marginBottom:2}},report.officeName),
                React.createElement("div",{style:{fontSize:11,color:"#94a3b8",marginBottom:4}},report.placeName),
                React.createElement("div",{style:{fontSize:10,color:"#94a3b8",marginBottom:4,fontFamily:"monospace"}},report.reportId),
                React.createElement("div",{style:{fontSize:11,color:isSameDay(report.savedAt)?"#f59e0b":"#dc2626",fontWeight:700,marginBottom:10}},
                  isSameDay(report.savedAt)?"⏳ Expires today at midnight":"❌ Expired — cannot send"
                ),
                React.createElement("div",{style:{display:"flex",gap:8}},
                  React.createElement("button",{
                    style:{flex:1,background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"},
                    onClick:function(){retryReport(report);},
                    disabled:retrying[report.reportId]||!isSameDay(report.savedAt)
                  },retrying[report.reportId]?"Sending...":"Retry Now"),
                  React.createElement("button",{
                    style:{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer"},
                    onClick:function(){deleteReport(report.reportId);}
                  },"Delete")
                )
              );
            })
          )
    )
  );

  // INSPECT
  return React.createElement("div",{style:S.page},

    showAdmin&&React.createElement(AdminPanel,{onClose:function(){setShowAdmin(false);}}),

    previewPhoto&&React.createElement(PhotoPreview,{
      photo:previewPhoto,
      onClose:function(){setPreviewPhoto(null);},
      onRetake:function(){setPreviewPhoto(null);openCamera(previewPhoto.slotId);}
    }),

    camOpen&&React.createElement("div",{style:S.camOverlay},
      React.createElement("div",{style:S.camContainer},
        React.createElement("div",{style:S.camHeader},
          React.createElement("button",{style:S.camCloseBtn,onClick:closeCamera},"✕"),
          React.createElement("div",{style:S.camTitle},activeSlot&&PHOTO_SLOTS.find(function(s){return s.id===activeSlot;})?PHOTO_SLOTS.find(function(s){return s.id===activeSlot;}).label+" Photo":"Camera"),
          React.createElement("button",{style:S.camSwitchBtn,onClick:switchCamera},"🔄")
        ),
        React.createElement("video",{ref:videoRef,style:S.camVideo,autoPlay:true,playsInline:true,muted:true}),
        React.createElement("div",{style:S.camHint},camFacing==="user"?"Front camera — tap 🔄 to switch":"Rear camera"),
        React.createElement("div",{style:S.camCaptureRow},
          React.createElement("button",{style:S.camCaptureBtn,onClick:captureFromCamera},
            React.createElement("div",{style:S.camCaptureInner})
          )
        )
      )
    ),

    updateAvailable&&React.createElement("div",{style:S.updateBanner},
      React.createElement("span",null,"🆕 New version available!"),
      React.createElement("button",{style:S.updateBtn,onClick:applyUpdate},"Update Now")
    ),

    React.createElement("div",{style:S.header},
      React.createElement("div",{style:S.headerRow},
        React.createElement("div",{onClick:handleLogoTap,style:{cursor:"pointer"}},
          React.createElement("div",{style:S.brand},"🛡️ UniInspect"),
          React.createElement("div",{style:S.brandSub},office?office.name:"Vehicle Inspection")
        ),
        queue.length>0
          ?React.createElement("button",{style:{background:"#f59e0b",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"},onClick:function(){setScreen(SCREEN.QUEUE);}},"⏳ "+queue.length+" pending")
          :office&&React.createElement("div",{style:S.officePill},"🏢 "+office.name)
      ),
      placeName&&React.createElement("div",{style:S.fromBadge},placeName)
    ),

    React.createElement("div",{style:S.body},

      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Vehicle Details"),
        React.createElement("div",{style:{marginBottom:14}},
          React.createElement("label",{style:S.label},"Registration Number *"),
          React.createElement("input",{style:S.input,placeholder:"e.g. KL03AA0006",value:vehicle.reg,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{reg:e.target.value.toUpperCase()});})}})
        ),
        React.createElement("div",{style:S.twoCol},
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Make & Model"),
            React.createElement("input",{style:S.input,placeholder:"e.g. Maruti Swift",value:vehicle.make,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{make:e.target.value});})}})
          ),
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:S.label},"Owner Name"),
            React.createElement("input",{style:S.input,placeholder:"Full name",value:vehicle.owner,
              onChange:function(e){setVehicle(function(v){return Object.assign({},v,{owner:e.target.value});})}})
          )
        ),
        React.createElement("div",null,
          React.createElement("label",{style:S.label},"Expired Policy Number"),
          React.createElement("input",{style:S.input,placeholder:"e.g. POL/2023/00123",value:vehicle.policy,
            onChange:function(e){setVehicle(function(v){return Object.assign({},v,{policy:e.target.value});})}})
        )
      ),

      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Office Details"),
        office&&office.code
          ?React.createElement("div",{style:S.officeValidated},
              React.createElement("div",null,React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"#0f172a"}},"🏢 "+office.name)),
              React.createElement("button",{style:S.changeBtn,onClick:function(){setOffice(null);setOfficeCode("");localStorage.removeItem("ui_office");}},"Change")
            )
          :React.createElement("div",null,
              React.createElement("label",{style:S.label},"Office Code *"),
              React.createElement("div",{style:{display:"flex",gap:8}},
                React.createElement("input",{
                  style:Object.assign({},S.input,{textTransform:"uppercase",letterSpacing:2,fontWeight:700,flex:1}),
                  placeholder:"Enter Office Code",value:officeCode,
                  onChange:function(e){setOfficeCode(e.target.value.toUpperCase());setError("");},
                  onKeyDown:function(e){if(e.key==="Enter")handleValidateOffice();}
                }),
                React.createElement("button",{
                  style:{background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"0 16px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"},
                  onClick:handleValidateOffice
                },"Confirm")
              ),
              error&&React.createElement("div",{style:Object.assign({},S.errorBox,{marginTop:8,fontSize:12})},error),
              React.createElement("p",{style:{fontSize:11,color:"#94a3b8",marginTop:6}},"Saved automatically once confirmed")
            )
      ),

      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Capture Photos"),
        React.createElement("p",{style:S.hint},"Tap each box to open camera. Photos are stamped with label, timestamp and GPS automatically."),
        React.createElement("div",{style:S.photoGrid},
          PHOTO_SLOTS.map(function(slot){
            var cap=photos[slot.id];
            return React.createElement("div",{key:slot.id,style:Object.assign({},S.photoCard,cap&&!cap.processing?S.photoCardDone:{})},
              cap
                ?React.createElement(React.Fragment,null,
                    React.createElement("img",{src:cap.url,alt:slot.label,style:Object.assign({},S.photoImg,cap.processing?{opacity:0.5}:{})}),
                    cap.processing&&React.createElement("div",{style:S.processingBadge},"Processing..."),
                    !cap.processing&&React.createElement("div",{style:S.photoBar},
                      React.createElement("span",{style:S.photoBarLbl},slot.icon+" "+slot.label),
                      cap.placeName&&React.createElement("span",{style:{fontSize:9,color:"#22c55e"}},"GPS"),
                      React.createElement("button",{
                        style:Object.assign({},S.retakeBtn,{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe"}),
                        onClick:function(){setPreviewPhoto({url:cap.url,label:slot.label,slotId:slot.id});}
                      },"🔍"),
                      React.createElement("button",{style:S.retakeBtn,onClick:function(){openCamera(slot.id);}},"Retake")
                    )
                  )
                :React.createElement("div",{style:S.photoEmpty,onClick:function(){openCamera(slot.id);}},
                    React.createElement("span",{style:{fontSize:28}},slot.icon),
                    React.createElement("span",{style:S.slotLbl},slot.label),
                    !slot.required&&React.createElement("span",{style:S.optTag},"Optional"),
                    React.createElement("span",{style:S.slotHint},slot.hint),
                    React.createElement("div",{style:S.capBtn},"📷 Capture")
                  )
            );
          })
        ),
        React.createElement("div",{style:S.dots},
          PHOTO_SLOTS.filter(function(s){return s.required;}).map(function(s){
            return React.createElement("div",{key:s.id,style:Object.assign({},S.dot,photos[s.id]&&!photos[s.id].processing?S.dotDone:{})},
              photos[s.id]&&!photos[s.id].processing?"✓":""
            );
          }),
          React.createElement("span",{style:S.dotLbl},
            PHOTO_SLOTS.filter(function(s){return s.required&&photos[s.id]&&!photos[s.id].processing;}).length+" / "+
            PHOTO_SLOTS.filter(function(s){return s.required;}).length+" captured"
          )
        )
      ),

      React.createElement("div",{style:S.card},
        React.createElement("div",{style:S.cardTitle},"Inspector Remarks"),
        React.createElement("textarea",{
          style:Object.assign({},S.input,{height:90,resize:"vertical",fontFamily:"inherit",lineHeight:1.5}),
          placeholder:"Describe any pre-existing damages or observations (optional)...",
          value:remarks,onChange:function(e){setRemarks(e.target.value);}
        })
      ),

      requiredDone&&React.createElement("div",{style:S.securityCard},
        React.createElement("div",{style:{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:10}},"Security Layers Active"),
        [
          ["✓","Office: "+(office?office.name:"—"),true],
          ["✓","Unique Report ID will be generated",true],
          [gps?"✓":"!","GPS: "+(placeName||"Will capture on submit"),!!gps],
          ["✓","QR code on every PDF page",true],
          ["✓","PDF sent to office email",true],
        ].map(function(row,i){
          return React.createElement("div",{key:i,style:S.secRow},
            React.createElement("span",{style:row[2]?S.secTick:S.secWarn},row[0]),
            React.createElement("span",null,row[1])
          );
        })
      ),

      error&&screen===SCREEN.INSPECT&&React.createElement("div",{style:S.errorBox},error),

      React.createElement("button",{
        style:Object.assign({},S.genBtn,!canSubmit?S.genBtnOff:{}),
        disabled:!canSubmit,onClick:handleSubmit
      },"Send Secure Inspection Report"),

      !canSubmit&&React.createElement("p",{style:S.incomplete},
        (!vehicle.reg.trim()?"Enter registration · ":"")+
        (!office?"Enter office code · ":"")+
        (!requiredDone?"Capture all 5 required photos":"")
      )
    )
  );
}

var S={
  page          :{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter','Segoe UI',sans-serif",paddingBottom:48},
  center        :{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",padding:"24px 16px"},
  centerCard    :{background:"#fff",borderRadius:20,padding:"36px 26px",maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,0.10)"},
  bigTitle      :{fontSize:24,fontWeight:800,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-0.5px"},
  subTitle      :{fontSize:13,color:"#64748b",margin:"0 0 20px"},
  loaderWrap    :{height:6,background:"#f1f5f9",borderRadius:6,overflow:"hidden",margin:"20px 0 0"},
  loaderBar     :{height:"100%",background:"linear-gradient(90deg,#3b82f6,#06b6d4)",borderRadius:6,animation:"load 1.4s ease-in-out infinite"},
  reportIdBox   :{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"12px 16px",marginBottom:12,textAlign:"center"},
  locationBox   :{background:"#f0fdf4",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:13,color:"#15803d",fontWeight:600},
  tags          :{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14},
  tag           :{background:"#f1f5f9",color:"#334155",fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20},
  btn           :{background:"#0f172a",color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,cursor:"pointer"},
  header        :{background:"#0f172a",padding:"16px 18px 12px"},
  headerRow     :{display:"flex",justifyContent:"space-between",alignItems:"center"},
  brand         :{fontSize:19,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.5px"},
  brandSub      :{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginTop:2},
  officePill    :{background:"#1e293b",color:"#94a3b8",fontSize:11,padding:"4px 10px",borderRadius:20},
  fromBadge     :{fontSize:11,color:"#22c55e",marginTop:8},
  body          :{maxWidth:480,margin:"0 auto",padding:"0 14px"},
  card          :{background:"#fff",borderRadius:14,padding:"18px 16px",marginTop:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"},
  cardTitle     :{fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid #f1f5f9",paddingBottom:10,marginBottom:14},
  label         :{display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:5},
  input         :{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#0f172a",background:"#f8fafc",boxSizing:"border-box",outline:"none"},
  twoCol        :{display:"flex",gap:10,marginBottom:14},
  hint          :{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:12},
  officeValidated:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"12px 14px"},
  changeBtn     :{background:"transparent",border:"1px solid #cbd5e1",color:"#64748b",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer"},
  photoGrid     :{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  photoCard     :{borderRadius:12,overflow:"hidden",border:"2px dashed #e2e8f0",background:"#f8fafc",minHeight:148,position:"relative"},
  photoCardDone :{border:"2px solid #22c55e"},
  photoImg      :{width:"100%",height:130,objectFit:"cover",display:"block"},
  processingBadge:{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:11,padding:"4px 10px",borderRadius:20,pointerEvents:"none"},
  photoBar      :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",background:"#f0fdf4"},
  photoBarLbl   :{fontSize:11,fontWeight:700,color:"#15803d"},
  retakeBtn     :{fontSize:10,color:"#64748b",background:"transparent",border:"1px solid #cbd5e1",borderRadius:6,padding:"2px 7px",cursor:"pointer"},
  photoEmpty    :{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:12,minHeight:148,cursor:"pointer"},
  slotLbl       :{fontSize:13,fontWeight:700,color:"#334155"},
  slotHint      :{fontSize:10,color:"#94a3b8",textAlign:"center",lineHeight:1.4},
  optTag        :{fontSize:10,background:"#f1f5f9",color:"#94a3b8",padding:"1px 7px",borderRadius:10,fontWeight:600},
  capBtn        :{marginTop:6,background:"#0f172a",color:"#fff",fontSize:12,fontWeight:700,padding:"7px 14px",borderRadius:8},
  dots          :{display:"flex",alignItems:"center",gap:6,marginTop:14,justifyContent:"center"},
  dot           :{width:28,height:28,borderRadius:"50%",border:"2px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#94a3b8",background:"#fff"},
  dotDone       :{background:"#22c55e",border:"2px solid #22c55e",color:"#fff",fontWeight:700},
  dotLbl        :{fontSize:12,color:"#64748b",fontWeight:600},
  securityCard  :{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:12,padding:"14px 16px",marginTop:14},
  secRow        :{display:"flex",gap:8,fontSize:12,color:"#334155",marginBottom:6,alignItems:"flex-start"},
  secTick       :{color:"#22c55e",fontWeight:700,flexShrink:0},
  secWarn       :{color:"#f59e0b",fontWeight:700,flexShrink:0},
  errorBox      :{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:12},
  genBtn        :{width:"100%",background:"#0f172a",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:16},
  genBtnOff     :{opacity:0.35,cursor:"not-allowed"},
  incomplete    :{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.6},
  camOverlay    :{position:"fixed",inset:0,background:"#000",zIndex:200,display:"flex",flexDirection:"column"},
  camContainer  :{display:"flex",flexDirection:"column",height:"100vh",width:"100%"},
  camHeader     :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",background:"rgba(0,0,0,0.8)",position:"absolute",top:0,left:0,right:0,zIndex:10},
  camCloseBtn   :{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",fontSize:16,cursor:"pointer"},
  camTitle      :{fontSize:16,fontWeight:700,color:"#fff"},
  camSwitchBtn  :{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",fontSize:18,cursor:"pointer"},
  camVideo      :{width:"100%",height:"100%",objectFit:"cover",flex:1},
  camHint       :{position:"absolute",top:72,left:0,right:0,textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.7)",padding:"6px"},
  camCaptureRow :{position:"absolute",bottom:40,left:0,right:0,display:"flex",justifyContent:"center"},
  camCaptureBtn :{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,0.3)",border:"4px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},
  camCaptureInner:{width:54,height:54,borderRadius:"50%",background:"#fff"},
  previewOverlay :{position:"fixed",inset:0,background:"#000",zIndex:250,display:"flex",flexDirection:"column"},
  previewHeader :{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",background:"rgba(0,0,0,0.9)",flexShrink:0},
  previewClose  :{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",fontSize:16,cursor:"pointer"},
  previewImgWrap:{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"},
  previewImg    :{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",transformOrigin:"center center",userSelect:"none",WebkitUserSelect:"none"},
  previewHint   :{textAlign:"center",color:"rgba(255,255,255,0.5)",fontSize:11,padding:"8px",flexShrink:0},
  previewActions:{display:"flex",gap:12,padding:"16px 20px",background:"rgba(0,0,0,0.9)",flexShrink:0},
  updateBanner  :{position:"fixed",top:0,left:0,right:0,background:"#1d4ed8",color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",zIndex:300,fontSize:13,fontWeight:600},
  updateBtn     :{background:"#fff",color:"#1d4ed8",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"},
  adminOverlay  :{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"},
  adminModal    :{background:"#fff",borderRadius:16,padding:"30px 24px",maxWidth:360,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"},
  queueCard     :{background:"#fff",borderRadius:14,padding:"16px",marginTop:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1.5px solid #fde68a"},
  queueHeader   :{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
};

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));
