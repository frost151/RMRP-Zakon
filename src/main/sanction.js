'use strict';
// Разбор санкций статей: «штрафом в размере тридцати тысяч (30.000) рублей или лишением свободы на срок трех лет».

const WORDS = [
  [['один', 'одного', 'одному', 'одном', 'одна', 'одной'], 1],
  [['два', 'двух', 'две'], 2],
  [['три', 'трех', 'трёх'], 3],
  [['четыре', 'четырех', 'четырёх'], 4],
  [['пять', 'пяти'], 5],
  [['шесть', 'шести'], 6],
  [['семь', 'семи'], 7],
  [['восемь', 'восьми'], 8],
  [['девять', 'девяти'], 9],
  [['десять', 'десяти'], 10],
  [['одиннадцать', 'одиннадцати'], 11],
  [['двенадцать', 'двенадцати'], 12],
  [['тринадцать', 'тринадцати'], 13],
  [['четырнадцать', 'четырнадцати'], 14],
  [['пятнадцать', 'пятнадцати'], 15],
  [['шестнадцать', 'шестнадцати'], 16],
  [['семнадцать', 'семнадцати'], 17],
  [['восемнадцать', 'восемнадцати'], 18],
  [['девятнадцать', 'девятнадцати'], 19],
  [['двадцать', 'двадцати'], 20],
  [['тридцать', 'тридцати'], 30],
  [['сорок', 'сорока'], 40],
  [['пятьдесят', 'пятидесяти'], 50],
  [['шестьдесят', 'шестидесяти'], 60],
  [['семьдесят', 'семидесяти'], 70],
  [['восемьдесят', 'восьмидесяти'], 80],
  [['девяносто'], 90],
  [['сто', 'ста'], 100],
];
const WORD_MAP = new Map();
for (const [forms, n] of WORDS) for (const f of forms) WORD_MAP.set(f, n);

// «двадцати пяти» → 25, «(25)» → 25
function wordsToNumber(s) {
  if (!s) return null;
  const digits = s.match(/\d+/);
  if (digits) return Number(digits[0]);
  let total = 0;
  let found = false;
  for (const w of s.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/)) {
    const v = WORD_MAP.get(w) ?? WORD_MAP.get(w.replace(/е/g, 'ё'));
    if (v != null) { total += v; found = true; }
  }
  return found ? total : null;
}

function parseMoney(s) {
  return Number(s.replace(/[^\d]/g, ''));
}

// Достаёт срок: «на срок трех лет», «в два года», «от трёх до семи лет», «семи суток»
function parseTerm(fragment, unitRe) {
  if (!fragment) return null;
  const f = fragment.replace(/\([^)]*★[^)]*\)/g, '');
  const range = f.match(new RegExp(`от\\s+([а-яё\\d\\s()]+?)\\s+до\\s+([а-яё\\d\\s()]+?)\\s+${unitRe}`, 'i'));
  if (range) {
    const min = wordsToNumber(range[1]);
    const max = wordsToNumber(range[2]);
    if (min != null && max != null) return { min, max };
  }
  const single = f.match(new RegExp(`(?:на\\s+срок\\s+)?(?:в\\s+)?([а-яё\\d\\s()]+?)\\s+${unitRe}`, 'i'));
  if (single) {
    // берём только последние числительные перед единицей измерения
    const words = single[1].trim().split(/\s+/).filter((w) => w !== 'срок' && w !== 'на' && w !== 'в');
    const tail = [];
    for (let i = words.length - 1; i >= 0; i--) {
      if (wordsToNumber(words[i]) == null) break;
      tail.unshift(words[i]);
    }
    const n = wordsToNumber(tail.join(' '));
    if (n != null) return { min: n, max: n };
  }
  return null;
}

// Главная функция: текст санкции → структура наказания
function parseSanction(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');
  const low = t.toLowerCase();
  const res = { raw: t.trim(), fine: null, prison: null, arrest: null, license: false, notes: [] };

  const fineIdx = low.indexOf('штраф');
  if (fineIdx >= 0) {
    const stops = ['лишением свободы', 'лишение свободы', 'административного ареста', 'ареста на срок',
      'лишение права', 'лишением права', 'для государственных служащих']
      .map((s) => low.indexOf(s, fineIdx)).filter((i) => i > fineIdx);
    const end = stops.length ? Math.min(...stops) : t.length;
    const part = t.slice(fineIdx, end);
    const nums = [...part.matchAll(/\((\d{1,3}(?:[.\s ]\d{3})+|\d+)\)/g)].map((m) => parseMoney(m[1]));
    if (nums.length) {
      const isRange = /(^|[\s(])от\s/i.test(part) && nums.length >= 2;
      res.fine = isRange ? { min: nums[0], max: nums[1] } : { min: nums[0], max: nums[0] };
    }
    const who = part.match(/штрафа?\s+на\s+([^в]+?)\s+в\s+размере/i);
    if (who) res.notes.push(`Штраф налагается на: ${who[1].trim()}`);
  }

  const prIdx = low.search(/лишени[а-я]*\s+свободы/);
  // \b в JS не работает с кириллицей, поэтому границу слова проверяем вручную
  if (prIdx >= 0) res.prison = parseTerm(t.slice(prIdx), '(?:лет|года|год)(?![а-яё])');

  const arIdx = low.search(/ареста/);
  if (arIdx >= 0) res.arrest = parseTerm(t.slice(arIdx), 'суток(?![а-яё])');

  if (/лишени[а-я]*\s+права\s+(на\s+)?управлени/i.test(t)) res.license = true;

  const gov = t.match(/для государственных служащих[^.]*/i);
  if (gov) res.notes.push(gov[0].trim());
  if (/определяется судом/i.test(t)) res.notes.push('Наказание определяется судом');

  if (!res.fine && !res.prison && !res.arrest && !res.license) return null;
  return res;
}

module.exports = { parseSanction, wordsToNumber };
