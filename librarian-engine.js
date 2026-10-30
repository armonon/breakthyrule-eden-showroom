'use strict';
// Generated from Librarian Atlas src/main.js by work/sync-librarian-engine.cjs.
// Reuses its 15 catalog adapters, ISBN/fuzzy deduplication and relevance ranking.
// No app storage, credentials, PDF imports or deployment metadata are copied.
window.createLibrarianAtlasEngine=function(request){
const OPEN_LIBRARY_OFFSETS=[0],GOOGLE_OFFSETS=[0],GUTENDEX_PAGES=[1];
const POLITE_MAILTO='librarian-atlas@users.noreply.github.com';
const PROXY='https://librarian-atlas.netlify.app/.netlify/functions/proxy';
const json=url=>request(url,'json');
const text=url=>request(url,'text');
const GENRES = ['science fiction', 'fantasy', 'poetry', 'history', 'biography', 'autobiography', 'philosophy', 'mystery', 'romance', 'thriller', 'horror', 'drama', 'essays', 'short stories', 'art', 'science', 'religion', 'psychology', 'economics', 'politics', 'memoir', 'adventure', 'classics', 'children', 'cooking', 'travel', 'nature', 'fiction'];
function uniq(a = []) { return [...new Set(a.flat().filter(Boolean).map(String))]; }
function year(v) { return String(v || '').match(/-?\d{3,4}/)?.[0] || ''; }
function isbn(ids = []) { return ids.find(id => /^97[89]/.test(String(id).replace(/[^0-9X]/gi, ''))) || ids[0] || ''; }
function key(book) { const i = isbn(book.ids); return i ? `isbn:${i.replace(/[^0-9X]/gi, '').toUpperCase()}` : `${book.title}|${book.authors?.[0] || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function compact(text = '', max = 180) { text = Array.isArray(text) ? text.join(', ') : String(text); return text.length > max ? `${text.slice(0, max).trim()}…` : text; }
function score(book) { return Math.round(([book.title, book.authors?.length, book.cover, book.year, book.subjects?.length, book.ids?.length, book.desc, book.langs?.length, book.links?.length, !/catalog only/i.test(book.availability || '')].filter(Boolean).length / 10) * 100); }
function titleCase(s = '') { return String(s).replace(/\w\S*/g, w => w.length > 3 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).replace(/^./, c => c.toUpperCase()); }

function category(book) {
  const subs = uniq(book.subjects).map(s => s.trim()).filter(Boolean);
  const low = subs.map(s => s.toLowerCase());
  for (const g of GENRES) { const re = new RegExp(`(^|[^a-z])${g.replace(/ /g, '\\s+')}([^a-z]|$)`); if (low.some(s => re.test(s))) return titleCase(g); }
  const phrase = subs.find(s => s.split(' ').length <= 3 && s.length <= 24 && !/[,;:()/0-9]/.test(s));
  return titleCase((phrase || subs[0] || book.sources?.[0] || 'General').slice(0, 30));
}
function reconstructAbstract(inv) { if (!inv) return ''; const out = []; for (const [w, ps] of Object.entries(inv)) for (const p of ps) out[p] = w; return out.join(' ').replace(/\s+/g, ' ').trim(); }
function isbnOf(ids = []) { return uniq(ids).map(x => String(x).replace(/[^0-9Xx]/g, '')).find(x => /^(97[89]\d{10}|\d{9}[\dXx])$/.test(x)) || ''; }

async function openLibrary(q) {
  const settled = await Promise.allSettled(OPEN_LIBRARY_OFFSETS.map(offset => json(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=100&offset=${offset}&fields=key,title,author_name,first_publish_year,publish_year,isbn,language,subject,cover_i,edition_count,ia,ebook_access,ratings_average,number_of_pages_median`)));
  return settled.flatMap(r => r.status === 'fulfilled' ? (r.value.docs || []) : []).map(d => ({
    id: `ol:${d.key}`, work: /^\/works\//.test(d.key || '') ? d.key : '', title: d.title, authors: uniq(d.author_name).slice(0, 4), year: d.first_publish_year || '', pages: d.number_of_pages_median || '', subjects: uniq(d.subject).slice(0, 14), langs: uniq(d.language).slice(0, 4), ids: uniq(d.isbn).slice(0, 8),
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
    desc: `${d.edition_count || 1} edition${d.edition_count === 1 ? '' : 's'} indexed by Open Library${d.ratings_average ? ` • average rating ${d.ratings_average.toFixed(1)}` : ''}.`,
    availability: d.ebook_access === 'public' || d.ia?.length ? 'Readable / borrowable' : 'Catalog only',
    links: [{ label: 'Open Library', url: `https://openlibrary.org${d.key}` }, ...(d.ia?.[0] ? [{ label: 'Internet Archive item', url: `https://archive.org/details/${d.ia[0]}` }] : [])],
    sources: ['Open Library']
  }));
}

