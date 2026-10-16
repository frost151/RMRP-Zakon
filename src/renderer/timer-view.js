'use strict';
// Общие расчёты отображения таймера задержания для планшета и мини-окна.

(() => {
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const WAIT_TEXT = {
    lawyer: { response: 'Адвокат: ждём ответа', arrival: 'Адвокат: едет' },
    gov: { response: 'СК/прокуратура/рук.: ждём ответа', arrival: 'СК/прокуратура/рук.: едут' },
  };

  // Состояние из главного процесса + сдвиг часов → то, что показываем сейчас
  function view(st, offset) {
    const now = Date.now() + offset;
    const elapsed = st.running && !st.paused ? st.elapsedNow + (now - st.now) : st.elapsedNow;
    const left = st.limit - elapsed;
    const waits = [];
    for (const who of ['lawyer', 'gov']) {
      const w = st[who];
      if (w) waits.push({ who, text: WAIT_TEXT[who][w.phase], left: st.waits[who][w.phase] - (now - w.since) });
    }
    let short = null;
    if (st.short) {
      short = {
        text: st.short.kind === 'call' ? 'Звонок задержанного' : 'Беседа с адвокатом',
        left: st.shortLimits[st.short.kind] - (now - st.short.since),
      };
    }
    return { elapsed, left, waits, short };
  }

  window.timerView = { view, fmt };
})();
