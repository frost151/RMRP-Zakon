'use strict';
// Короткие названия законов, псевдонимы для ввода и фракции.

// Определение кода закона по названию темы
const DOC_RULES = [
  { re: /^Конституция/i, key: 'konst', short: 'Конституция', aliases: ['конституция', 'конст', 'крф'] },
  { re: /^Уголовно-процессуальный/i, key: 'upk', short: 'УПК', aliases: ['упк'] },
  { re: /^Уголовный Кодекс/i, key: 'uk', short: 'УК', aliases: ['ук', 'укрф', 'ук рф'] },
  { re: /административных правонарушениях/i, key: 'koap', short: 'КоАП', aliases: ['коап', 'коап рф', 'ап', 'коа'] },
  { re: /^Процессуальный Кодекс/i, key: 'pk', short: 'ПК', aliases: ['пк', 'пк рф'] },
  { re: /^Трудовой Кодекс/i, key: 'tk', short: 'ТК', aliases: ['тк'] },
  { re: /^Бюджетный Кодекс/i, key: 'bk', short: 'БК', aliases: ['бк'] },
  { re: /^Избирательный Кодекс/i, key: 'ik', short: 'ИК', aliases: ['ик'] },
  { re: /Правила дорожного движения/i, key: 'pdd', short: 'ПДД', aliases: ['пдд'] },
];

function docMeta(title) {
  for (const r of DOC_RULES) {
    if (r.re.test(title)) return { key: r.key, short: r.short, aliases: r.aliases };
  }
  const num = title.match(/№\s*(\d+)\s*-\s*(ФКЗ|ФЗ)/i);
  const name = title.match(/«([^»]+)»/);
  if (num) {
    const kind = num[2].toUpperCase();
    return {
      key: `${kind === 'ФКЗ' ? 'fkz' : 'fz'}${num[1]}`,
      short: `${num[1]}-${kind}${name ? ` «${name[1]}»` : ''}`,
      aliases: [`${num[1]}-${kind.toLowerCase()}`, `${num[1]}${kind.toLowerCase()}`, `фз ${num[1]}`, `${kind.toLowerCase()} ${num[1]}`],
    };
  }
  const slug = title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '').slice(0, 20);
  return { key: slug, short: name ? name[1] : title, aliases: [] };
}

// Законы, по которым работает калькулятор
const CALC_DOCS = ['uk', 'koap'];

// Фракции: какие законы показывать первыми, какие инструменты включены, оформление планшета
const FACTIONS = {
  all: {
    name: 'Все',
    org: 'Правовая база Российской Федерации',
    color: '#8fa3bb',
    docs: ['konst', 'uk', 'koap', 'pk', 'upk', 'pdd'],
    tools: ['calc', 'timers'],
  },
  gibdd: {
    name: 'ГИБДД',
    org: 'Госавтоинспекция МВД России',
    color: '#25b4c8',
    docs: ['pdd', 'koap', 'fz99', 'uk', 'fz74', 'pk', 'konst'],
    tools: ['calc', 'timers', 'gov'],
  },
  uvd: {
    name: 'УВД',
    org: 'Управление внутренних дел',
    color: '#3f7cf0',
    docs: ['uk', 'koap', 'pk', 'fz74', 'fz34', 'pdd', 'upk', 'konst'],
    tools: ['calc', 'timers', 'gov'],
  },
  fsb: {
    name: 'ФСБ',
    org: 'Федеральная служба безопасности',
    color: '#d24a3e',
    docs: ['uk', 'koap', 'pk', 'upk', 'fz78', 'fz10', 'fz34', 'konst'],
    tools: ['calc', 'timers', 'gov'],
  },
  lawyer: {
    name: 'Адвокат',
    org: 'Коллегия адвокатов',
    color: '#c9a227',
    docs: ['uk', 'pk', 'upk', 'fz50', 'koap', 'konst'],
    tools: ['calc', 'bail', 'gov'],
  },
  sk: {
    name: 'СК и Прокуратура',
    org: 'Следственный комитет · Прокуратура',
    color: '#8a6cf0',
    docs: ['upk', 'pk', 'uk', 'fz88', 'fz14', 'koap', 'konst', 'fkz64'],
    tools: ['calc', 'gov', 'timers'],
  },
};

module.exports = { docMeta, CALC_DOCS, FACTIONS };
