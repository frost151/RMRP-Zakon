'use strict';
// Загрузка законодательства с форума RMRP.
const { parseThreadPage, parseForumList } = require('./html-text');

const BASE = 'https://forum.rmrp.ru/';
const LAWS_URL = BASE + 'forums/laws/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' } });
  if (!res.ok) throw new Error(`Форум ответил ${res.status} на ${url}`);
  return res.text();
}

// Список тем раздела «Общее законодательство»
async function fetchThreadList() {
  const first = parseForumList(await get(LAWS_URL), BASE);
  const threads = [...first.threads];
  for (let p = 2; p <= first.lastPage; p++) {
    threads.push(...parseForumList(await get(`${LAWS_URL}page-${p}`), BASE).threads);
  }
  return threads;
}

// Все посты темы (со всех страниц)
async function fetchThread(url) {
  const first = parseThreadPage(await get(url));
  const posts = [...first.posts];
  for (let p = 2; p <= first.lastPage; p++) {
    posts.push(...parseThreadPage(await get(`${url}page-${p}`)).posts);
  }
  return posts;
}

module.exports = { fetchThreadList, fetchThread };
