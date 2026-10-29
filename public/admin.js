const T = JSON.parse(document.getElementById('T').textContent);
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', async () => {
  const i = b.previousElementSibling; i.select(); try { await navigator.clipboard.writeText(i.value); } catch { document.execCommand('copy'); }
  const o = b.textContent; b.textContent = T.a_copied; setTimeout(() => b.textContent = o, 1200);
}));
