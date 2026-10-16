'use strict';
// Мини-окно: оставшееся время задержания и ожидания, пока планшет скрыт.

const { view, fmt } = window.timerView;
let st = null;
let offset = 0;

function render() {
  if (!st) return;
  const v = view(st, offset);
  const box = document.getElementById('box');
  box.className = `box${st.expired ? ' expired' : st.paused ? ' paused' : ''}`;
  document.getElementById('time').textContent = st.expired ? '0:00' : fmt(v.left);
  document.getElementById('label').textContent = st.expired
    ? 'ВРЕМЯ ИСТЕКЛО'
    : `${st.flags.prelim ? 'ПРЕДВ. ЗАДЕРЖАНИЕ' : 'ЗАДЕРЖАНИЕ'}${st.paused ? ' · ПАУЗА' : ''}`;
  const lines = [...v.waits.map((w) => `${w.text} ${fmt(w.left)}`)];
  if (v.short) lines.push(`${v.short.text} ${fmt(v.short.left)}`);
  if (st.flags.gov && !lines.length) lines.push('Задержан госслужащий');
  document.getElementById('sub1').textContent = lines[0] || '';
  document.getElementById('sub2').textContent = lines[1] || '';
}

function apply(s) {
  st = s;
  offset = 0;
  render();
}

window.api.init().then((init) => apply(init.detention));
window.api.onDetState(apply);
document.getElementById('open').addEventListener('click', () => window.api.win('show'));
setInterval(render, 250);
