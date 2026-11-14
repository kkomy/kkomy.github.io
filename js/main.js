// Routing between the book and the Design / Project tabs, and the work grid
// rendered from portfolio.json.

import { createBook } from './book.js';

const $ = (id) => document.getElementById(id);
const VIEWS = {
  design: { title: 'Design', meta: 'Brand / Editorial / Visual' },
  projects: { title: 'Project', meta: 'Product / Experience / Exploration' },
};

let data = { projects: [] };
let book = null;

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// ---- works ---------------------------------------------------------------
function renderWorks(view) {
  const items = data.projects.filter((p) => (p.section || 'design') === view);
  $('works-title').textContent = VIEWS[view].title;
  $('works-meta').textContent = `${VIEWS[view].meta} — ${String(items.length).padStart(2, '0')}`;
  const grid = $('grid');
  grid.replaceChildren(
    ...items.map((item) => {
      const kind = item.media?.endsWith('.mp4') ? 'Video' : item.media?.endsWith('.pdf') ? 'PDF' : '';
      const thumb = el('div', { className: 'thumb' }, [
        el('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async' }),
      ]);
      if (kind) thumb.append(el('span', { className: 'badge', textContent: kind }));
      const card = el('button', { className: 'card', type: 'button' }, [
        thumb,
        el('div', { className: 'cap' }, [
          el('span', { className: 'title', textContent: item.title }),
          el('span', { className: 'meta', textContent: [item.category, item.year].filter(Boolean).join(' · ') }),
        ]),
      ]);
      card.addEventListener('click', () => openDetail(item));
      return el('li', {}, [card]);
    }),
  );
  if (!items.length) grid.append(el('li', { className: 'empty', textContent: '아직 등록된 작업이 없습니다.' }));
}

function openDetail(item) {
  const media = $('detail-media');
  media.replaceChildren();
  if (item.media?.endsWith('.mp4')) {
    media.append(el('video', { src: item.media, poster: item.image, controls: true, playsInline: true, preload: 'metadata' }));
  } else if (item.media?.endsWith('.pdf')) {
    media.append(el('iframe', { src: item.media, title: `${item.title} PDF`, loading: 'lazy' }));
  } else {
    media.append(el('img', { src: item.image, alt: item.title }));
  }
  for (const src of item.gallery || []) media.append(el('img', { src, alt: item.title, loading: 'lazy' }));

  $('detail-eyebrow').textContent = [item.category, item.year].filter(Boolean).join(' · ');
  $('detail-title').textContent = item.title;
  $('detail-desc').textContent = item.description || '';
  $('detail-desc').hidden = !item.description;
  const links = $('detail-links');
  links.replaceChildren();
  if (item.link) links.append(el('a', { href: item.link, target: '_blank', rel: 'noopener', textContent: '프로젝트 보기 ↗' }));
  if (item.media?.endsWith('.pdf')) links.append(el('a', { href: item.media, target: '_blank', rel: 'noopener', textContent: 'PDF 새 탭에서 열기 ↗' }));
  $('detail').showModal();
  $('detail').scrollTop = 0;
}

$('detail-close').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => $('detail-media').replaceChildren());

// ---- routing -------------------------------------------------------------
function route() {
  const key = location.hash.replace(/^#\/?/, '');
  const view = VIEWS[key] ? key : 'book';
  document.body.dataset.view = view;
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  $('works').hidden = view === 'book';
  book?.setActive(view === 'book');
  if (view === 'book') {
    document.title = 'Moonkyeom Kim — Portfolio';
  } else {
    renderWorks(view);
    document.title = `${VIEWS[view].title} — Moonkyeom Kim`;
    window.scrollTo(0, 0);
  }
}
window.addEventListener('hashchange', route);

// ---- book ----------------------------------------------------------------
function onBook({ state, spread, spreads, free }) {
  $('reset').hidden = !free;
  document.body.dataset.book = state === 'flipping' ? 'open' : state;
  $('count').textContent = `${spread + 1} / ${spreads}`;
  $('prev').disabled = spread === 0;
  $('next').disabled = spread === spreads - 1;
}
$('open').addEventListener('click', () => book?.open());
$('reset').addEventListener('click', () => book?.resetView());
$('close').addEventListener('click', () => book?.close());
$('prev').addEventListener('click', () => book?.prev());
$('next').addEventListener('click', () => book?.next());
window.addEventListener('keydown', (ev) => {
  if (document.body.dataset.view !== 'book' || !book || $('detail').open) return;
  if (ev.key === 'ArrowRight') book.next();
  else if (ev.key === 'ArrowLeft') book.prev();
  else if (ev.key === 'Escape') book.close();
});

// ---- start ---------------------------------------------------------------
$('year').textContent = new Date().getFullYear();

fetch('./portfolio.json')
  .then((r) => r.json())
  .then((json) => {
    data = json;
    $('intro').textContent = json.intro || '';
    if (json.name) document.querySelector('.name').textContent = json.name;
    if (json.email) {
      Object.assign($('mail'), { href: `mailto:${json.email}`, textContent: json.email, hidden: false });
    }
    route();
  })
  .catch(() => route());

createBook($('scene'), { onChange: onBook })
  .then((b) => {
    book = b;
    if (new URLSearchParams(location.search).has('debug')) window.book = b;
    book.setActive(document.body.dataset.view === 'book');
    document.body.classList.add('ready');
  })
  .catch((err) => {
    console.error(err);
    document.body.classList.add('no-book');
  });

route();
