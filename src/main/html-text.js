'use strict';
// Превращает HTML поста XenForo в чистый текст с переносами строк.
const cheerio = require('cheerio');

const BLOCK = new Set(['div', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'table', 'tr', 'section', 'article', 'header', 'footer', 'hr']);

function walk($, node, out) {
  if (node.type === 'text') {
    out.push(node.data);
    return;
  }
  if (node.type !== 'tag') return;
  const tag = node.name;
  if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'button') return;
  if (tag === 'br') { out.push('\n'); return; }
  const block = BLOCK.has(tag);
  if (block) out.push('\n');
  if (tag === 'td' || tag === 'th') out.push(' | ');
  for (const child of node.children || []) walk($, child, out);
  if (block) out.push('\n');
}

function cleanText(s) {
  return s
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/Нажмите, чтобы (раскрыть|скрыть)\.{0,3}/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Возвращает текст элемента bbWrapper, без оглавления (ссылок-якорей).
function postText($, wrapper) {
  const w = $(wrapper).clone();
  // Заголовки статей — ссылки-якоря внутри h2–h4: оставляем их текст, остальные якоря (оглавление) удаляем
  w.find('h1 a, h2 a, h3 a, h4 a, h5 a').each((_, a) => { $(a).replaceWith($(a).contents()); });
  w.find('a[href^="#"]').remove();
  w.find('.bbCodeBlock-expandLink, .bbCodeSpoiler-button').remove();
  w.find('ul, ol').each((_, el) => {
    if (!$(el).text().replace(/[\s​]/g, '')) $(el).remove();
  });
  const out = [];
  walk($, w[0], out);
  return cleanText(out.join(''));
}

// Разбирает страницу темы: [{ id, author, time, text }]
function parseThreadPage(html) {
  const $ = cheerio.load(html);
  const posts = [];
  $('article.message--post').each((_, el) => {
    const id = ($(el).attr('data-content') || '').replace('post-', '');
    const author = $(el).attr('data-author') || '';
    const time = Number($(el).find('time.u-dt').first().attr('data-time') || 0);
    const wrapper = $(el).find('.message-body .bbWrapper').first();
    if (!wrapper.length) return;
    posts.push({ id, author, time, text: postText($, wrapper) });
  });
  const pages = [];
  $('.pageNav-page a').each((_, a) => pages.push(Number($(a).text()) || 0));
  return { posts, lastPage: Math.max(1, ...pages) };
}

// Разбирает список тем раздела: [{ id, title, url, lastPost }]
function parseForumList(html, base) {
  const $ = cheerio.load(html);
  const threads = [];
  $('.structItem--thread').each((_, el) => {
    const a = $(el).find('.structItem-title a[href*="/threads/"]').last();
    const href = a.attr('href');
    if (!href) return;
    const m = href.match(/\.(\d+)\/?$/);
    const lastTime = Number($(el).find('.structItem-latestDate').attr('data-time') ||
      $(el).find('.structItem-cell--latest time').attr('data-time') || 0);
    threads.push({
      id: m ? m[1] : href,
      title: a.text().trim(),
      url: new URL(href, base).href,
      lastTime,
    });
  });
  const pages = [];
  $('.pageNav-page a').each((_, a) => pages.push(Number($(a).text()) || 0));
  return { threads, lastPage: Math.max(1, ...pages) };
}

module.exports = { parseThreadPage, parseForumList, postText };
