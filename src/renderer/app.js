'use strict';
// Окно планшета: фракции, законы, поиск, калькулятор наказаний («Дело») и таймер задержания.

const $ = (id) => document.getElementById(id);
const state = {
  factions: {},
  settings: {},
  laws: [],
  index: new Map(), // 'uk|37.1' → { law, a, p }
  lawId: null,
  query: '',
  checkedAt: 0,
  picks: [],
  tab: 'case',
  det: null,
  checklist: {},
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
const range = (r, f) => (r.min === r.max ? f(r.min) : `${r.min}–${f(r.max)}`);
const years = (n) => `${n} ${plural(n, 'год', 'года', 'лет')}`;
const days = (n) => `${n} ${plural(n, 'сутки', 'суток', 'суток')}`;
const money = (n) => `${n.toLocaleString('ru-RU')} ₽`;
const moneyRange = (r) => (r.min === r.max ? money(r.min) : `${money(r.min)} – ${money(r.max)}`);

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* не критично */ } },
};

// --- Фракции ---

function faction() {
  return state.factions[state.settings.faction] || state.factions.all;
}

function renderFactions() {
  $('factions').innerHTML = Object.entries(state.factions).map(([key, f]) => `
    <button class="faction" data-faction="${key}" style="--fc:${f.color}" aria-pressed="${key === state.settings.faction}" title="${esc(f.org)}">
      ${window.emblem(key, { small: true })}<span class="name">${esc(f.name)}</span>
    </button>`).join('');
}

function applyFaction() {
  const f = faction();
  document.documentElement.style.setProperty('--accent', f.color);
  $('bgEmblem').innerHTML = window.emblem(state.settings.faction);
  $('orgName').textContent = f.org;
  for (const b of document.querySelectorAll('.faction')) {
    b.setAttribute('aria-pressed', String(b.dataset.faction === state.settings.faction));
  }
  // инструменты, которых нет у фракции (у адвоката — задержание), скрываем
  for (const el of document.querySelectorAll('[data-tool]')) el.hidden = !f.tools.includes(el.dataset.tool);
  if (state.tab === 'det' && !f.tools.includes('timers')) setTab('case');
}

async function selectFaction(key) {
  if (key === state.settings.faction) return;
  state.settings.faction = key;
  applyFaction();
  playUiSound('faction', Object.keys(state.factions).indexOf(key));
  state.lawId = null;
  renderAll();
  await window.api.setSettings({ faction: key });
}

// --- Законы ---

function setLaws(laws) {
  state.laws = laws;
  state.index.clear();
  for (const law of laws) {
    for (const a of law.articles) {
      if (a.sanction) state.index.set(`${law.key}|${a.num}`, { law, a, p: null });
      for (const p of a.parts) if (p.sanction) state.index.set(`${law.key}|${p.code}`, { law, a, p });
    }
  }
}

function orderedLaws() {
  const docs = faction().docs;
  const main = docs.map((k) => state.laws.find((l) => l.key === k)).filter(Boolean);
  const rest = state.laws.filter((l) => !main.includes(l)).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return { main, rest };
}

function currentLaw() {
  const { main, rest } = orderedLaws();
  return state.laws.find((l) => l.id === state.lawId) || main[0] || rest[0] || null;
}

const WEEK = 7 * 24 * 3600;
function lawItem(l, active) {
  const fresh = l.lastTime && Date.now() / 1000 - l.lastTime < WEEK;
  const sub = l.short === l.title ? '' : l.title;
  return `<button class="law-item${active ? ' active' : ''}" data-law="${esc(l.id)}" title="${esc(l.title)}">
    <span class="t">${esc(l.short)}${fresh ? '<span class="new">ОБН</span>' : ''}</span>
    ${sub ? `<span class="s">${esc(sub)}</span>` : ''}
  </button>`;
}

function renderLaws() {
  const { main, rest } = orderedLaws();
  const cur = state.query ? null : currentLaw();
  const item = (l) => lawItem(l, cur && l.id === cur.id);
  $('laws').innerHTML = `
    <h4>${esc(faction().name === 'Все' ? 'Основные' : `Для: ${faction().name}`)}</h4>
    ${main.map(item).join('') || '<p class="hint">Нет загруженных законов</p>'}
    ${rest.length ? `<h4>Прочее законодательство</h4>${rest.map(item).join('')}` : ''}`;
}

// --- Санкции ---

function sanctionText(s, mode) {
  const out = [];
  if (s.fine && (!mode || mode === 'fine')) out.push(`Штраф ${moneyRange(s.fine)}`);
  if (s.arrest && (!mode || mode === 'arrest')) out.push(`Арест ${range(s.arrest, days)}`);
  if (s.prison && (!mode || mode === 'prison')) out.push(`Лишение свободы ${range(s.prison, years)}`);
  if (s.license && (!mode || mode === 'license')) out.push('Лишение прав');
  // в законах РМРП виды наказания в одной санкции — альтернативы («штраф или лишение свободы»)
  return out.join(window.calc.licenseIsAlternative(s) || out.length < 3 ? ' или ' : ' · ');
}

const starsHtml = (s) => {
  const n = window.calc.stars(s.raw);
  return n ? `<span class="stars" title="Уровень розыска (СПРП)">${'★'.repeat(n)}</span>` : '';
};

function sanctionsHtml(law, a, focus) {
  const chips = [];
  const chip = (code, s, label) => {
    const id = `${law.key}|${code}`;
    const on = state.picks.some((p) => p.id === id);
    const cls = `sanction pick${on ? ' on' : ''}${focus === code ? ' focus' : ''}`;
    return `<button class="${cls}" data-pick="${esc(id)}" title="${on ? 'Убрать из дела' : 'Добавить в дело'}">
      <span class="plus">${on ? '✓' : '+'}</span>${label ? `<b>${esc(label)}</b>` : ''}${esc(sanctionText(s))}${starsHtml(s)}
    </button>`;
  };
  if (a.sanction) chips.push(chip(a.num, a.sanction, ''));
  for (const p of a.parts) if (p.sanction) chips.push(chip(p.code, p.sanction, `ч. ${p.code}`));
  return chips.length ? `<div class="sanctions">${chips.join('')}</div>` : '';
}

