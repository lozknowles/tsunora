'use strict';
const el = id => document.getElementById(id);
let token = sessionStorage.getItem('agent-control-operator-token') || '';
async function api(route = '') {
  const response = await fetch('/api/social-voice' + route, {headers: {Authorization: 'Bearer ' + token}});
  if (!response.ok) throw new Error('Authenticate with the dashboard operator token.');
  return response.json();
}
function describe(detail) {
  if (detail.text || detail.reason || detail.template) return detail.text || detail.reason || detail.template;
  if (detail.metrics) return 'Provider ' + detail.metrics.provider + ' | ' + Math.round(detail.metrics.elapsedMs) + ' ms | RTF ' + Number(detail.metrics.rtf).toFixed(2);
  if (detail.parcelId) return 'Work Parcel ' + detail.parcelId + ' | ' + (detail.status || 'accepted');
  return detail.classification || 'Recorded governed transition';
}
async function refresh() {
  try {
    const s = await api();
    el('notice').textContent = s.state === 'not_configured' ? 'Social & Voice is not configured on this controller.' : 'Authenticated | private operational history';
    el('content').hidden = s.state === 'not_configured';
    if (s.state) return;
    el('social').textContent = s.provider + ' | ' + (s.health?.social?.state || 'unchecked');
    el('counts').textContent = s.inbox.map(x => x.count + ' ' + x.state + ' requests').join(' | ') || 'No requests yet';
    el('voice').textContent = s.voice ? s.voice.id + ' | ' + s.voice.kind + ' | ' + s.voice.provider + ' | ' + (s.health?.speech?.state || 'unchecked') : 'No speech provider configured';
    const average = event => {
      const ms = s.history.filter(x => x.event === event).map(x => JSON.parse(x.detail).metrics).filter(Boolean);
      return ms.length ? ms.length + ' operations | ' + Math.round(ms.reduce((n, m) => n + m.elapsedMs, 0) / ms.length) + ' ms average | RTF ' + (ms.reduce((n, m) => n + m.rtf, 0) / ms.length).toFixed(2) : 'No measurements yet';
    };
    el('metrics').textContent = 'Speech: ' + average('speech.synthesized') + ' | Recognition (' + (s.health?.recognition?.state || 'unchecked') + '): ' + average('speech.transcribed');
    el('jobs').replaceChildren();
    for (const j of s.jobs) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = '/?parcel=' + encodeURIComponent(j.parcel);
      a.textContent = 'AC-' + j.number + ' | ' + (j.status || 'QUEUED');
      li.append(a); el('jobs').append(li);
    }
    el('events').replaceChildren();
    for (const e of s.history) {
      const li = document.createElement('li'), strong = document.createElement('strong'), pre = document.createElement('pre');
      strong.textContent = new Date(e.at).toISOString() + ' | ' + e.event;
      pre.textContent = describe(JSON.parse(e.detail));
      li.append(strong, pre); el('events').append(li);
    }
  } catch (error) { el('notice').textContent = error.message; }
}
el('auth').onsubmit = event => {
  event.preventDefault(); token = el('token').value; el('token').value = '';
  sessionStorage.setItem('agent-control-operator-token', token); refresh();
};
el('transcript').onclick = async () => {
  try {
    const s = await api('/transcript'), url = URL.createObjectURL(new Blob([s.transcript], {type: 'text/plain'})), a = document.createElement('a');
    a.href = url; a.download = 'social-voice-narrative.txt'; a.click(); URL.revokeObjectURL(url);
  } catch (error) { el('notice').textContent = error.message; }
};
if (token) refresh();
setInterval(() => { if (token) refresh(); }, 5000);
