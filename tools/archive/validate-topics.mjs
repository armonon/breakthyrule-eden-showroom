// Preserve the verified pre-mishap subject catalog while allowing future additions.
export function parseEmbeddedTopics(html) {
  const scripts = [...String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => /\bid\s*=\s*['"]archive-topics-data['"]/i.test(match[1]));
  if (scripts.length !== 1) throw new Error('archive.html must contain exactly one archive-topics-data script');
  if (!/\btype\s*=\s*['"]application\/json['"]/i.test(scripts[0][1])) throw new Error('archive-topics-data must use application/json');
  try { return JSON.parse(scripts[0][2]); }
  catch { throw new Error('archive-topics-data must contain valid JSON'); }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export function sameCatalog(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }

export function validateArchiveTopics(catalog, embedded, baseline) {
  const errors = [];
  if (!Array.isArray(catalog?.topics) || !Array.isArray(catalog?.groups)) return ['Archive catalog must contain topics and groups arrays'];
  const topicIds = new Set(), groups = new Map();
  for (const topic of catalog.topics) {
    if (!topic || typeof topic.id !== 'string' || !topic.id || typeof topic.title !== 'string' || !topic.title.trim()) { errors.push('Archive topic requires an ID and title'); continue; }
    if (topicIds.has(topic.id)) errors.push('Duplicate archive topic ID: ' + topic.id);
    topicIds.add(topic.id);
    if (!Array.isArray(topic.tags) || topic.tags.some(tag => typeof tag !== 'string')) errors.push('Archive topic requires shelf tags: ' + topic.id);
  }
  for (const group of catalog.groups) {
    if (!group || typeof group.id !== 'string' || !group.id || typeof group.title !== 'string' || !group.title.trim() || !Array.isArray(group.ids)) { errors.push('Archive group requires an ID, title and topic IDs'); continue; }
    if (groups.has(group.id)) errors.push('Duplicate archive group ID: ' + group.id);
    groups.set(group.id, group);
    const members = new Set();
    for (const id of group.ids) {
      if (!topicIds.has(id)) errors.push('Archive group ' + group.id + ' references missing topic: ' + id);
      if (members.has(id)) errors.push('Duplicate topic in archive group ' + group.id + ': ' + id);
      members.add(id);
    }
  }
  for (const id of baseline.topicIds) if (!topicIds.has(id)) errors.push('Verified archive topic is missing: ' + id);
  for (const required of baseline.groups) {
    const group = groups.get(required.id);
    if (!group) errors.push('Verified archive group is missing: ' + required.id);
    else for (const id of required.ids) if (!group.ids.includes(id)) errors.push('Verified archive group ' + required.id + ' lost topic: ' + id);
  }
  if (!sameCatalog(catalog, embedded)) errors.push('Embedded archive topics differ from site/data/topics.json; run node tools/archive/embed-topics.mjs');
  return errors;
}
