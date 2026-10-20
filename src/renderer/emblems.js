'use strict';
// Стилизованные гербы фракций (собственная отрисовка, не официальная символика).
// Рисуются цветом currentColor, поэтому подходят и для фона, и для иконок в переключателе.

(() => {
  const SHIELD_OUT = 'M100 8 L184 36 V112 C184 168 148 206 100 230 C52 206 16 168 16 112 V36 Z';
  const SHIELD_IN = 'M100 24 L168 47 V112 C168 158 139 190 100 212 C61 190 32 158 32 112 V47 Z';

  // Лавровые ветви внизу щита
  const laurel = (() => {
    const leaves = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = 62 - 14 * Math.sin(t * 1.4);
      const y = 196 - t * 58;
      const a = -40 - t * 30;
      leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="3.6" transform="rotate(${a.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
      leaves.push(`<ellipse cx="${(200 - x).toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="3.6" transform="rotate(${(-a).toFixed(0)} ${(200 - x).toFixed(1)} ${y.toFixed(1)})"/>`);
    }
    return `<g fill="currentColor" opacity=".85">${leaves.join('')}</g>`;
  })();

  const STAR = '100,67 111.17,99.63 145.65,100.17 118.07,120.87 128.21,153.83 100,134 71.79,153.83 81.93,120.87 54.35,100.17 88.83,99.63';

  const scales = (cx, cy, w) => `
    <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${cx} ${cy - 30} V${cy + 62}"/>
      <path d="M${cx - w} ${cy - 18} H${cx + w}"/>
      <path d="M${cx - 26} ${cy + 64} H${cx + 26}"/>
      <path d="M${cx - w} ${cy - 18} L${cx - w - 16} ${cy + 26} M${cx - w} ${cy - 18} L${cx - w + 16} ${cy + 26}"/>
      <path d="M${cx + w} ${cy - 18} L${cx + w - 16} ${cy + 26} M${cx + w} ${cy - 18} L${cx + w + 16} ${cy + 26}"/>
      <path d="M${cx - w - 20} ${cy + 26} Q${cx - w} ${cy + 46} ${cx - w + 20} ${cy + 26} Z"/>
      <path d="M${cx + w - 20} ${cy + 26} Q${cx + w} ${cy + 46} ${cx + w + 20} ${cy + 26} Z"/>
    </g>
    <circle cx="${cx}" cy="${cy - 34}" r="6" fill="currentColor"/>`;

  const sword = (cx, top, len) => `
    <g fill="currentColor">
      <path d="M${cx} ${top} L${cx + 8} ${top + 14} V${top + len} H${cx - 8} V${top + 14} Z"/>
      <rect x="${cx - 30}" y="${top + len}" width="60" height="9" rx="3"/>
      <rect x="${cx - 5}" y="${top + len + 9}" width="10" height="24" rx="2"/>
      <circle cx="${cx}" cy="${top + len + 39}" r="7"/>
    </g>`;

  const SYMBOLS = {
    // Руль и дорога
    gibdd: `
      <g fill="none" stroke="currentColor" stroke-width="8">
        <circle cx="100" cy="114" r="42"/>
        <circle cx="100" cy="114" r="11" fill="currentColor"/>
        <path d="M60 104 Q100 92 140 104 M100 125 V154" stroke-linecap="round"/>
      </g>
      <path d="M84 170 L80 186 M100 170 V186 M116 170 L120 186" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    // Звезда
    uvd: `<polygon points="${STAR}" fill="currentColor"/>
      <circle cx="100" cy="112" r="56" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3 7"/>`,
    // Меч
    fsb: `${sword(100, 56, 96)}
      <path d="M58 92 Q100 70 142 92" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    // Весы
    lawyer: scales(100, 100, 44),
    // Меч и весы
    sk: `${sword(100, 58, 92)}
      <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M56 86 H144"/>
        <path d="M56 86 L44 120 M56 86 L68 120 M144 86 L132 120 M144 86 L156 120"/>
        <path d="M40 120 Q56 136 72 120 Z M128 120 Q144 136 160 120 Z"/>
      </g>`,
  };

  function emblem(key, opts = {}) {
    const sym = SYMBOLS[key] || SYMBOLS.uvd;
    const small = opts.small;
    return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${SHIELD_OUT}" fill="none" stroke="currentColor" stroke-width="${small ? 12 : 6}"/>
      ${small ? '' : `<path d="${SHIELD_IN}" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/>`}
      ${sym}
      ${small ? '' : laurel}
    </svg>`;
  }

  window.emblem = emblem;
})();
