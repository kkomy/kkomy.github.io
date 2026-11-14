// Text layout for the book: parses book/text.txt, flows it into pages,
// decides which words get tied together across a spread, and paints each
// page onto a canvas that becomes a texture.
//
// text.txt format:
//   "# Heading"   chapter heading ("# One — The Hatchery")
//   blank line    paragraph break
//   *word*        marks a key verb
// Character names are detected automatically from CHARACTERS below.

export const CW = 1000;
export const CH = 1515;

const M = { top: 170, bottom: 150, inner: 128, outer: 96 };
const TEXT_W = CW - M.inner - M.outer;
const FS = 33;
const LH = 50;
const SERIF = '"EB Garamond", "Iowan Old Style", Georgia, serif';
const BODY = `${FS}px ${SERIF}`;
const INK = '#211e1a';
const SOFT = '#8b857a';
export const RED = '#c8102e';
const MAX_LINKS = 6;

// token (capitalised, as written) -> character key
const CHARACTERS = {
  director: 'director',
  henry: 'henry',
  lenina: 'lenina',
  fanny: 'fanny',
  bernard: 'bernard',
  helmholtz: 'helmholtz',
  mond: 'mond',
  controller: 'mond',
  john: 'john',
  savage: 'john',
  linda: 'linda',
};

const CAST = [
  ['The Director', 'who *remembers* too much'],
  ['Henry Foster', 'who *recites* the figures'],
  ['Lenina Crowne', 'who *takes* her soma'],
  ['Bernard Marx', 'who *wants* what he hates'],
  ['Helmholtz Watson', 'who *writes* slogans'],
  ['Mustapha Mond', 'who *chose* for everyone'],
  ['Linda', 'who was *left* behind'],
  ['John', 'who *claims* the right'],
];

const measurer = document.createElement('canvas').getContext('2d');
function widthOf(text, font) {
  measurer.font = font;
  return measurer.measureText(text).width;
}