// --- Статьи ---

function highlight(text, words) {
  const html = esc(text);
  if (!words.length) return html;
  const re = new RegExp(`(${words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return html.replace(re, '<mark>$1</mark>');
}

function articleHtml(a, law, opts = {}) {
  const tags = [];
  if (a.repealed) tags.push('<span class="tag repealed">УТРАТИЛА СИЛУ</span>');
  else if (a.amended) {
    const d = new Date(a.amended.time * 1000).toLocaleDateString('ru-RU');
    const what = { added: 'ДОБАВЛЕНА', repealed: 'ОТМЕНЕНА', updated: 'ИЗМЕНЕНА' }[a.amended.kind];
    tags.push(`<span class="tag amended" title="Поправка от ${d}">${what} ${d}</span>`);
  }
  const long = a.text.length > 420;
  return `<article class="art${a.repealed ? ' repealed' : ''}">
    <div class="art-head">
      ${opts.showLaw ? `<span class="art-law">${esc(law.short)}</span>` : ''}
      <span class="art-num">Ст. ${esc(a.num)}</span>
      <span class="art-title">${highlight(a.title, opts.words || [])}</span>
      ${tags.join('')}
    </div>
    ${a.text ? `<div class="art-text${long ? ' clamp' : ''}">${highlight(a.text, opts.words || [])}</div>` : ''}
    ${long ? '<button class="more">Показать полностью</button>' : ''}
    ${sanctionsHtml(law, a, opts.focus)}
  </article>`;
}

function renderLaw(law) {
  const date = law.lastTime ? new Date(law.lastTime * 1000).toLocaleDateString('ru-RU') : '—';
  let chapter = null;
  const body = law.articles.map((a) => {
    let head = '';
    if (a.chapter && a.chapter !== chapter) {
      chapter = a.chapter;
      head = `<div class="chapter">${esc(chapter)}</div>`;
    }
    return head + articleHtml(a, law);
  }).join('');
  $('viewer').innerHTML = `
    <div class="law-head">
      <h1>${esc(law.title)}</h1>
      <div class="meta">
        <span>Статей: ${law.articles.length}</span>
        <span>Последнее изменение: ${date}</span>
        <a href="${esc(law.url)}" target="_blank">Открыть на форуме ↗</a>
      </div>
    </div>
    ${body || (law.preamble ? `<div class="art"><div class="art-text">${esc(law.preamble)}</div></div>` : '<div class="empty">В этой теме не найдено статей.</div>')}`;
}

// --- Поиск ---

const NUM_RE = /^[\dIVXLC]+(?:[.\-]\d+)*$/i;
const CALC_DOCS = ['uk', 'koap'];

function aliasMap() {
  const m = new Map();
  for (const l of state.laws) for (const a of [...l.aliases, norm(l.short)]) if (!m.has(a)) m.set(a, l);
  return m;
}

// «ук 63 64 коап 9.3» → [{ law: УК, num: '63' }, { law: УК, num: '64' }, { law: КоАП, num: '9.3' }]
// Если в запросе есть слова, которые не номер и не название закона, возвращает null (обычный поиск по тексту)
function parseNumbers(q) {
  const aliases = aliasMap();
  const tokens = q.replace(/[,;]+/g, ' ').split(' ').filter(Boolean);
  const out = [];
  let law = null;
  for (let i = 0; i < tokens.length;) {
    let matched = false;
    for (let n = 3; n >= 1 && !matched; n--) {
      const l = aliases.get(tokens.slice(i, i + n).join(' '));
      if (l) { law = l; i += n; matched = true; }
    }
    if (matched) continue;
    const t = tokens[i].replace(/^(статья|статьи|ст|часть|ч)\.?/, '');
    i++;
    if (!t || t === 'и') continue;
    if (!NUM_RE.test(t)) return null;
    out.push({ law, num: t.replace(/\.$/, '').toUpperCase() });
  }
  return out.length ? out : null;
}

// Находит статьи по номеру статьи или части. Без указания закона — сначала УК и КоАП
function findByNumber(law, num) {
  const lookup = (laws) => {
    const res = [];
    for (const l of laws) {
      for (const a of l.articles) {
        if (a.num.toUpperCase() === num) res.push({ a, law: l, focus: null });
        else if (a.parts.some((p) => p.code === num)) res.push({ a, law: l, focus: num });
      }
    }
    return res;
  };
  if (law) return lookup([law]);
  const main = lookup(state.laws.filter((l) => CALC_DOCS.includes(l.key)));
  return main.length ? main : lookup(state.laws);
}

function splitAlias(q) {
  let best = null;
  for (const [a, l] of aliasMap()) {
    if ((q === a || q.startsWith(a + ' ')) && (!best || a.length > best.alias.length)) best = { law: l, alias: a };
  }
  return best ? { law: best.law, rest: q.slice(best.alias.length).trim() } : { law: null, rest: q };
}

function search(raw) {
  const q = norm(raw.trim().replace(/\s+/g, ' '));
  const nums = parseNumbers(q);
  if (nums) {
    const results = [];
    const missing = [];
    const seen = new Set();
    for (const { law, num } of nums) {
      const found = findByNumber(law, num);
      if (!found.length) missing.push(`${law ? `${law.short} ` : ''}${num}`);
      for (const r of found) {
        const key = `${r.law.key}|${r.a.num}|${r.focus}`;
        if (!seen.has(key)) { seen.add(key); results.push(r); }
      }
    }
    return { mode: 'numbers', results, missing, words: [] };
  }

  const { law, rest } = splitAlias(q);
  if (!rest && law) return { mode: 'law', law, results: law.articles.map((a) => ({ a, law })), words: [] };
  const { main, rest: others } = orderedLaws();
  const pool = law ? [law] : [...main, ...others];
  const words = rest.split(' ').filter((w) => w.length > 1);
  const results = [];
  for (const l of pool) {
    for (const a of l.articles) {
      const title = norm(a.title);
      const text = norm(a.text);
      if (!words.length || !words.every((w) => title.includes(w) || text.includes(w))) continue;
      const score = words.filter((w) => title.includes(w)).length * 10 + (main.includes(l) ? 5 : 0);
      results.push({ a, law: l, score });
    }
  }
  results.sort((x, y) => y.score - x.score);
  return { mode: 'text', law, results: results.slice(0, 150), words };
}

// Какой пункт добавить в дело из найденной статьи: найденная часть, санкция статьи или единственная часть
function pickTarget(r) {
  if (r.focus && state.index.has(`${r.law.key}|${r.focus}`)) return `${r.law.key}|${r.focus}`;
  if (r.a.sanction) return `${r.law.key}|${r.a.num}`;
  const parts = r.a.parts.filter((p) => p.sanction);
  return parts.length === 1 ? `${r.law.key}|${parts[0].code}` : null;
}

function renderSearch() {
  const res = search(state.query);
  state.lastSearch = res;
  const addable = res.mode === 'numbers' ? res.results.filter((r) => pickTarget(r)) : [];
  const multi = res.mode === 'numbers' ? res.results.filter((r) => !pickTarget(r) && r.a.parts.some((p) => p.sanction)) : [];
  $('viewer').innerHTML = `
    <div class="law-head">
      <h1>Поиск: «${esc(state.query)}»</h1>
      <div class="meta">
        <span>${res.law ? `В законе: ${esc(res.law.short)} · ` : ''}найдено: ${res.results.length}${res.results.length === 150 ? '+' : ''}</span>
        ${res.missing && res.missing.length ? `<span class="warn-text">Не найдены: ${esc(res.missing.join(', '))}</span>` : ''}
      </div>
      ${addable.length ? `<div class="search-actions">
        <button class="btn primary" id="addAll">+ Добавить в дело все найденные (${addable.length})</button>
        ${multi.length ? `<span class="hint">У ст. ${multi.map((r) => esc(r.a.num)).join(', ')} несколько частей — выберите часть вручную</span>` : ''}
      </div>` : ''}
    </div>
    ${res.results.map((r) => articleHtml(r.a, r.law, { showLaw: !res.law, words: res.words, focus: r.focus })).join('') ||
      '<div class="empty"><h2>Ничего не найдено</h2>Номера статей через пробел («63 64 77», «ук 37.1 коап 9.3») или слова из текста.</div>'}`;
}

// --- Отрисовка ---

function renderViewer(keepScroll) {
  const top = $('viewer').scrollTop;
  if (!state.laws.length) {
    $('viewer').innerHTML = '<div class="empty"><h2>База законов пуста</h2>Загружаем законодательство с форума RMRP… Это нужно только при первом запуске.</div>';
  } else if (state.query) renderSearch();
  else renderLaw(currentLaw());
  $('viewer').scrollTop = keepScroll ? top : 0;
}

function renderAll() {
  renderLaws();
  renderViewer(false);
  renderCase();
}

// --- Дело (калькулятор) ---

function flags() {
  return state.det ? state.det.flags : {};
}

function togglePick(id, forceOn) {
  const i = state.picks.findIndex((p) => p.id === id);
  if (i >= 0) {
    if (forceOn) return;
    state.picks.splice(i, 1);
  } else {
    const ref = state.index.get(id);
    if (!ref) return;
    const { law, a, p } = ref;
    const item = {
      id,
      law: law.key,
      lawShort: law.short,
      num: a.num,
      code: p ? p.code : a.num,
      title: a.title,
      chapter: a.chapter,
      sanction: p ? p.sanction : a.sanction,
    };
    item.mode = window.calc.defaultMode(item, flags());
    state.picks.push(item);
  }
  store.set('picks', state.picks);
}

// Отказ от уплаты штрафа:
//   есть арест в статье КоАП → арест (КоАП 4.6.1); статья УК со сроком → лишение свободы (ПК 13.2, 12.7);
//   только штраф (почти вся глава IX — ПДД) → ст. 67 УК по сумме неоплаченных штрафов
function refuseFines() {
  const label = (p) => `${p.code} ${COPY_LAW[p.law] || p.lawShort}`;
  const replaced = [];
  let added = false;
  for (const p of state.picks) {
    if (p.mode !== 'fine') continue;
    const m = window.calc.refusalMode(p);
    p.refused = true;
    if (m) {
      p.mode = m;
      replaced.push(label(p));
    } else {
      p.mode = 'unpaid';
      added = true;
    }
  }
  const parts = [];
  if (replaced.length) parts.push(`${replaced.join(', ')} → арест / лишение свободы`);
  // часть ст. 67 считается по сумме всех неоплаченных штрафов в деле, включая прошлые отказы
  const unpaid = state.picks.filter((p) => p.mode === 'unpaid');
  if (added) {
    const sum = unpaid.reduce((acc, p) => acc + window.calc.fineOf(p, flags()).min, 0);
    const code = window.calc.unpaidPart(sum);
    const id = `uk|${code}`;
    state.picks = state.picks.filter((p) => !p.unpaidFor);
    togglePick(id, true);
    const item = state.picks.find((p) => p.id === id);
    if (item) {
      item.mode = 'prison';
      item.unpaidFor = unpaid.map(label);
    }
    for (const p of unpaid) p.unpaidBy = code;
    parts.push(`неоплаченные штрафы ${money(sum)} (${unpaid.map(label).join(', ')}) → ${code} УК РФ`);
  }
  store.set('picks', state.picks);
  afterPicksChanged();
  const text = `Отказ от уплаты штрафа: ${parts.join('; ')}`;
  if (state.det && state.det.running) window.api.det('log', text);
  toast(text);
}

const MODE_LABEL = { prison: 'Л/С', arrest: 'Арест', fine: 'Штраф', license: 'Права' };

// «63.3 УК РФ, 66 УК РФ, 8.1 КоАП»
const COPY_LAW = { uk: 'УК РФ', koap: 'КоАП' };
function caseText() {
  return state.picks.map((p) => `${p.code} ${COPY_LAW[p.law] || p.lawShort}`).join(', ');
}

function renderCase() {
  const count = state.picks.length;
  $('caseCount').textContent = count ? String(count) : '';
  if (state.tab !== 'case') return;
  if (!count) {
    $('panelBody').innerHTML = `<div class="panel-empty">
      <h3>Дело пустое</h3>
      <p>Нажмите на наказание под статьёй (<span class="sanction mini"><span class="plus">+</span>Штраф…</span>), чтобы добавить её сюда.</p>
      <p>Быстрый способ: введите в поиск номера через пробел — «63 64 77» — и нажмите «Добавить все найденные».</p>
    </div>`;
    return;
  }
  const t = window.calc.compute(state.picks, flags());
  const items = state.picks.map((p) => {
    const modes = window.calc.modes(p.sanction);
    const notes = t.itemNotes[p.id] || [];
    return `<div class="case-item">
      <div class="ci-head">
        <span class="ci-code">${esc(p.lawShort)} ${p.code === p.num ? `ст. ${esc(p.num)}` : `ч. ${esc(p.code)}`}</span>
        ${starsHtml(p.sanction)}
        <button class="ci-del" data-unpick="${esc(p.id)}" title="Убрать">✕</button>
      </div>
      <div class="ci-title" title="${esc(p.title)}">${esc(p.title)}</div>
      <div class="ci-sanction">
        ${modes.length > 1 ? `<span class="seg">${modes.map((m) => `<button data-mode="${m}" data-id="${esc(p.id)}" class="${p.mode === m ? 'on' : ''}">${MODE_LABEL[m]}</button>`).join('')}</span>` : ''}
        <span>${p.mode === 'unpaid' ? `Штраф ${esc(moneyRange(p.sanction.fine))} не оплачен` : esc(sanctionText(p.sanction, p.mode))}</span>
      </div>
      ${notes.map((n) => `<div class="ci-note">${esc(n)}</div>`).join('')}
    </div>`;
  }).join('');

  const totalRows = (x) => {
    const r = [];
    if (x.prison.max) r.push(['Лишение свободы', range(x.prison, years)]);
    if (x.arrest.max) r.push(['Административный арест', range(x.arrest, days)]);
    if (x.fine.max) r.push(['Штраф', moneyRange(x.fine)]);
    return r;
  };
  const rows = totalRows(t);
  if (t.license) rows.push(['Дополнительно', 'Лишение прав']);
  if (t.stars) rows.push(['Розыск (СПРП)', '★'.repeat(t.stars)]);

  // Переключатель всех статей УК со штрафом: срок ↔ штраф
  const ukFineable = state.picks.filter((p) => p.law === 'uk' && p.sanction.fine && p.sanction.prison);
  const ukAllFine = ukFineable.length && ukFineable.every((p) => p.mode === 'fine');
  const ukSwitch = ukFineable.length ? `<div class="uk-switch">
      <span>УК (${ukFineable.length} ${plural(ukFineable.length, 'статья', 'статьи', 'статей')} со штрафом):</span>
      <span class="seg">
        <button data-ukmode="prison" class="${ukAllFine ? '' : 'on'}">Срок</button>
        <button data-ukmode="fine" class="${ukAllFine ? 'on' : ''}">Штраф</button>
      </span>
    </div>` : '';
  // Отказ от уплаты: доступен, если в деле есть хотя бы один штраф
  const fines = state.picks.filter((p) => p.mode === 'fine');
  const refused = state.picks.filter((p) => p.refused || p.unpaidFor);
  const refuseBlock = fines.length || refused.length ? `<div class="refuse">
      ${fines.length
        ? `<button class="btn danger wide" id="refuseFine" title="Есть арест в статье КоАП → арест (КоАП 4.6.1); УК → лишение свободы (ПК 13.2); только штраф (ПДД и др.) → ст. 67 УК">Отказался от уплаты штрафа</button>`
        : ''}
      ${refused.length ? `<button class="btn small" id="undoRefuse" title="Вернуть штрафы">Отменить отказ</button>` : ''}
    </div>` : '';
  const altBlock = t.alt ? `<div class="alt-total">
      <div class="alt-title">Или с заменой срока на штраф по УК <small>ПК 13.2</small></div>
      <div class="total-rows">${totalRows(t.alt).map(([k, v]) => `<div class="tr"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${t.alt.notes.filter((n) => !n.startsWith('1 сутки')).map((n) => `<div class="total-note">${esc(n)}</div>`).join('')}
    </div>` : '';

  $('panelBody').innerHTML = `
    <div class="case-list">${items}</div>
    <div class="case-total">
      ${t.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}
      <div class="total-rows">${rows.map(([k, v]) => `<div class="tr"><span>${k}</span><b>${esc(v)}</b></div>`).join('') || '<div class="tr"><span>Итог</span><b>—</b></div>'}</div>
      ${t.notes.map((n) => `<div class="total-note">${esc(n)}</div>`).join('')}
      ${altBlock}
      ${ukSwitch}
      ${refuseBlock}
      <div class="total-actions">
        <button class="btn primary" id="copyCase" title="Скопировать статьи: «63.3 УК РФ, 66 УК РФ, 8.1 КоАП»">Копировать</button>
        <button class="btn" id="clearCase">Очистить</button>
      </div>
    </div>`;
  state.lastTotal = t;
}

// --- Задержание ---

const CHECKLIST = [
  ['cuffs', 'Применить спецсредства (наручники)', 'ПК 10.1 п.1'],
  ['ident', 'Представиться: удостоверение, должность, звание, фамилия', 'ПК 10.1 п.2'],
  ['charges', 'Огласить статьи', 'ПК 10.1 п.3'],
  ['offer', 'Предложить государственного адвоката', 'ПК 8.3'],
  ['search', 'Личный обыск', 'ПК 10.1 п.4'],
  ['deliver', 'Доставить в отдел', 'ПК 10.1 п.5'],
];
const CHECKLIST_GOV = [
  ['govcheck', 'Проверить удостоверение / жетон, сверить с базой госорганизаций', 'ПК 12.4'],
  ['govcall', 'Вызвать СК, прокуратуру, руководство задержанного', 'ПК 10.3'],
  ['govvideo', 'Передать видеозапись прибывшим СК / прокуратуре / руководству', 'ПК 15.2–15.3'],
];

const { view: timerView, fmt } = window.timerView;

function waitButton(who, st) {
  const w = st[who];
  const title = who === 'lawyer' ? 'Адвокат' : 'СК · прокуратура · руководство';
  const ref = who === 'lawyer' ? 'ПК 9.2' : 'ПК 10.3';
  const names = who === 'lawyer'
    ? ['Вызвать адвоката', 'Адвокат ответил', 'Адвокат прибыл']
    : ['Вызвать по рации', 'Ответили', 'Прибыли'];
  const label = !w ? names[0] : w.phase === 'response' ? names[1] : names[2];
  const key = who === 'lawyer' && state.settings.hotkeys.lawyer ? ` <kbd>${esc(state.settings.hotkeys.lawyer)}</kbd>` : '';
  return `<div class="wait-card${w ? ' active' : ''}">
    <div class="wc-head"><span>${title}</span>${w ? `<span class="wait-time" data-wait="${who}"></span>` : `<small>${ref}</small>`}</div>
    <div class="wc-actions">
      <button class="btn${w ? ' primary' : ''}" data-det="wait" data-arg="${who}">${label}${key}</button>
      ${w ? `<button class="btn small" data-det="cancelWait" data-arg="${who}" title="${who === 'lawyer' ? 'Задержанный отказался от адвоката (ПК 9.5)' : 'Отменить ожидание'}">${who === 'lawyer' ? 'Отказ' : 'Отмена'}</button>` : ''}
    </div>
  </div>`;
}

function renderDetention() {
  const st = state.det;
  if (!st) return;
  $('detDot').classList.toggle('on', st.running);
  if (state.tab !== 'det') return;
  const f = st.flags;
  const hk = state.settings.hotkeys;
  const list = [...CHECKLIST, ...(f.gov ? CHECKLIST_GOV : [])];
  $('panelBody').innerHTML = `
    <div class="det">
      <div class="det-clock ${st.expired ? 'expired' : st.paused && st.running ? 'paused' : ''}">
        <div class="det-label" id="detLabel"></div>
        <div class="det-time" id="detTime">${fmt(st.limit)}</div>
        <div class="det-bar"><i id="detBar"></i></div>
      </div>
      <div class="det-controls">
        ${!st.running
          ? `<button class="btn primary wide" data-det="start">Начать задержание${hk.timer ? ` <kbd>${esc(hk.timer)}</kbd>` : ''}</button>`
          : `<button class="btn wide" data-det="pause">${st.manualPause ? 'Продолжить' : 'Пауза (допрос)'}${hk.timer ? ` <kbd>${esc(hk.timer)}</kbd>` : ''}</button>
             <button class="btn" data-det="stop">Завершить</button>`}
      </div>

      <div class="det-flags">
        <label><input type="checkbox" data-flag="gov" ${f.gov ? 'checked' : ''}> Задержан сотрудник госорганизации / адвокат <small>ПК 10.3, 12</small></label>
        <label><input type="checkbox" data-flag="immunity" ${f.immunity ? 'checked' : ''}> Заявляет о неприкосновенности <small>ПК 17</small></label>
        <label><input type="checkbox" data-flag="prelim" ${f.prelim ? 'checked' : ''}> Предварительное задержание — 15 мин <small>ПК 6.3</small></label>
      </div>

      <h4>Ожидание (время задержания стоит)</h4>
      ${waitButton('lawyer', st)}
      ${f.gov || st.gov ? waitButton('gov', st) : ''}

      <h4>Права задержанного <small>ПК 8</small></h4>
      <div class="wait-row">
        <button class="btn" data-det="short" data-arg="call" ${st.running ? '' : 'disabled'}>Звонок · 2 мин</button>
        <button class="btn" data-det="short" data-arg="talk" ${st.running ? '' : 'disabled'}>Беседа с адвокатом · 5 мин</button>
      </div>
      <div class="wait-row"><span class="wait-time" id="shortTime"></span></div>

      <h4>Порядок задержания</h4>
      <div class="checklist">
        ${list.map(([k, text, ref]) => `<label><input type="checkbox" data-check="${k}" ${state.checklist[k] ? 'checked' : ''}> ${esc(text)} <small>${ref}</small></label>`).join('')}
      </div>

      <h4>Журнал ${st.log.length ? '<button class="btn small" id="copyLog">Копировать</button>' : ''}</h4>
      <div class="det-log">${st.log.slice().reverse().map((e) => `<div><time>${new Date(e.t).toLocaleTimeString('ru-RU')}</time> ${esc(e.text)}</div>`).join('') || '<div class="hint">Здесь появятся события задержания.</div>'}</div>
    </div>`;
  tickDetention();
}

// Обновляет только цифры, без перерисовки панели
function tickDetention() {
  const st = state.det;
  if (!st || state.tab !== 'det' || !$('detTime')) return;
  const v = timerView(st, 0);
  $('detTime').textContent = st.expired ? '0:00' : fmt(v.left);
  $('detBar').style.width = `${Math.min(100, (v.elapsed / st.limit) * 100)}%`;
  const label = !st.running
    ? (st.log.length ? 'Задержание завершено' : `Готов к задержанию · ${st.limit / 60000} мин`)
    : st.expired ? 'Время истекло — освободить (ПК 14.1)'
      : st.paused ? `Пауза${st.lawyer ? ' · ожидание адвоката' : st.gov ? ' · ожидание представителей' : ''}`
        : 'Идёт задержание';
  $('detLabel').textContent = label;
  for (const w of v.waits) {
    const el = document.querySelector(`[data-wait="${w.who}"]`);
    if (el) el.textContent = `${w.text.split(': ').pop()} · ${fmt(w.left)}`;
  }
  $('shortTime').textContent = v.short ? `${v.short.text}: осталось ${fmt(v.short.left)}` : '';
}

// --- Звук и уведомления ---

// Звуки таймера: [задержка, частота, длительность] — синтез, без файлов
const SOUNDS = {
  start: { wave: 'sine', gain: 0.25, notes: [[0, 523, 0.12], [0.12, 659, 0.12], [0.24, 784, 0.22]] },
  pause: { wave: 'sine', gain: 0.25, notes: [[0, 784, 0.14], [0.16, 523, 0.22]] },
  resume: { wave: 'sine', gain: 0.25, notes: [[0, 523, 0.12], [0.14, 784, 0.18]] },
  stop: { wave: 'triangle', gain: 0.3, notes: [[0, 784, 0.14], [0.15, 659, 0.14], [0.3, 523, 0.14], [0.45, 392, 0.35]] },
  warn: { wave: 'square', gain: 0.12, notes: [[0, 880, 0.12], [0.2, 880, 0.12]] },
  alert: { wave: 'sine', gain: 0.25, notes: [[0, 880, 0.16], [0.18, 660, 0.16]] },
  // тревога «время вышло»: сирена из двух тонов, три цикла
  expired: {
    wave: 'square',
    gain: 0.15,
    notes: Array.from({ length: 12 }, (_, i) => [i * 0.22, i % 2 ? 720 : 960, 0.2]),
  },
};

let audio = null;
function playSound(kind) {
  if (!state.settings.sounds.timer) return;
  const s = SOUNDS[kind] || SOUNDS.alert;
  try {
    audio = audio || new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime + 0.02;
    for (const [at, freq, dur] of s.notes) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = s.wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(s.gain, t + at + 0.015);
      g.gain.setValueAtTime(s.gain, t + at + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(audio.destination);
      o.start(t + at);
      o.stop(t + at + dur + 0.01);
    }
  } catch { /* без звука */ }
}

// --- Звуки интерфейса: мелодия включения и смена фракции (выключаются в настройках) ---

// Нота с плавной атакой и затуханием. bell — добавляет октаву сверху, как у колокольчика
function tone(out, t, freq, dur, { wave = 'sine', gain = 0.15, attack = 0.01, bell = false } = {}) {
  const parts = bell ? [[freq, gain], [freq * 2, gain * 0.25]] : [[freq, gain]];
  for (const [f, g0] of parts) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = wave;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(g0, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// Эхо для колокольчиков
function echoBus() {
  const input = audio.createGain();
  const delay = audio.createDelay();
  const fb = audio.createGain();
  delay.delayTime.value = 0.28;
  fb.gain.value = 0.3;
  input.connect(audio.destination);
  input.connect(delay).connect(fb).connect(delay);
  fb.connect(audio.destination);
  return input;
}

const NOTE = { G3: 196, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, B4: 493.88, C5: 523.25, D5: 587.33, G5: 783.99, B5: 987.77, C6: 1046.5, D6: 1174.66 };

function playUiSound(kind, arg) {
  if (!state.settings.sounds[kind === 'startup' ? 'startup' : 'ui']) return;
  try {
    audio = audio || new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime + 0.03;
    const bells = echoBus();
    if (kind === 'startup') {
      // мягкие аккорды G → C → G и колокольчики поверх
      const pads = [[0, 1.6, ['G3', 'D4', 'G4', 'B4']], [1.2, 1.4, ['C4', 'E4', 'G4', 'C5']], [2.2, 2.4, ['G3', 'D4', 'G4', 'D5']]];
      for (const [at, dur, chord] of pads) {
        for (const n of chord) tone(audio.destination, t + at, NOTE[n], dur, { wave: 'triangle', gain: 0.045, attack: 0.5 });
      }
      const melody = [[0, 'D5', 0.8], [0.3, 'G5', 0.8], [0.6, 'B5', 0.9], [1.2, 'C6', 0.9], [1.5, 'G5', 0.9], [2.2, 'B5', 0.9], [2.5, 'D6', 2]];
      for (const [at, n, dur] of melody) tone(bells, t + at, NOTE[n], dur, { gain: 0.12, bell: true });
    } else if (kind === 'faction') {
      // короткий сигнал «рации», у каждой фракции своя высота
      const f = 523.25 * 2 ** ((arg % 5) / 12 * 2);
      tone(bells, t, f, 0.25, { gain: 0.1, bell: true });
      tone(bells, t + 0.09, f * 1.5, 0.4, { gain: 0.1, bell: true });
    }
  } catch { /* без звука */ }
}

// --- Заставка ---

// Законы на диске не хранятся: заставка держит планшет, пока база полностью не загрузится с форума
async function runSplash() {
  const el = $('splash');
  $('splashEmblem').innerHTML = window.emblem(state.settings.faction);
  const minShow = new Promise((r) => setTimeout(r, 2000));
  for (;;) {
    $('splashBar').hidden = false;
    $('splashError').hidden = true;
    $('splashStatus').hidden = false;
    $('splashStatus').textContent = 'Загрузка законов с форума…';
    const res = await window.api.updateLaws();
    if (!res.error) { applyLaws(res); break; }
    $('splashBar').hidden = true;
    $('splashStatus').hidden = true;
    $('splashErrorText').textContent = 'Законы загружаются с forum.rmrp.ru при каждом запуске. Проверьте интернет и нажмите «Повторить».';
    $('splashError').title = res.error;
    $('splashError').hidden = false;
    await new Promise((r) => $('splashRetry').addEventListener('click', r, { once: true }));
  }
  await minShow;
  playUiSound('startup');
  el.classList.add('out');
  setTimeout(() => { el.hidden = true; }, 900);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// --- Синхронизация ---

function setSync(text, cls = '') {
  $('sync').textContent = text;
  $('sync').className = `sb-sync ${cls}`;
}

function showChecked() {
  if (!state.checkedAt) return setSync('нет данных', 'err');
  const d = new Date(state.checkedAt);
  const today = d.toDateString() === new Date().toDateString();
  setSync(`база: ${today ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU')}`);
}

function applyLaws(res) {
  state.checkedAt = res.checkedAt;
  setLaws(res.laws);
  renderAll();
  showChecked();
}

// Кнопка ↻: заново скачать базу, не закрывая планшет (при ошибке остаются законы, загруженные при запуске)
async function refresh() {
  $('refresh').classList.add('spin');
  setSync('связь с форумом…', 'busy');
  const res = await window.api.updateLaws();
  $('refresh').classList.remove('spin');
  if (res.error) {
    setSync('нет связи · база с запуска', 'err');
    $('sync').title = res.error;
    return;
  }
  applyLaws(res);
}

window.api.onProgress((p) => {
  if (!p.total || p.done >= p.total) return;
  const text = `загрузка ${p.done}/${p.total}`;
  setSync(text, 'busy');
  $('splashStatus').textContent = `Загрузка законов с форума: ${p.done} из ${p.total}`;
});

// --- Настройки ---

const SPECIAL_KEYS = ['Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Pause'];
function accelFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  let key = null;
  if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = `num${e.code.slice(6)}`;
  else if (SPECIAL_KEYS.includes(e.key)) key = e.key;
  if (!key) return null;
  // одиночные буквы и цифры будут мешать печатать в игре
  if (!mods.length && !/^F\d/.test(key) && !SPECIAL_KEYS.includes(key)) return null;
  return [...mods, key].join('+');
}

function setupSettings() {
  const dlg = $('settings');
  const hint = $('hotkeyHint');
  let listening = null;
  const resetHint = () => { hint.className = 'hint'; hint.textContent = 'Нажмите на кнопку, затем нужное сочетание клавиш.'; };
  const fill = () => {
    for (const b of dlg.querySelectorAll('[data-hotkey]')) b.textContent = state.settings.hotkeys[b.dataset.hotkey] || '—';
  };

  $('openSettings').addEventListener('click', () => {
    fill();
    $('onTop').checked = state.settings.alwaysOnTop;
    for (const c of dlg.querySelectorAll('[data-sound]')) c.checked = state.settings.sounds[c.dataset.sound];
    resetHint();
    dlg.showModal();
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hotkey]');
    if (!b) return;
    fill();
    listening = b;
    b.classList.add('listening');
    b.textContent = '…';
    hint.className = 'hint';
    hint.textContent = 'Нажмите сочетание: F1–F12 или Ctrl/Alt/Shift + клавиша. Esc — отмена.';
  });
  dlg.addEventListener('keydown', async (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    const b = listening;
    if (e.key === 'Escape') {
      listening = null;
      b.classList.remove('listening');
      fill();
      resetHint();
      return;
    }
    const accel = accelFromEvent(e);
    if (!accel) return;
    listening = null;
    b.classList.remove('listening');
    const res = await window.api.setSettings({ hotkeys: { [b.dataset.hotkey]: accel } });
    state.settings = res.settings;
    fill();
    if (res.error) {
      hint.className = 'hint err';
      hint.textContent = `${accel}: ${res.error}`;
    } else {
      hint.textContent = `Готово: ${accel}.`;
      renderDetention();
    }
  });
  $('openChangelog').addEventListener('click', () => {
    $('changelogList').innerHTML = window.CHANGELOG.map((v) => `
      <section>
        <h3>v${esc(v.version)}${v.version === state.version ? ' · текущая' : ''} <span>${esc(v.date)}</span></h3>
        <ul>${v.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </section>`).join('');
    $('changelog').showModal();
  });
  $('onTop').addEventListener('change', async (e) => {
    state.settings = (await window.api.setSettings({ alwaysOnTop: e.target.checked })).settings;
  });
  for (const c of dlg.querySelectorAll('[data-sound]')) {
    c.addEventListener('change', async () => {
      const sounds = { ...state.settings.sounds, [c.dataset.sound]: c.checked };
      state.settings = (await window.api.setSettings({ sounds })).settings;
    });
  }
}

// --- События ---

function setPanelCollapsed(collapsed) {
  state.panelCollapsed = collapsed;
  store.set('panelCollapsed', collapsed);
  $('panel').classList.toggle('collapsed', collapsed);
  $('panelToggle').innerHTML = collapsed ? '&#x00AB;' : '&#x00BB;';
  $('panelToggle').title = collapsed ? 'Развернуть дело и задержание' : 'Свернуть вправо';
}

function setTab(tab) {
  state.tab = tab;
  store.set('tab', tab);
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  if (tab === 'case') renderCase();
  else renderDetention();
}

function afterPicksChanged() {
  renderCase();
  renderViewer(true);
}

function setupEvents() {
  $('factions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-faction]');
    if (b) selectFaction(b.dataset.faction);
  });
  $('laws').addEventListener('click', (e) => {
    const b = e.target.closest('[data-law]');
    if (!b) return;
    state.lawId = b.dataset.law;
    state.query = '';
    $('search').value = '';
    renderAll();
  });
  $('viewer').addEventListener('click', (e) => {
    if (e.target.classList.contains('more')) {
      e.target.previousElementSibling.classList.remove('clamp');
      e.target.remove();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      togglePick(pick.dataset.pick);
      if (state.tab !== 'case') setTab('case');
      afterPicksChanged();
      return;
    }
    if (e.target.id === 'addAll' && state.lastSearch) {
      for (const r of state.lastSearch.results) {
        const id = pickTarget(r);
        if (id) togglePick(id, true);
      }
      setTab('case');
      afterPicksChanged();
    }
  });

  document.querySelector('.panel-tabs').addEventListener('click', (e) => {
    if (e.target.closest('#panelToggle')) return setPanelCollapsed(!state.panelCollapsed);
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    // клик по вкладке на свёрнутой полосе — развернуть
    if (state.panelCollapsed) setPanelCollapsed(false);
    setTab(b.dataset.tab);
  });

  $('panelBody').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.unpick) { togglePick(t.dataset.unpick); afterPicksChanged(); }
    if (t.dataset.mode) {
      const p = state.picks.find((x) => x.id === t.dataset.id);
      p.mode = t.dataset.mode;
      store.set('picks', state.picks);
      renderCase();
    }
    if (t.id === 'refuseFine') refuseFines();
    if (t.id === 'undoRefuse') {
      state.picks = state.picks.filter((p) => !p.unpaidFor);
      for (const p of state.picks) {
        if (!p.refused) continue;
        p.mode = 'fine';
        delete p.refused;
        delete p.unpaidBy;
      }
      store.set('picks', state.picks);
      afterPicksChanged();
    }
    if (t.dataset.mode) {
      const p = state.picks.find((x) => x.id === t.dataset.id);
      if (p) delete p.refused;
    }
    if (t.dataset.ukmode) {
      for (const p of state.picks) delete p.refused;
      for (const p of state.picks) {
        if (p.law === 'uk' && p.sanction.fine && p.sanction.prison) p.mode = t.dataset.ukmode;
      }
      store.set('picks', state.picks);
      renderCase();
    }
    if (t.id === 'clearCase') { state.picks = []; store.set('picks', []); afterPicksChanged(); }
    if (t.id === 'copyCase') {
      const text = caseText();
      window.api.copy(text);
      toast(`Скопировано: ${text}`);
    }
    if (t.id === 'copyLog' && state.det) {
      window.api.copy(state.det.log.map((l) => `[${new Date(l.t).toLocaleTimeString('ru-RU')}] ${l.text}`).join('\n'));
      toast('Журнал скопирован');
    }
    if (t.dataset.det) {
      if (t.dataset.det === 'start') { state.checklist = {}; store.set('checklist', {}); }
      window.api.det(t.dataset.det, t.dataset.arg);
    }
  });
  $('panelBody').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.flag) window.api.det('flags', { [t.dataset.flag]: t.checked });
    if (t.dataset.check) { state.checklist[t.dataset.check] = t.checked; store.set('checklist', state.checklist); }
  });

  let timer = null;
  $('search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = e.target.value.trim();
      renderLaws();
      renderViewer(false);
    }, 150);
  });
  $('search').addEventListener('keydown', (e) => {
    // Enter в поиске по номерам — сразу добавить всё найденное в дело
    if (e.key !== 'Enter') return;
    clearTimeout(timer);
    state.query = e.target.value.trim();
    renderLaws();
    renderViewer(false);
    document.getElementById('addAll')?.click();
  });
  $('refresh').addEventListener('click', refresh);
  for (const b of document.querySelectorAll('[data-win]')) {
    b.addEventListener('click', () => window.api.win(b.dataset.win));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('settings').open) {
      if (state.query) {
        $('search').value = '';
        state.query = '';
        renderAll();
      } else {
        window.api.win('hide');
      }
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('search').select();
    }
  });
  window.api.onFocusSearch(() => $('search').select());

  window.api.onDetState((st) => {
    const prevFlags = state.det && JSON.stringify(state.det.flags);
    state.det = st;
    renderDetention();
    // флаги госслужащего и неприкосновенности влияют на расчёт дела
    if (prevFlags !== JSON.stringify(st.flags)) renderCase();
  });
  window.api.onDetAlert(({ text, sound }) => {
    playSound(sound);
    if (text) toast(text);
  });
}

function tickClock() {
  $('clock').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

(async () => {
  const init = await window.api.init();
  state.factions = init.factions;
  state.settings = init.settings;
  state.det = init.detention;
  state.checkedAt = init.checkedAt;
  state.version = init.version;
  $('appVersion').textContent = init.version ? `v${init.version}` : '';
  $('bezelVersion').textContent = init.version ? `v${init.version}` : '';
  state.picks = store.get('picks', []);
  state.checklist = store.get('checklist', {});
  state.tab = store.get('tab', 'case');
  setLaws(init.laws);
  if (!state.factions[state.settings.faction]) state.settings.faction = 'all';
  renderFactions();
  applyFaction();
  runSplash();
  setupEvents();
  setupSettings();
  renderAll();
  setTab(state.tab);
  setPanelCollapsed(store.get('panelCollapsed', false));
  tickClock();
  setInterval(tickClock, 10000);
  setInterval(tickDetention, 250);
})();
