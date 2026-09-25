(() => {
 const initialise=()=>{
  const nav=document.querySelector('.primary-nav'),header=document.querySelector('.topbar');
  const toggle=document.createElement('button');toggle.id='mobile-navigation';toggle.className='button secondary';toggle.textContent='Views';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','control-navigation');nav.id='control-navigation';header.append(toggle);
  const close=()=>{nav.classList.remove('mobile-open');toggle.setAttribute('aria-expanded','false');};
  toggle.onclick=()=>{const open=nav.classList.toggle('mobile-open');toggle.setAttribute('aria-expanded',String(open));};
  nav.addEventListener('click',e=>{if(e.target.closest('[data-view]'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  const deployment=document.createElement('section');deployment.id='deployment-status';deployment.className='home-welcome';deployment.hidden=true;
  document.getElementById('home-workspace').prepend(deployment);
  async function refresh(){
   if(state.operatorAuth!=='authenticated')return;
   try{
    const response=await fetch('/api/deployment',{headers:{Authorization:'Bearer '+state.token}});if(!response.ok)return;const d=await response.json();
    if(d.profile!=='ANDROID_STANDALONE_WEB')return;
    deployment.hidden=false;deployment.replaceChildren();
    const title=document.createElement('h2');title.textContent='Running on this Android phone';
    const detail=document.createElement('p');detail.textContent=d.label+' · Android '+d.androidVersion+' · '+d.architecture+' · '+d.runtimeVersion;
    const local=document.createElement('p');local.textContent='Controller, jobs and evidence are local. Models and remote machines are optional.';
    const status=document.createElement('p');status.textContent='Available RAM: '+(d.availableRamBytes===null?'unknown':Math.round(d.availableRamBytes/1024**2)+' MiB')+'. Battery, thermal and network metering: unavailable. Model benchmarks require fresh resource evidence.';
    const recovery=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='Android background limits and recovery';text.textContent='Android may suspend or terminate Termux. Keep the terminal session running; if stopped, reopen Termux and run node scripts/android-standalone.mjs start. The PWA cannot keep the controller running. Review interrupted jobs before approving another attempt.';recovery.append(summary,text);
    deployment.append(title,detail,local,status,recovery);
   }catch{}
  }
  setInterval(()=>{if(!document.hidden)void refresh();},15000);void refresh();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise);else initialise();
})();