async function googleBooks(q) {
  const settled = await Promise.allSettled(GOOGLE_OFFSETS.map(start => json(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=40&startIndex=${start}&printType=books&projection=lite`)));
  return settled.flatMap(r => r.status === 'fulfilled' ? (r.value.items || []) : []).map(item => { const v = item.volumeInfo || {}, a = item.accessInfo || {}, s = item.saleInfo || {}; return {
    id: `gb:${item.id}`, title: v.title, authors: uniq(v.authors).slice(0, 4), year: year(v.publishedDate), pages: v.pageCount || '', subjects: uniq(v.categories).slice(0, 8), langs: uniq([v.language]), ids: uniq((v.industryIdentifiers || []).map(x => x.identifier)).slice(0, 8),
    cover: (v.imageLinks?.thumbnail || '').replace('http://', 'https://'), desc: compact(v.description || `${v.publisher || 'Publisher metadata'}${v.pageCount ? ` • ${v.pageCount} pages` : ''}.`, 320),
    availability: a.epub?.isAvailable || a.pdf?.isAvailable ? 'Preview / ebook metadata' : s.saleability === 'FOR_SALE' ? 'For sale' : 'Catalog only',
    links: [...(v.previewLink ? [{ label: 'Google preview', url: v.previewLink }] : []), ...(v.infoLink ? [{ label: 'Google Books', url: v.infoLink }] : [])], sources: ['Google Books']
  }; });
}

async function gutenberg(q) {
  const term = encodeURIComponent(q.replace(/^isbn:/i, '').trim());
  const settled = await Promise.allSettled(GUTENDEX_PAGES.map(page => json(`https://gutendex.com/books?search=${term}&page=${page}`)));
  return settled.flatMap(r => r.status === 'fulfilled' ? (r.value.results || []) : []).map(b => ({
    id: `pg:${b.id}`, title: b.title, authors: uniq((b.authors || []).map(a => a.name)).slice(0, 4), year: '', pages: '', subjects: uniq([...(b.subjects || []), ...(b.bookshelves || [])]).slice(0, 14), langs: uniq(b.languages), ids: [`Project Gutenberg ${b.id}`],
    cover: b.formats?.['image/jpeg'] || '', desc: `Public-domain ebook from Project Gutenberg • ${(b.download_count || 0).toLocaleString()} downloads.`, availability: 'Free public-domain ebook',
    links: [{ label: 'Project Gutenberg', url: `https://www.gutenberg.org/ebooks/${b.id}` }, ...(b.formats?.['text/html'] ? [{ label: 'Read HTML', url: b.formats['text/html'] }] : []), ...(b.formats?.['application/epub+zip'] ? [{ label: 'Download EPUB', url: b.formats['application/epub+zip'] }] : [])], sources: ['Project Gutenberg']
  }));
}

async function openAlex(q) {
  const term = q.replace(/^isbn:/i, '').trim();
  const data = await json(`https://api.openalex.org/works?search=${encodeURIComponent(term)}&filter=type:book|monograph|dissertation&per-page=200&mailto=${encodeURIComponent(POLITE_MAILTO)}`);
  return (data.results || []).map(w => {
    const oa = w.open_access || {}, loc = w.best_oa_location || w.primary_location || {}, doi = (w.doi || '').replace(/^https?:\/\/doi\.org\//, '');
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    return {
      id: `oa:${w.id}`, title: w.display_name, authors: uniq((w.authorships || []).map(a => a.author?.display_name)).slice(0, 4), year: w.publication_year || '', pages: '',
      subjects: uniq((w.topics || []).map(t => t.display_name)).slice(0, 10), langs: w.language ? [w.language] : [], ids: uniq([doi]).slice(0, 8), cover: '',
      desc: abstract ? compact(abstract, 320) : `${titleCase(w.type || 'work')}${loc.source?.display_name ? ` • ${loc.source.display_name}` : ''}${w.cited_by_count ? ` • cited ${w.cited_by_count.toLocaleString()} times` : ''}.`,
      availability: oa.is_oa ? 'Free / open access' : 'Catalog only',
      links: uniqLinks([...(oa.oa_url ? [{ label: 'Open-access full text', url: oa.oa_url }] : []), ...(loc.landing_page_url ? [{ label: 'Publisher page', url: loc.landing_page_url }] : []), ...(doi ? [{ label: 'DOI', url: `https://doi.org/${doi}` }] : []), { label: 'OpenAlex', url: w.id }]),
      sources: ['OpenAlex']
    };
  });
}

async function crossref(q) {
  const term = q.replace(/^isbn:/i, '').trim();
  const data = await json(`https://api.crossref.org/works?query=${encodeURIComponent(term)}&filter=type:monograph,type:book,type:reference-book&rows=100&select=title,author,published,ISBN,publisher,type,abstract,subject,language,DOI&mailto=${encodeURIComponent(POLITE_MAILTO)}`);
  return (data.message?.items || []).map(it => {
    const doi = it.DOI || '', yr = (it.published?.['date-parts']?.[0] || [])[0] || '';
    return {
      id: `cr:${doi || (it.title || [])[0] || Math.random()}`, title: (it.title || [])[0], authors: uniq((it.author || []).map(a => [a.given, a.family].filter(Boolean).join(' '))).slice(0, 4), year: yr, pages: '',
      subjects: uniq(it.subject).slice(0, 10), langs: it.language ? [it.language] : [], ids: uniq(it.ISBN).slice(0, 8), cover: '',
      desc: it.abstract ? compact(String(it.abstract).replace(/<[^>]+>/g, ''), 320) : `${it.publisher || 'Publisher'}${it.type ? ` • ${titleCase(it.type.replace(/-/g, ' '))}` : ''}.`,
      availability: 'Catalog only', links: uniqLinks(doi ? [{ label: 'DOI', url: `https://doi.org/${doi}` }] : []), sources: ['Crossref']
    };
  });
}

async function internetArchive(q) {
  const term = q.replace(/^isbn:/i, '').trim();
  const data = await json(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(term)}+AND+mediatype%3Atexts&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=language&fl[]=subject&fl[]=isbn&rows=100&page=1&output=json`);
  return (data.response?.docs || []).map(d => {
    const arr = v => [].concat(v || []).filter(Boolean);
    return {
      id: `ia:${d.identifier}`, title: arr(d.title)[0], authors: arr(d.creator).slice(0, 4), year: year(d.year), pages: '',
      subjects: uniq(arr(d.subject)).slice(0, 10), langs: uniq(arr(d.language)).slice(0, 3), ids: uniq(arr(d.isbn)).slice(0, 8),
      cover: `https://archive.org/services/img/${d.identifier}`, desc: 'Digitized full text on the Internet Archive.', availability: 'Readable / borrowable',
      links: [{ label: 'Internet Archive', url: `https://archive.org/details/${d.identifier}` }], sources: ['Internet Archive']
    };
  });
}

async function dpla(q) {
  const data = await json(`${PROXY}?api=dpla&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`);
  return (data.docs || []).map(d => {
    const sr = d.sourceResource || {}, arr = v => [].concat(v || []).filter(Boolean);
    return {
      id: `dpla:${d.id}`, title: arr(sr.title)[0], authors: uniq(arr(sr.creator)).slice(0, 4), year: year(sr.date?.displayDate || sr.date), pages: '',
      subjects: uniq(arr(sr.subject).map(s => s?.name || s)).slice(0, 10), langs: uniq(arr(sr.language).map(l => l?.name || l)).slice(0, 3), ids: [],
      cover: typeof d.object === 'string' ? d.object : '',
      desc: compact(arr(sr.description)[0] || `Held by ${d.provider?.name || d.dataProvider || 'a DPLA partner'}.`, 320),
      availability: 'Catalog only',
      links: uniqLinks([...(d.isShownAt ? [{ label: d.provider?.name || 'View item', url: d.isShownAt }] : []), { label: 'DPLA', url: `https://dp.la/item/${d.id}` }]),
      sources: ['DPLA']
    };
  });
}

async function europeana(q) {
  const data = await json(`${PROXY}?api=europeana&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`);
  const arr = v => [].concat(v || []).filter(Boolean), notUri = a => !/^https?:\/\//.test(a);
  return (data.items || []).map(it => ({
    id: `eu:${it.id}`, title: arr(it.title)[0], authors: uniq(arr(it.dcCreator).filter(notUri)).slice(0, 4), year: year(arr(it.year)[0]), pages: '',
    subjects: uniq(arr(it.dcSubject).filter(notUri)).slice(0, 10), langs: uniq(arr(it.language)).slice(0, 3), ids: [],
    cover: arr(it.edmPreview)[0] || '',
    desc: compact(arr(it.dcDescription)[0] || `From ${arr(it.dataProvider)[0] || 'a Europeana partner'}.`, 320),
    availability: 'Catalog only',
    links: uniqLinks([...(arr(it.edmIsShownAt)[0] ? [{ label: 'View item', url: arr(it.edmIsShownAt)[0] }] : []), ...(it.guid ? [{ label: 'Europeana', url: it.guid }] : [])]),
    sources: ['Europeana']
  }));
}

async function core(q) {
  const data = await json(`${PROXY}?api=core&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`);
  return (data.results || []).map(w => ({
    id: `core:${w.id}`, title: w.title, authors: uniq((w.authors || []).map(a => a.name)).slice(0, 4), year: w.yearPublished || '', pages: '',
    subjects: uniq([].concat(w.fieldOfStudy || []).filter(Boolean)).slice(0, 10), langs: w.language ? [w.language.name || w.language.code] : [], ids: uniq([w.doi]).slice(0, 8), cover: '',
    desc: w.abstract ? compact(w.abstract, 320) : `${w.publisher || 'Open-access work'}${w.documentType ? ` • ${w.documentType}` : ''}.`,
    availability: w.downloadUrl ? 'Free / open access' : 'Catalog only',
    links: uniqLinks([...(w.downloadUrl ? [{ label: 'Open-access PDF', url: w.downloadUrl }] : []), ...(w.doi ? [{ label: 'DOI', url: `https://doi.org/${w.doi}` }] : []), { label: 'CORE', url: `https://core.ac.uk/works/${w.id}` }]),
    sources: ['CORE']
  }));
}

// Generic SRU / Dublin Core parser — handles K10plus, Library of Congress, BnF (namespaces vary).
const RELATORS = /[.,]\s*(auteur du texte|éditeur scientifique|verfasser(in)?|mitwirkende[r]?|herausgeber(in)?|übersetzer(in)?|author|editor|translator|illustrator|compiler|writer of [a-z ]+|foreword|introduction|contributor)\b.*$/i;
const cleanName = s => s.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(RELATORS, '').replace(/[\s,.;:/]+$/, '').trim();
const cleanTitle = s => s.replace(/\s*[/:;]\s*$/, '').replace(/\s+/g, ' ').trim();
function parseSRU(xml, source, prefix) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  return [...doc.getElementsByTagNameNS('*', 'recordData')].map((rd, i) => {
    const get = name => [...rd.getElementsByTagNameNS('*', name)].map(e => e.textContent.trim()).filter(Boolean);
    const title = cleanTitle(get('title')[0] || ''); if (!title) return null;
    const rawIds = get('identifier');
    const ids = uniq(rawIds.map(x => { const m = x.replace(/[^0-9Xx]/g, ''); return /^(97[89]\d{10}|\d{9}[\dXx])$/.test(m) ? m : (/^(https?:|urn:|ark:)/i.test(x) ? '' : (x.length <= 20 ? x : '')); }).filter(Boolean));
    const wc = isbnOf(ids), catUrl = rawIds.find(x => /^https?:\/\//i.test(x));
    return {
      id: `${prefix}:${i}:${(wc || title).slice(0, 50)}`, title,
      authors: uniq([...get('creator'), ...get('contributor')].map(cleanName)).filter(Boolean).slice(0, 4),
      year: year(get('date')[0]), pages: '', subjects: uniq(get('subject')).slice(0, 10), langs: uniq(get('language')).slice(0, 3), ids: ids.slice(0, 8), cover: '',
      desc: compact(get('description')[0] || `Catalog record from ${source}.`, 320), availability: 'Catalog only',
      links: uniqLinks([...(catUrl ? [{ label: `${source} record`, url: catUrl }] : []), ...(wc ? [{ label: 'Find in a library (WorldCat)', url: `https://search.worldcat.org/isbn/${wc}` }] : [])]),
      sources: [source]
    };
  }).filter(Boolean);
}
async function k10plus(q) { return parseSRU(await text(`${PROXY}?api=k10plus&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`), 'K10plus', 'k10'); }
async function loc(q) { return parseSRU(await text(`${PROXY}?api=loc&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`), 'Library of Congress', 'loc'); }
async function bnf(q) { return parseSRU(await text(`${PROXY}?api=bnf&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`), 'BnF', 'bnf'); }
async function dnb(q) { return parseSRU(await text(`${PROXY}?api=dnb&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`), 'DNB', 'dnb'); }

async function finna(q) {
  const data = await json(`${PROXY}?api=finna&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`);
  return (data.records || []).filter(r => !r.formats || r.formats.some(f => /book/i.test(f.value || f.translated || ''))).map(r => {
    const isbns = [].concat(r.cleanIsbn || []).filter(Boolean), wc = isbnOf(isbns), img = (r.images || [])[0];
    return {
      id: `finna:${r.id}`, title: Array.isArray(r.title) ? r.title[0] : r.title, authors: uniq((r.nonPresenterAuthors || []).map(a => a.name)).slice(0, 4),
      year: year(r.year), pages: '', subjects: uniq([].concat(...(r.subjects || []))).slice(0, 10), langs: uniq(r.languages).slice(0, 3), ids: uniq(isbns).slice(0, 8),
      cover: img ? `https://api.finna.fi${img}` : '', desc: 'Catalog record from Finnish libraries (Finna).', availability: 'Catalog only',
      links: uniqLinks([{ label: 'Finna', url: `https://www.finna.fi/Record/${encodeURIComponent(r.id)}` }, ...(wc ? [{ label: 'Find in a library (WorldCat)', url: `https://search.worldcat.org/isbn/${wc}` }] : [])]),
      sources: ['Finna']
    };
  });
}

async function norway(q) {
  const data = await json(`${PROXY}?api=norway&q=${encodeURIComponent(q.replace(/^isbn:/i, '').trim())}`);
  return (data?._embedded?.items || []).filter(it => (it.metadata?.mediaTypes || []).some(m => /bøker|book/i.test(m))).map(it => {
    const m = it.metadata || {}, ln = it._links || {}, isbns = [].concat(m.identifiers?.isbn || []).filter(Boolean), wc = isbnOf(isbns);
    const thumb = ln.thumbnail_large || ln.thumbnail_custom || ln.thumbnail_small;
    return {
      id: `nb:${it.id}`, title: m.title, authors: uniq(m.creators).slice(0, 4), year: year(m.originInfo?.issued), pages: '',
      subjects: uniq([].concat(m.subjects || [])).slice(0, 10), langs: uniq((m.languages || []).map(l => l.code || l)).slice(0, 3), ids: uniq(isbns).slice(0, 8),
      cover: thumb ? (thumb.href || thumb) : '', desc: 'Catalog record from the National Library of Norway.', availability: 'Catalog only',
      links: uniqLinks([{ label: 'Nasjonalbiblioteket', url: `https://www.nb.no/items/${it.id}` }, ...(wc ? [{ label: 'Find in a library (WorldCat)', url: `https://search.worldcat.org/isbn/${wc}` }] : [])]),
      sources: ['Nasjonalbiblioteket']
    };
  });
}

// Registry of live sources. Keys match SOURCES[].name so the Sources tab can
// toggle them and show what each contributed to the last search.
const FETCHERS = {
  'Open Library': { fn: openLibrary, tier: 'fast' },
  'Google Books': { fn: googleBooks, tier: 'fast' },
  'Project Gutenberg / Gutendex': { fn: gutenberg, tier: 'fast' },
  'OpenAlex': { fn: openAlex, tier: 'fast' },
  'Crossref': { fn: crossref, tier: 'fast' },
  'Internet Archive': { fn: internetArchive, tier: 'fast' },
  'CORE': { fn: core, tier: 'slow' },
  'DPLA': { fn: dpla, tier: 'slow' },
  'Europeana': { fn: europeana, tier: 'slow' },
  'K10plus': { fn: k10plus, tier: 'slow' },
  'Library of Congress': { fn: loc, tier: 'slow' },
  'BnF': { fn: bnf, tier: 'slow' },
  'DNB': { fn: dnb, tier: 'slow' },
  'Finna': { fn: finna, tier: 'slow' },
  'Nasjonalbiblioteket': { fn: norway, tier: 'slow' },
};
function tokenize(q) { return String(q || '').replace(/^isbn:/i, '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2); }
function relevance(book, toks) {
  if (!toks.length) return 0;
  const title = (book.title || '').toLowerCase(), hay = `${title} ${(book.authors || []).join(' ').toLowerCase()}`;
  let rel = toks.filter(t => hay.includes(t)).length / toks.length;
  const phrase = toks.join(' ');
  if (title.includes(phrase)) rel += 0.3;
  if (title === phrase) rel += 0.4;
  return Math.min(rel, 1.3);
}
// ---- fuzzy dedup helpers ----
const strip = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
function normTitle(t = '') { return strip(t).split(/[:/]/)[0].replace(/^(the|a|an|le|la|les|el|der|die|das)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 8).join(' '); }
function authorKey(authors = []) {
  const a = strip(authors[0]); if (!a) return '';
  let surname, first;
  if (a.includes(',')) { const p = a.split(','); surname = p[0]; first = (p[1] || '').trim(); }
  else { const w = a.replace(/[^a-z\s.]/g, '').split(/\s+/).filter(Boolean); surname = w[w.length - 1] || ''; first = w[0] || ''; }
  surname = surname.replace(/[^a-z]/g, '');
  return surname ? `${surname}-${(first || '')[0] || ''}` : '';
}
function fingerprint(b) { const t = normTitle(b.title), ak = authorKey(b.authors); return (t.length >= 2 && ak) ? `${t}|${ak}` : ''; }
function normIsbns(ids = []) { return uniq(ids).map(x => String(x).replace(/[^0-9Xx]/g, '').toUpperCase()).filter(x => /^(\d{9}[\dX]|\d{13})$/.test(x)); }
function dedupeAuthors(list) {
  const seen = new Map();
  for (const a of list) {
    if (!a) continue;
    const norm = strip(a).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length > 1).sort().join(' ');
    if (!seen.has(norm)) seen.set(norm, a);
    else if (seen.get(norm).includes(',') && !a.includes(',')) seen.set(norm, a); // prefer "First Last" display
  }
  return [...seen.values()].slice(0, 5);
}
function combine(a, b) {
  return { ...a, work: a.work || b.work, title: a.title || b.title, year: a.year || b.year, pages: a.pages || b.pages, cover: a.cover || b.cover,
    desc: (a.desc || '').length >= (b.desc || '').length ? a.desc : b.desc,
    availability: /free|read|borrow|preview/i.test(a.availability) ? a.availability : b.availability,
    authors: dedupeAuthors([...(a.authors || []), ...(b.authors || [])]),
    subjects: uniq([a.subjects, b.subjects]).slice(0, 16), ids: uniq([a.ids, b.ids]), langs: uniq([a.langs, b.langs]),
    links: uniqLinks([...(a.links || []), ...(b.links || [])]), sources: uniq([a.sources, b.sources]) };
}
function merge(all, q) {
  const recs = all.filter(x => x?.title);
  const parent = recs.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const isbnMap = new Map(), fpMap = new Map();
  recs.forEach((r, i) => {
    for (const is of normIsbns(r.ids)) { if (isbnMap.has(is)) union(i, isbnMap.get(is)); else isbnMap.set(is, i); }
    const fp = fingerprint(r);
    if (fp) { if (fpMap.has(fp)) union(i, fpMap.get(fp)); else fpMap.set(fp, i); }
  });
  const groups = new Map();
  recs.forEach((r, i) => { const root = find(i); (groups.get(root) || groups.set(root, []).get(root)).push(r); });
  const toks = tokenize(q);
  const out = [...groups.values()].map(g => g.reduce(combine));
  for (const b of out) { b.score = score(b); b.held = uniq(b.sources).length; b.rank = relevance(b, toks) + (b.score / 100) * 0.6 + Math.min(b.held - 1, 4) * 0.08; }
  return out.sort((a, b) => b.rank - a.rank || Number(b.year || 0) - Number(a.year || 0));
}
function uniqLinks(links) { return links.filter((l, i, a) => l?.url && a.findIndex(x => x.url === l.url) === i); }


return {fetchers:FETCHERS,merge};
};
