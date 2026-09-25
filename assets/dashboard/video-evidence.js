/* Shared bounded Video Evidence Mode for Factory and Discovery. The visible canvas is the capture source. */
(()=>{'use strict';window.AgentControlVideoEvidence={start(canvas,{onData=()=>{},onStop=()=>{},maximumMs=90000,maximumBytes=32*1024*1024}={}){
 if(!window.MediaRecorder||!canvas?.captureStream)throw Error('Video Evidence Mode unavailable');const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('WebM encoder unavailable');
 const stream=canvas.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000}),chunks=[];let bytes=0,timer;
 const stop=()=>{if(recorder.state!=='inactive')recorder.stop();};recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;onData(e.data);if(bytes>=maximumBytes)stop();}};
 recorder.onstop=()=>{clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());onStop(new Blob(chunks,{type:mime}));};recorder.onerror=stop;recorder.start(500);timer=setTimeout(stop,maximumMs);
 return{get state(){return recorder.state;},stop,mime};
}};})();
