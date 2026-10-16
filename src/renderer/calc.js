'use strict';
// Калькулятор наказаний по выбранным статьям.
//   УК ст. 30.2 — сроки по совокупности суммируются, но не более 15 лет;
//   УК ст. 30.4 — административный арест при лишении свободы заменяется одним годом;
//   КоАП ст. 4.5 — штраф за один и тот же пункт не суммируется (одна статья — один раз);
//   КоАП ст. 4.7 — госслужащему штраф по главе IX в двойном размере;
//   ПК ст. 12, 13, 17 — ограничения задержания госслужащих, лиц с неприкосновенностью, подследственность.

(() => {
  const MAX_PRISON = 15;

  // Перечни статей УК: '37-42' — диапазон, '68:4,5' — только части 4 и 5
  const LISTS = {
    // ПК 12.2 — по каким статьям можно задержать госслужащего / адвоката
    govDetain: ['37-42', '46', '47', '49', '53-60', '61-64', '64-1', '67', '68:4,5', '69-80', '87', '88-1', '88-2', '89-90', '92-93', '95-99'],
    // ПК 12.5 — при лишении свободы по этим статьям госслужащий подлежит увольнению
    govDismiss: ['37-42', '46', '47', '49:2', '53-60', '62:3', '63:4', '64', '64-1', '67', '68:5', '69-75', '76:3', '77', '79', '87', '88-1', '88-2', '89', '90:2,3', '92:2', '99'],
    // ПК 12.3 — сотрудник при исполнении может быть задержан любым сотрудником правоохранительных органов
    govAnyOfficer: ['37', '55', '78'],
    // ПК 17.1 — лицо с неприкосновенностью может быть задержано только по этим статьям
    immunity: ['37', '38', '70', '71', '73', '89', '90'],
    // ПК 13.2 — задержание и арест без судебного решения
    arrestNoCourt: ['37-49', '54', '56-68', '70', '86', '87', '89', '90-98'],
    // ПК 13.3 — задержание с передачей в ФСБ
    toFsb: ['53', '55', '72', '73', '74', '75', '78'],
  };

  // item: { num: '68', code: '68.4' | '68' }
  function inList(list, num, code) {
    const part = code && code !== num ? code.slice(num.length + 1) : null;
    for (const spec of list) {
      const [arts, parts] = spec.split(':');
      let hit = false;
      if (/^\d+-\d+$/.test(arts) && /^\d+$/.test(num)) {
        const [a, b] = arts.split('-').map(Number);
        hit = Number(num) >= a && Number(num) <= b;
      } else {
        hit = arts === num;
      }
      if (!hit) continue;
      if (!parts) return true;
      if (part && parts.split(',').includes(part)) return true;
    }
    return false;
  }

  function stars(raw) {
    const m = raw && raw.match(/★+/g);
    return m ? Math.max(...m.map((s) => s.length)) : 0;
  }

  // Какие виды наказания можно выбрать для пункта
  function modes(s) {
    const out = [];
    if (s.prison) out.push('prison');
    if (s.arrest) out.push('arrest');
    if (s.fine) out.push('fine');
    if (s.license && (!out.length || licenseIsAlternative(s))) out.push('license');
    return out;
  }

  // «штраф … или лишение права управления» — лишение прав выбирается вместо штрафа, а не вместе с ним
  function licenseIsAlternative(s) {
    return /(или|либо)\s+лишени[а-я]*\s+прав/i.test(s.raw || '');
  }

  // По умолчанию: УК — лишение свободы, КоАП — штраф (ст. 4.6: арест — при отказе платить).
  // Госслужащему по УК сначала назначается штраф (ПК 12.7).
  function defaultMode(item, flags) {
    const m = modes(item.sanction);
    if (item.law === 'koap' && m.includes('fine')) return 'fine';
    if (item.law === 'uk' && flags.gov && m.includes('fine')) return 'fine';
    return m[0];
  }

  // Чем заменяется штраф при отказе от уплаты: КоАП 4.6.1 — арест, ПК 13.2 / 12.7 — лишение свободы по УК
  function refusalMode(item) {
    const s = item.sanction;
    if (!s.fine) return null;
    if (item.law === 'koap' && s.arrest) return 'arrest';
    if (item.law === 'uk' && s.prison) return 'prison';
    return null;
  }

  const isKoapCh9 = (item) => item.law === 'koap' && /^Глава IX\./.test(item.chapter || '');

  // Размер штрафа с учётом удвоения для госслужащего (КоАП 4.7)
  function fineOf(item, flags = {}) {
    const k = flags.gov && isKoapCh9(item) ? 2 : 1;
    return { min: item.sanction.fine.min * k, max: item.sanction.fine.max * k };
  }

  // УК 67 — неуплата или отказ от уплаты штрафа: часть по сумме неоплаченных штрафов
  function unpaidPart(sum) {
    if (sum < 30000) return '67.1';
    if (sum < 50000) return '67.2';
    return '67.3';
  }

  // Статьи УК, где выбран срок, но санкция допускает штраф (ПК 13.2 — замена на уголовный штраф)
  // (кроме тех, по которым лицо уже отказалось платить)
  const canFine = (it) => it.law === 'uk' && it.mode === 'prison' && !!it.sanction.fine && !it.refused;

  function compute(items, flags = {}, nested = false) {
    const t = {
      prison: { min: 0, max: 0 },
      arrest: { min: 0, max: 0 },
      fine: { min: 0, max: 0 },
      license: false,
      stars: 0,
      notes: [],
      warnings: [],
      itemNotes: {},
    };
    const note = (id, text) => { (t.itemNotes[id] = t.itemNotes[id] || []).push(text); };

    for (const it of items) {
      const s = it.sanction;
      const mode = it.mode;
      if (mode === 'prison') { t.prison.min += s.prison.min; t.prison.max += s.prison.max; }
      if (mode === 'arrest') { t.arrest.min += s.arrest.min; t.arrest.max += s.arrest.max; }
      if (mode === 'fine') {
        const f = fineOf(it, flags);
        if (f.min !== s.fine.min) note(it.id, 'Штраф ×2 для госслужащего (КоАП 4.7)');
        t.fine.min += f.min;
        t.fine.max += f.max;
      }
      if (mode === 'license' || (s.license && !licenseIsAlternative(s) && mode !== 'unpaid')) t.license = true;
      t.stars = Math.max(t.stars, stars(s.raw));
      if (it.refused) {
        note(it.id, mode === 'unpaid'
          ? `Штраф не оплачен → ст. ${it.unpaidBy || '67'} УК (неуплата штрафа)`
          : it.law === 'koap'
            ? 'Отказ от уплаты штрафа → административный арест (КоАП 4.6.1)'
            : 'Отказ от уплаты штрафа → лишение свободы (ПК 13.2, 12.7)');
      }
      if (it.unpaidFor) note(it.id, `За неуплату: ${it.unpaidFor.join(', ')}`);

      if (it.law !== 'uk') continue;
      if (inList(LISTS.toFsb, it.num, it.code)) note(it.id, 'Передать задержанного ФСБ (ПК 13.3)');
      else if (!inList(LISTS.arrestNoCourt, it.num, it.code)) note(it.id, 'Не входит в ПК 13.2 — арест без судебного решения не допускается');
      if (flags.gov) {
        if (!inList(LISTS.govDetain, it.num, it.code)) {
          note(it.id, 'Госслужащего по этой статье не задерживают — рапорт прокурору / в СК (ПК 12.2.1)');
        }
        if (mode === 'prison' && inList(LISTS.govDismiss, it.num, it.code)) note(it.id, 'Подлежит увольнению (ПК 12.5)');
      }
      if (flags.immunity && !inList(LISTS.immunity, it.num, it.code)) {
        note(it.id, 'Неприкосновенность: задержание по этой статье запрещено (ПК 17.1)');
      }
    }

    // Административный арест при лишении свободы → один год (УК 30.4)
    if (t.prison.max > 0 && t.arrest.max > 0) {
      t.notes.push(`Административный арест (${t.arrest.min === t.arrest.max ? t.arrest.max : `${t.arrest.min}–${t.arrest.max}`} сут.) заменён одним годом лишения свободы (УК 30.4)`);
      t.prison.min += 1;
      t.prison.max += 1;
      t.arrest = { min: 0, max: 0 };
    }
    if (t.prison.max > MAX_PRISON) {
      t.notes.push(`Сумма сроков (${t.prison.min === t.prison.max ? t.prison.max : `${t.prison.min}–${t.prison.max}`} лет) ограничена ${MAX_PRISON} годами (УК 30.2)`);
      t.prison.min = Math.min(t.prison.min, MAX_PRISON);
      t.prison.max = MAX_PRISON;
    }
    if (t.arrest.max > 0) t.notes.push('1 сутки ареста = 1 минута реального времени (КоАП 3.6)');

    if (flags.gov) {
      const ukItems = items.filter((i) => i.law === 'uk');
      if (ukItems.length && !ukItems.some((i) => inList(LISTS.govAnyOfficer, i.num, i.code))) {
        t.warnings.push('Госслужащего при исполнении задерживают СК, ФСБ, прокуратура или сотрудник по решению прокурора (ПК 12.1). Любой сотрудник — только по УК 37, 55, 78 или за огонь / спецсредства без оснований (ПК 12.3)');
      }
      t.warnings.push('Вызвать СК, прокуратуру и руководство задержанного: ответ 5 мин, прибытие 10 мин (ПК 10.3)');
    }
    if (flags.immunity && items.some((i) => i.law === 'koap' && !isKoapCh9(i))) {
      t.warnings.push('Неприкосновенность: по КоАП — только глава IX (ПДД), остальное — рапортом (ПК 17.2)');
    }

    // Вариант итога, если срок по УК заменить штрафом там, где санкция это позволяет
    if (!nested && items.some(canFine)) {
      const alt = compute(items.map((it) => (canFine(it) ? { ...it, mode: 'fine' } : it)), flags, true);
      t.alt = { prison: alt.prison, arrest: alt.arrest, fine: alt.fine, notes: alt.notes, count: items.filter(canFine).length };
    }
    return t;
  }

  // УК 12 — категория преступления по максимальному сроку лишения свободы; УК 33.2 — залог по категории
  const BAIL = [
    { upTo: 2, name: 'небольшой тяжести', min: 20000, max: 40000, ref: '33.2 «а»' },
    { upTo: 5, name: 'средней тяжести', min: 50000, max: 90000, ref: '33.2 «б»' },
    { upTo: 10, name: 'тяжкое', min: 100000, max: 200000, ref: '33.2 «в»' },
    { upTo: Infinity, name: 'особо тяжкое', min: 200000, max: 300000, ref: '33.2 «г»' },
  ];
  const bailCategory = (years) => BAIL.find((c) => years <= c.upTo);

  // Освобождение под залог (УК 33): term — общий срок в годах, president — Президент / Вице-президент палаты,
  // banned — в приговоре запрет залога
  function bail(items, term, { president = false, banned = false } = {}) {
    const rows = [];
    const skipped = [];
    const sum = { min: 0, max: 0 };
    for (const it of items) {
      if (it.law !== 'uk') { skipped.push({ it, why: 'не УК — в залог не входит' }); continue; }
      if (!it.sanction.prison) { skipped.push({ it, why: 'нет лишения свободы' }); continue; }
      if (it.mode !== 'prison') { skipped.push({ it, why: 'назначен не срок' }); continue; }
      const cat = bailCategory(it.sanction.prison.max);
      sum.min += cat.min; // УК 33.3 — залог суммируется за каждую статью
      sum.max += cat.max;
      rows.push({ it, cat });
    }
    const limit = president ? 15 : 8; // УК 33.5, 33.7
    let verdict;
    if (!rows.length || !term) verdict = { kind: 'none' };
    else if (banned) verdict = { kind: 'banned' };
    else if (term <= limit) verdict = { kind: 'release', limit };
    else verdict = { kind: 'reduce', limit, to: Math.max(limit, term - 2) }; // УК 33.6, 33.9
    return { rows, skipped, sum, term, verdict };
  }

  const api = { compute, bail, bailCategory, BAIL, modes, licenseIsAlternative, defaultMode, refusalMode, fineOf, unpaidPart, inList, stars, LISTS };
  if (typeof module !== 'undefined') module.exports = api;
  else window.calc = api;
})();