function stem(word) {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function parseToken(raw) {
  const verb = raw.match(/^(.*?)\*([^*]+)\*(.*)$/);
  if (verb) return { pre: verb[1], core: verb[2], post: verb[3], type: 'verb', key: stem(verb[2]) };
  const name = raw.match(/^([^A-Za-z]*)([A-Z][a-z]+)(.*)$/);
  if (name && CHARACTERS[name[2].toLowerCase()]) {
    return { pre: name[1], core: name[2], post: name[3], type: 'char', key: CHARACTERS[name[2].toLowerCase()] };
  }
  return { pre: '', core: raw, post: '', type: null, key: null };
}

function makeWord(raw, font) {
  const tok = parseToken(raw);
  return {
    ...tok,
    font,
    preW: tok.pre ? widthOf(tok.pre, font) : 0,
    coreW: widthOf(tok.core, font),
    w: widthOf(tok.pre + tok.core + tok.post, font),
    x: 0,
    y: 0,
    linked: false,
  };
}

function parse(source) {
  const blocks = [];
  for (const chunk of source.replace(/\r/g, '').split(/\n\s*\n/)) {
    const text = chunk.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    if (text.startsWith('#')) {
      const [label, ...rest] = text.replace(/^#+\s*/, '').split(/\s+[—–-]\s+/);
      blocks.push({ type: 'h', label, title: rest.join(' — ') });
    } else {
      blocks.push({ type: 'p', words: text.split(' ').map((w) => makeWord(w, BODY)) });
    }
  }
  return blocks;
}

function breakLines(words, indent) {
  const space = widthOf(' ', BODY);
  const lines = [];
  let line = [];
  let used = indent;
  for (const word of words) {
    const extra = line.length ? space : 0;
    if (line.length && used + extra + word.w > TEXT_W) {
      lines.push({ words: line, indent: lines.length ? 0 : indent, last: false });
      line = [];
      used = 0;
    }
    used += (line.length ? space : 0) + word.w;
    line.push(word);
  }
  if (line.length) lines.push({ words: line, indent: lines.length ? 0 : indent, last: true });
  return lines;
}

function placeLine(line, y) {
  const natural = line.words.reduce((sum, w) => sum + w.w, 0);
  const gaps = line.words.length - 1;
  const space = widthOf(' ', BODY);
  let gap = space;
  if (!line.last && gaps > 0) {
    gap = (TEXT_W - line.indent - natural) / gaps;
    if (gap > space * 2.4) gap = space; // too loose to justify
  }
  let x = line.indent;
  for (const word of line.words) {
    word.x = x;
    word.y = y;
    x += word.w + gap;
  }
}

function titlePage() {
  const words = [];
  const nameFont = `36px ${SERIF}`;
  const roleFont = `italic 29px ${SERIF}`;
  let y = 830;
  const put = (text, font, x) => {
    for (const raw of text.split(' ')) {
      const word = makeWord(raw, font);
      word.x = x;
      word.y = y;
      x += word.w + widthOf(' ', font);
      words.push(word);
    }
    return x;
  };
  for (const [name, role] of CAST) {
    const x = put(name, nameFont, 0);
    put(role, roleFont, x + 16);
    y += 62;
  }
  return { kind: 'title', words, headings: [], chapter: '' };
}

function colophonPage() {
  const font = `italic 30px ${SERIF}`;
  const lines = [
    'This short retelling was *written* for this site,',
    'after the novel by Aldous Huxley (1932).',
    '',
    'Characters and verbs are *tied* across each',
    'spread with red thread. *Pick* the book up,',
    '*shake* it, and *watch* them swing.',
  ];
  const words = [];
  lines.forEach((line, i) => {
    if (!line) return;
    const row = line.split(' ').map((raw) => makeWord(raw, font));
    const space = widthOf(' ', font);
    let x = (TEXT_W - row.reduce((sum, w) => sum + w.w + space, -space)) / 2;
    for (const word of row) {
      word.x = x;
      word.y = 640 + i * 48;
      x += word.w + space;
      words.push(word);
    }
  });
  return { kind: 'colophon', words, headings: [], chapter: '' };
}

function colophon(page) {
  page.end = true;
}

export function buildPages(source) {
  const blocks = parse(source);
  const pages = [titlePage()];
  const bottom = CH - M.bottom;
  let page = null;
  let y = 0;
  let chapter = '';
  const newPage = () => {
    page = { kind: 'text', words: [], headings: [], chapter };
    pages.push(page);
    y = M.top;
  };
  newPage();

  let afterHeading = true;
  for (const block of blocks) {
    if (block.type === 'h') {
      const top = y > M.top;
      if (y + (top ? 70 : 0) + 150 + LH * 3 > bottom) newPage();
      if (y > M.top) y += 60;
      page.headings.push({ label: block.label, title: block.title, y });
      chapter = block.title || block.label;
      if (!page.chapter || page.words.length === 0) page.chapter = chapter;
      y += 140;
      afterHeading = true;
      continue;
    }
    const lines = breakLines(block.words, afterHeading ? 0 : FS * 1.3);
    afterHeading = false;
    for (const line of lines) {
      if (y + LH > bottom + 4) newPage();
      placeLine(line, y + FS);
      page.words.push(...line.words);
      y += LH;
    }
  }
  page.endY = y;
  colophon(page);
  if (pages.length % 2) pages.push(colophonPage());
  pages.forEach((p, i) => {
    p.index = i;
    p.side = i % 2 === 0 ? 'L' : 'R';
  });

  const spreads = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({ left: pages[i], right: pages[i + 1], links: linkSpread(pages[i], pages[i + 1]) });
  }
  return { pages, spreads };
}

// Ties words on the left page to words on the right page: the same
// character first, then the same verb, then verbs in reading order.
function linkSpread(left, right) {
  const links = [];
  const keysOf = (page, type) => page.words.filter((w) => w.type === type);
  const tie = (a, b) => {
    a.linked = b.linked = true;
    links.push({ a, b });
  };
  const spreadPick = (list, n) => {
    if (list.length <= n) return list;
    return Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]);
  };

  for (const type of ['char', 'verb']) {
    const seen = new Set();
    const rightWords = keysOf(right, type);
    for (const a of keysOf(left, type)) {
      if (links.length >= MAX_LINKS) break;
      if (seen.has(a.key)) continue;
      // prefer a partner far down/up the page so the threads cross
      const partners = rightWords.filter((b) => b.key === a.key && !b.linked);
      if (!partners.length) continue;
      seen.add(a.key);
      tie(a, partners[Math.floor(partners.length / 2)]);
    }
  }
  const room = MAX_LINKS - links.length;
  if (room > 0) {
    const ls = keysOf(left, 'verb').filter((w) => !w.linked);
    const rs = keysOf(right, 'verb').filter((w) => !w.linked);
    const n = Math.min(room, ls.length, rs.length);
    const a = spreadPick(ls, n);
    const b = spreadPick(rs, n);
    for (let i = 0; i < n; i++) tie(a[i], b[(i + 1) % n]);
  }
  return links;
}

