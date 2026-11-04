import {defaults, validSettings, signature, plan, dayKey} from './model.js';

const feelings = ['good', 'hard', 'pain'];
const timedPhases = ['up', 'down', 'hold', 'rest'];
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  validDate(value + 'T12:00:00') && dayKey(new Date(value + 'T12:00:00')) === value;
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function checkedSettings(value) {
  if (!value || typeof value !== 'object') throw Error('Upplägget saknas i filen.');
  const settings = validSettings(value);
  if (Object.keys(defaults).some(key => value[key] !== settings[key])) {
    throw Error('Filen innehåller ett upplägg som inte stöds.');
  }
  return settings;
}

export function checkedRecord(value, pending = false) {
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 200 ||
      !validDate(value.at) || !validDay(value.day) ||
      (!pending && !feelings.includes(value.feel)) ||
      (value.next != null && !feelings.includes(value.next)) ||
      (value.durationMs !== undefined && !nonnegative(value.durationMs))) {
    throw Error('Filen innehåller ett pass som inte kan läsas.');
  }
  const settings = checkedSettings(value.settings);
  return {id: value.id, at: value.at, day: value.day, settings, signature: signature(settings),
    ...(pending ? {} : {feel: value.feel}), next: value.next ?? null,
    ...(value.durationMs === undefined ? {} : {durationMs: value.durationMs})};
}

export function parseBackup(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw Error('Filen är inte en giltig JSON-säkerhetskopia.'); }
  if (!value || value.version !== 1 || !Array.isArray(value.history) || value.history.length > 10000) {
    throw Error('Välj en historikfil exporterad från Rehab-appen (version 1).');
  }
  return {version: 1, settings: checkedSettings(value.settings), history: value.history.map(x => checkedRecord(x))};
}

// Existing answers win; a backup may fill in a previously unanswered follow-up.
export function mergeHistory(existing, incoming) {
  const history = existing.map(record => ({...record}));
  const byId = new Map(history.map(record => [record.id, record]));
  const byDate = new Map(history.map(record => [record.at + '|' + record.day, record]));
  let added = 0, duplicates = 0, updated = 0;
  for (const record of incoming) {
    const date = record.at + '|' + record.day;
    const match = byId.get(record.id) || byDate.get(date);
    if (match) {
      duplicates++;
      if (!match.next && record.next) { match.next = record.next; updated++; }
      if (match.durationMs === undefined && record.durationMs !== undefined) match.durationMs = record.durationMs;
    } else {
      const addedRecord = {...record};
      history.push(addedRecord);byId.set(record.id, addedRecord);byDate.set(date, addedRecord);added++;
    }
  }
  history.sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at));
  return {history, added, duplicates, updated};
}

export function restoreDraft(text) {
  const value = JSON.parse(text);
  if (!value || value.version !== 1) throw Error('Okänt passformat.');
  if (value.completed) return {completed: checkedRecord(value.completed, true)};
  const raw = value.session;
  if (!raw || !validDate(raw.started) || !nonnegative(value.elapsedMs)) throw Error('Passet kunde inte läsas.');
  const settings = checkedSettings(raw.settings), steps = plan(settings);
  if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= steps.length ||
      !Number.isInteger(raw.rep) || raw.rep < 1 || raw.rep > settings.reps) throw Error('Felaktig passposition.');
  const step = steps[raw.index];
  const phases = ['ready', 'done', 'rest', ...(step.kind === 'heel' ? ['up', 'down'] : step.kind === 'stretch' ? ['hold'] : ['manual'])];
  if (!phases.includes(raw.phase)) throw Error('Felaktig passfas.');
  if (timedPhases.includes(raw.phase)) {
    const expected = raw.phase === 'up' ? 1 : raw.phase === 'down' ? settings.lower : raw.phase === 'hold' ? settings.stretch : settings.rest;
    if (value.duration !== expected || !nonnegative(value.remaining) || value.remaining > expected * 1000) throw Error('Felaktig timer.');
  }
  return {session: {settings, steps, index: raw.index, rep: raw.rep, phase: raw.phase, started: raw.started},
    remaining: value.remaining ?? 0, duration: value.duration ?? 0, elapsedMs: value.elapsedMs};
}

export function estimatedSeconds(settings) {
  const steps = plan(settings);
  return steps.reduce((total, step, index) => total +
    (step.kind === 'stretch' ? step.seconds : step.kind === 'heel' ? step.reps * (1 + step.lower) : 0) +
    (index > 0 && steps[index - 1].ei === step.ei && steps[index - 1].set !== step.set ? settings.rest : 0), 0);
}

export function formatDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000), minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min${seconds % 60 ? ` ${seconds % 60} s` : ''}` : `${seconds} s`;
}
