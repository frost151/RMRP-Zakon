'use strict';
// Превращает посты темы форума в структуру закона: статьи, части, санкции, поправки.
const crypto = require('crypto');
const { parseSanction } = require('./sanction');
const { docMeta } = require('./laws-meta');

const AMEND_LABEL = /^(Обновлен[оа]?|Добавлен[оаы]?|Утратил[оаи]?(?: силу)?|Изменен[оа]?)\s*:/i;
const ARTICLE_RE = /^Статья\s*([\dIVXLC]+(?:[.\-]\d+)*)\.?\s*(.*)$/i;
const CHAPTER_RE = /^(Раздел|Глава|ГЛАВА|РАЗДЕЛ)\s+[IVXLC\d]+\.?/;
const PART_RE = /^(\d+(?:[.\-]\d+)+)\.\s*(.*)$/;
const SANCTION_LINE = /^(наказыва|влеч[её]т|влекут)/i;

function isAmendmentPost(text) {
  return text.length < 3000 && text.split('\n').some((l) => AMEND_LABEL.test(l.trim()));
}

// «ч. 1 ст. 27, ст.12, ч.4-8 ст.12» → ['27', '12']
function parseRefs(s) {
  const out = [];
  for (const m of s.matchAll(/ст(?:атьи|атья|\.)?\s*\.?\s*([\dIVXLC]+(?:[.\-]\d+)*)/gi)) {
    out.push(m[1].replace(/\.$/, ''));
  }
  return out;
}

function parseAmendment(post) {
  const res = { postId: post.id, time: post.time, updated: [], added: [], repealed: [] };
  let cur = null;
  for (const raw of post.text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(AMEND_LABEL);
    if (m) {
      const label = m[1].toLowerCase();
      cur = label.startsWith('добав') ? 'added' : label.startsWith('утрат') ? 'repealed' : 'updated';
      const rest = l.slice(m[0].length);
      if (rest) res[cur].push(...parseRefs(rest));
      continue;
    }
    if (/^(Принят|Одобрен|Подписан)/i.test(l)) cur = null;
    if (cur) res[cur].push(...parseRefs(l));
  }
  return res;
}

function finishArticle(art) {
  const lines = art.lines;
  delete art.lines;
  art.text = lines.join('\n').trim();
  art.repealed = /утратил[аи]? силу/i.test(art.title) && art.text.length < 200;
  const parts = [];
  let cur = null;
  for (const l of lines) {
    const pm = l.match(PART_RE);
    if (pm && pm[1].startsWith(art.num + '.') && pm[1].length > art.num.length + 1) {
      cur = { code: pm[1], lines: [l] };
      parts.push(cur);
    } else if (cur) {
      cur.lines.push(l);
    }
  }
  const findSanction = (ls) => {
    const line = ls.find((l) => SANCTION_LINE.test(l.trim()));
    if (line) return parseSanction(line);
    const inline = ls.join(' ').match(/(наказыва[а-я]*|влеч[её]т)\s.+$/i);
    return inline ? parseSanction(inline[0]) : null;
  };
  art.parts = parts.map((p) => ({ code: p.code, text: p.lines.join('\n').trim(), sanction: findSanction(p.lines) }));
  // Санкция статьи без частей
  const ownSanction = art.parts.some((p) => p.sanction) ? null : findSanction(lines);
  art.sanction = ownSanction;
  return art;
}

// thread: { id, title, url, lastTime }, posts: [{ id, time, text }]
function parseLaw(thread, posts) {
  const meta = docMeta(thread.title);
  const bodyPosts = posts.filter((p, i) => i === 0 || !isAmendmentPost(p.text));
  const amendments = posts.filter((p, i) => i > 0 && isAmendmentPost(p.text)).map(parseAmendment);
  const text = bodyPosts.map((p) => p.text).join('\n\n');

  const articles = [];
  const preamble = [];
  let chapter = '';
  let art = null;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const am = l.match(ARTICLE_RE);
    if (am) {
      if (art) articles.push(finishArticle(art));
      art = { num: am[1].replace(/\.$/, ''), title: am[2].replace(/[.:]\s*$/, '').trim(), chapter, lines: [] };
      continue;
    }
    if (CHAPTER_RE.test(l) && l.length < 200) {
      chapter = l;
      continue;
    }
    if (art) art.lines.push(l);
    else preamble.push(l);
  }
  if (art) articles.push(finishArticle(art));

  // Отмечаем статьи, затронутые поправками (берём самую свежую дату)
  const changed = new Map();
  for (const a of amendments) {
    for (const kind of ['updated', 'added', 'repealed']) {
      for (const num of a[kind]) {
        const prev = changed.get(num);
        if (!prev || prev.time < a.time) changed.set(num, { time: a.time, kind });
      }
    }
  }
  for (const a of articles) {
    const c = changed.get(a.num);
    if (c) a.amended = c;
  }

  return {
    id: thread.id,
    key: meta.key,
    short: meta.short,
    aliases: meta.aliases,
    title: thread.title.replace(/\s+/g, ' ').trim(),
    url: thread.url,
    lastTime: thread.lastTime || Math.max(0, ...posts.map((p) => p.time)),
    hash: crypto.createHash('sha1').update(text).digest('hex'),
    preamble: preamble.join('\n'),
    articles,
    amendments,
  };
}

module.exports = { parseLaw, isAmendmentPost, parseAmendment };
