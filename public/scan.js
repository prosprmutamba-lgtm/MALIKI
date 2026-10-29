const T = JSON.parse(document.getElementById('T').textContent), out = document.getElementById('out'), csrf = document.getElementById('csrf').value;
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf': csrf }, body: JSON.stringify(b) }).then(r => r.json());
const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
function show(res) {
  out.replaceChildren();
  if (!res.results.length) { out.append(el('div', T[res.code || 's_none'], 'card bad')); return; }
  for (const i of res.results) {
    const c = el('div', null, 'card ' + (i.status === 'confirmed' && !i.entered ? 'ok' : 'bad'));
    c.append(el('h2', `#${i.number} ${i.household || ''}`));
    if (i.status !== 'confirmed') { c.append(el('p', T.s_notconf)); out.append(c); continue; }
    c.append(el('p', (i.names || []).join(', ')), el('p', i.seats === 2 ? T.s_couple : T.s_single, 'muted'),
      el('p', `${T.s_allowed}: ${i.seats} · ${T.s_declared}: ${i.guests}`));
    if (i.entered) c.append(el('p', T.s_dup, 'err'));
    else { const b = el('button', T.s_enter); b.onclick = async () => { b.disabled = true; const r = await post('/admin/api/checkin', { id: i.id });
      c.className = 'card ' + (r.ok ? 'ok' : 'bad'); b.replaceWith(el('p', T[r.code])); }; c.append(b); }
    out.append(c);
  }
}
document.getElementById('sf').addEventListener('submit', async e => { e.preventDefault(); show(await post('/admin/api/lookup', { q: document.getElementById('q').value })); });
document.getElementById('start').addEventListener('click', async () => {
  const v = document.getElementById('v'), cv = document.getElementById('cv'), ctx = cv.getContext('2d', { willReadFrequently: true });
  try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); await v.play(); }
  catch { document.getElementById('cam').textContent = T.s_nocam; return; }
  const det = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null; let busy = false, last = '';
  const loop = async () => {
    if (!busy && v.videoWidth) { busy = true; let code = '';
      try { if (det) { const r = await det.detect(v); code = r[0]?.rawValue || ''; }
        else { cv.width = v.videoWidth; cv.height = v.videoHeight; ctx.drawImage(v, 0, 0); const d = ctx.getImageData(0, 0, cv.width, cv.height); code = jsQR(d.data, d.width, d.height)?.data || ''; } } catch {}
      if (code && code !== last) { last = code; show(await post('/admin/api/lookup', { qr: code })); } busy = false; }
    requestAnimationFrame(loop); };
  loop();
});
