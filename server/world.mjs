// Shared garden state that is not presence: the stage-weather lever, the Fools' Ladder and each account's progress
// through the garden's secrets (eden-secrets.js / eden-extras.js). Clients keep working offline; when signed in to
// this server the weather is shared by the room, ladder results are kept per account, and progress follows the
// account across devices.
const STAGES = [0, 0.5, 1];
const GLITCHES = ['sun', 'seams', 'bird'], FOUND = ['backstage', 'road', 'tree'];

export function createWorld({store, save, allow, emit}) {
  store.ladder ||= {};
  const weather = {stage: 0, by: null, at: 0};

  function ladderTop(limit = 10) {
    return Object.entries(store.ladder)
      .map(([id, r]) => ({id, name: store.users[id]?.name, wins: r.wins | 0, losses: r.losses | 0, best: r.best ?? null}))
      .filter(r => r.name && (r.wins || r.losses))
      .sort((a, b) => b.wins - a.wins || (a.best ?? 1e9) - (b.best ?? 1e9) || a.losses - b.losses)
      .slice(0, limit);
  }
  const state = () => ({t: 'world', weather: {...weather}, ladder: ladderTop()});

  // Only the fields the client keeps, with types and sizes checked; unknown keys are dropped.
  function cleanProgress(input) {
    const p = input && typeof input === 'object' ? input : {}, out = {};
    out.glitches = [...new Set((Array.isArray(p.glitches) ? p.glitches : []).filter(g => GLITCHES.includes(g)))];
    out.found = [...new Set((Array.isArray(p.found) ? p.found : []).filter(f => FOUND.includes(f)))];
    for (const key of ['jesterBeaten', 'doorOpened', 'lever', 'toll', 'wraps']) if (p[key] === true) out[key] = true;
    const meters = Number(p.roadMeters);
    if (Number.isFinite(meters) && meters > 0) out.roadMeters = Math.min(1e6, Math.round(meters));
    return out;
  }
  // Progress only ever grows: a stale device cannot erase what another device unlocked.
  function mergeProgress(a = {}, b = {}) {
    const out = cleanProgress(a), next = cleanProgress(b);
    out.glitches = [...new Set([...out.glitches, ...next.glitches])];
    out.found = [...new Set([...out.found, ...next.found])];
    for (const key of ['jesterBeaten', 'doorOpened', 'lever', 'toll', 'wraps']) if (next[key]) out[key] = true;
    out.roadMeters = Math.max(out.roadMeters || 0, next.roadMeters || 0) || undefined;
    if (!out.roadMeters) delete out.roadMeters;
    return out;
  }

  return {
    state,
    // Live message {t:'weather', stage}: anyone signed in with a character may pull the lever, a few times a minute.
    weather(user, message) {
      if (!user?.character) return;
      const stage = Number(message.stage);
      if (!STAGES.includes(stage) || stage === weather.stage) return;
      if (!allow('weather:' + user.id, 4, 30e3)) return;
      Object.assign(weather, {stage, by: user.name, at: Date.now()});
      emit(state());
    },
    // POST /api/social/ladder {result:'win'|'loss'|'decision', seconds}
    ladder(user, body) {
      if (!user?.character) throw Object.assign(new Error('Create a character to join the ladder.'), {status: 401});
      if (!allow('ladder:' + user.id, 1, 20e3)) throw Object.assign(new Error('One bout at a time.'), {status: 429});
      const result = String(body.result || ''), seconds = Number(body.seconds);
      if (!['win', 'loss', 'decision'].includes(result) || !Number.isFinite(seconds) || seconds < 3 || seconds > 130) throw Object.assign(new Error('That bout could not be recorded.'), {status: 400});
      const r = store.ladder[user.id] ||= {wins: 0, losses: 0, best: null};
      if (result === 'loss') r.losses++;
      else { r.wins++; if (result === 'win') r.best = r.best == null ? +seconds.toFixed(1) : Math.min(r.best, +seconds.toFixed(1)); }
      save(); emit(state());
      return {record: {...r}, ladder: ladderTop()};
    },
    // POST /api/social/progress {progress}: merged into the account and returned.
    progress(user, body) {
      if (!user) throw Object.assign(new Error('Sign in to save your progress.'), {status: 401});
      if (!allow('progress:' + user.id, 12, 60e3)) throw Object.assign(new Error('Slow down a little.'), {status: 429});
      user.progress = mergeProgress(user.progress, body.progress);
      save();
      return {progress: user.progress, record: store.ladder[user.id] || null};
    },
    forget(userId) { delete store.ladder[userId]; },
    _test: {cleanProgress, mergeProgress, ladderTop}
  };
}
