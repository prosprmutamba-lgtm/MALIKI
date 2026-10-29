(() => {
  const env = document.getElementById('env'), inv = document.getElementById('inv');
  const open = () => { env.classList.add('open'); inv.classList.remove('hidden'); setTimeout(() => env.remove(), 900); };
  env.addEventListener('click', open); env.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
  const T = JSON.parse(document.getElementById('T').textContent), cd = document.getElementById('cd'), target = new Date(cd.dataset.target);
  if (isNaN(target)) { cd.textContent = T.tbd; return; }
  const tick = () => { let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const v = [[Math.floor(s / 86400), 'd'], [Math.floor(s % 86400 / 3600), 'h'], [Math.floor(s % 3600 / 60), 'm'], [s % 60, 's']];
    cd.innerHTML = v.map(([n, k]) => `<div><b>${n}</b>${T[k]}</div>`).join(''); };
  tick(); setInterval(tick, 1000);
})();