const textLeft = (page) => (page.side === 'L' ? M.outer : M.inner);

// Where the thread is knotted: the gutter-side end of the word's underline,
// in canvas pixels.
export function pinOf(page, word) {
  const x0 = textLeft(page) + word.x + word.preW;
  return {
    x: page.side === 'L' ? x0 + word.coreW + 5 : x0 - 5,
    y: word.y + 9,
  };
}

function paper(ctx, side) {
  ctx.fillStyle = '#f8f4ea';
  ctx.fillRect(0, 0, CW, CH);
  // the page darkens as it rolls into the gutter
  const g = ctx.createLinearGradient(side === 'L' ? CW : 0, 0, side === 'L' ? CW - 260 : 260, 0);
  g.addColorStop(0, 'rgba(60,48,30,0.30)');
  g.addColorStop(0.35, 'rgba(60,48,30,0.08)');
  g.addColorStop(1, 'rgba(60,48,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  const e = ctx.createLinearGradient(side === 'L' ? 0 : CW, 0, side === 'L' ? 40 : CW - 40, 0);
  e.addColorStop(0, 'rgba(60,48,30,0.07)');
  e.addColorStop(1, 'rgba(60,48,30,0)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, CW, CH);
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
}

function drawWords(ctx, page) {
  const x0 = textLeft(page);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const w of page.words) {
    ctx.font = w.font;
    const x = x0 + w.x;
    if (!w.linked) {
      ctx.fillStyle = w.font.startsWith('italic') ? '#6f6a60' : INK;
      ctx.fillText(w.pre + w.core + w.post, x, w.y);
      continue;
    }
    ctx.fillStyle = INK;
    if (w.pre) ctx.fillText(w.pre, x, w.y);
    if (w.post) ctx.fillText(w.post, x + w.preW + w.coreW, w.y);
    ctx.fillStyle = RED;
    ctx.fillText(w.core, x + w.preW, w.y);
    ctx.fillRect(x + w.preW - 1, w.y + 7.5, w.coreW + 2, 2.5);
    const pin = pinOf(page, w);
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPage(page) {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  const x0 = textLeft(page);
  const mid = x0 + TEXT_W / 2;
  paper(ctx, page.side);

  if (page.kind === 'title') {
    ctx.fillStyle = INK;
    ctx.font = `500 92px ${SERIF}`;
    ['BRAVE', 'NEW', 'WORLD'].forEach((line, i) => spaced(ctx, line, x0, 300 + i * 104, 10));
    ctx.fillStyle = RED;
    ctx.fillRect(x0, 570, 120, 3);
    ctx.fillStyle = INK;
    ctx.font = `italic 34px ${SERIF}`;
    ctx.fillText('a retelling, after the novel by', x0, 640);
    ctx.font = `34px ${SERIF}`;
    spaced(ctx, 'ALDOUS HUXLEY', x0, 688, 5);
    ctx.fillStyle = SOFT;
    ctx.font = `22px ${SERIF}`;
    spaced(ctx, 'THE PERSONS OF THE STORY', x0, 760, 5);
    drawWords(ctx, page);
    return canvas;
  }

  if (page.kind === 'colophon') {
    ctx.fillStyle = RED;
    ctx.fillRect(mid - 30, 570, 60, 3);
    drawWords(ctx, page);
    return canvas;
  }

  // running head and folio
  ctx.fillStyle = SOFT;
  ctx.font = `21px ${SERIF}`;
  const head = page.side === 'L' ? 'BRAVE NEW WORLD' : (page.chapter || '').toUpperCase();
  if (!page.headings.some((h) => h.y === M.top)) spaced(ctx, head, mid, 104, 5, 'center');
  ctx.font = `26px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(page.index + 1), mid, CH - 78);

  for (const h of page.headings) {
    ctx.fillStyle = RED;
    ctx.font = `23px ${SERIF}`;
    spaced(ctx, h.label.toUpperCase(), mid, h.y + 26, 8, 'center');
    ctx.fillStyle = INK;
    ctx.font = `italic 44px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText(h.title, mid, h.y + 84);
  }

  drawWords(ctx, page);

  if (page.end && page.endY + 90 < CH - M.bottom) {
    ctx.fillStyle = SOFT;
    ctx.font = `22px ${SERIF}`;
    spaced(ctx, 'THE END', mid, page.endY + 80, 8, 'center');
  }
  return canvas;
}
