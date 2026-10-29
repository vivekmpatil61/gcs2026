import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
assert.match(html, /<div class="vid-lib" id="vidLib" hidden>/, 'student area must be hidden in the public HTML');
assert.ok(!html.includes('id="continueLearning"'), 'the learning prompt must be removed');
const studentStart = html.indexOf('id="vidLib"');
const studentEnd = html.indexOf('</section>', studentStart);
for (const id of ['lessonSearch', 'lessonCompletionFilter', 'lessonResultsCount', 'courseProgressCount', 'libraryCount-young-artists', 'libraryCount-core-studio']) {
  const position = html.indexOf(`id="${id}"`);
  assert.ok(position > studentStart && position < studentEnd, `${id} must remain inside the hidden student area`);
}

class Element {
  constructor() {
    this.style = {}; this.dataset = {}; this.children = []; this.textContent = ''; this.hidden = false; this.listeners = {}; this.value = '';
    const classes = new Set();
    this.classList = { add: x => classes.add(x), remove: (...xs) => xs.forEach(x => classes.delete(x)),
      contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) };
  }
  setAttribute(name, value) { this[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  focus() { document.activeElement = this; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelector(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.descendants()]);
    return descendants.find(child => child.className?.split(' ').includes(selector.slice(1))) || new Element();
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}
const nodes = new Map();
const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
const storage = new Map();
let blockedStorage = false;
let now = 100000;
let configuration;
let loaded = [];
let videoId = 'core0000001', seconds = 0, state = 1;
const player = {
  getVideoUrl: () => `https://www.youtube.com/watch?v=${videoId}`,
  getCurrentTime: () => seconds, getDuration: () => 600, getPlayerState: () => state,
  loadVideoById(id, start) { loaded.push([id, start]); },
  stopVideo() {}, playVideo() {}, isMuted: () => false, getVolume: () => 100,
  getAvailablePlaybackRates: () => [1], getPlaybackRate: () => 1
};
const events = {};
const historyEntries = [null];
let historyIndex = 0;
let deferHistory = false;
let historyEventPending = false;
const dispatchHistory = () => {
  if (deferHistory) { historyEventPending = true; return; }
  events.popstate?.({ state: historyEntries[historyIndex] });
};
const history = {
  get state() { return historyEntries[historyIndex]; },
  pushState(state) { historyEntries.splice(historyIndex + 1); historyEntries.push(state); historyIndex++; },
  replaceState(state) { historyEntries[historyIndex] = state; },
  back() { if (historyIndex > 0) { historyIndex--; dispatchHistory(); } },
  forward() { if (historyIndex < historyEntries.length - 1) { historyIndex++; dispatchHistory(); } }
};
const YT = { Player: function (_id, config) { configuration = config; return player; },
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
const document = {
  getElementById: get, querySelector: get,
  querySelectorAll: selector => selector.includes('.ep-card[data-video-id]') ? get('episodeGrid').children : [],
  createElement: () => new Element(),
  body: { style: {} }, addEventListener: (name, handler) => { events[name] = handler; }
};
const window = { YT, history, addEventListener: (name, handler) => { events[name] = handler; },
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  localStorage: {
    getItem(key) { if (blockedStorage) throw Error('disabled'); return storage.get(key) || null; },
    setItem(key, value) { if (blockedStorage) throw Error('disabled'); storage.set(key, value); }
  }
};
const ctx = vm.createContext({ document, window, YT, URL, URLSearchParams, console,
  Date: { now: () => now }, setTimeout() {}, clearTimeout() {} });
vm.runInContext(readFileSync('gcs-website/assets/site-access.js', 'utf8').split('  /* ── Registration form submission ── */')[0], ctx);
vm.runInContext(readFileSync('gcs-website/assets/site-player.js', 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);
const tutorials = [
  { id: 'core0000001', title: 'Tools', libraries: ['core-studio'] },
  { id: 'core0000002', title: 'Shading', libraries: ['core-studio'] },
  { id: 'young000001', title: 'Simple shapes', libraries: ['young-artists'] }
];
ctx.tutorials = tutorials;
const key = 'gcs:playback:v1:first%40example.test';
function login(email) {
  ctx.loadStudentPlayback(email);
  run("activeAccessToken = 'verified'; completedTutorials = new Set();");
  ctx.renderTutorials(tutorials);
}
function openSelectedLesson() {
  const library = run('activeLibrary') || 'core-studio';
  ctx.selectTutorialLibrary(library);
  const lesson = tutorials.find(item => item.libraries.includes(library));
  ctx.openPlayer(lesson.id);
}
login('first@example.test');
openSelectedLesson();
assert.equal(run('activeLibrary'), 'core-studio');
assert.equal(configuration.videoId, 'core0000001');
configuration.events.onReady({ target: player });
seconds = 125; now += 6000;
ctx.updatePlayerProgress();
ctx.closePlayer(null);
assert.equal(storage.size, 2);
assert.ok([...storage.values()].every(value => !value.includes('verified')), 'tokens must not be stored');

// Fresh sign-in restores the approved account's position in an existing player.
ctx.clearTutorialAccess();
login('FIRST@example.test');
openSelectedLesson();
assert.deepEqual(loaded.at(-1), ['core0000001', 125]);

// An old player's time must not be attributed to a newly selected lesson.
ctx.openPlayer('core0000002');
seconds = 220; now += 6000;
ctx.saveStudentPlayback(true);
assert.equal(JSON.parse(storage.get(key)).videoId, 'core0000001');
videoId = 'core0000002'; seconds = 42;
ctx.saveStudentPlayback(true);
ctx.closePlayer(null);

// Account switching hides the first student's history and restores it only on their sign-in.
ctx.clearTutorialAccess();
login('second@example.test');
assert.equal(ctx.savedPlaybackStart('core0000002'), 0);
ctx.clearTutorialAccess(); login('first@example.test');
assert.equal(ctx.savedPlaybackStart('core0000002'), 42);
ctx.selectTutorialLibrary('young-artists');
openSelectedLesson();
assert.equal(loaded.at(-1)[0], 'young000001');

// Finishing playback does not change the manually maintained completion records.
videoId = 'young000001'; seconds = 600; state = 0;
ctx.saveStudentPlayback(true); ctx.closePlayer(null);
assert.equal(run('completedTutorials.size'), 0);
assert.equal(ctx.savedPlaybackStart('young000001'), 0);
ctx.selectTutorialLibrary('core-studio');
run("completedTutorials = new Set(['core0000001', 'core0000002']);");
ctx.updateProgressDisplay();

// Damaged or denied storage must never prevent access or open a removed/private lesson.
ctx.clearTutorialAccess();
storage.set(key, '{bad json'); login('first@example.test');
assert.equal(ctx.savedPlaybackStart('core0000001'), 0);
storage.set(key, JSON.stringify({ videoId: 'removed0001', library: 'core-studio', seconds: 70, duration: 600, finished: false }));
login('first@example.test');
storage.set(key, JSON.stringify({ videoId: 'core0000001', library: 'core-studio', seconds: -9, duration: 600, finished: false }));
login('first@example.test');
assert.equal(ctx.savedPlaybackStart('core0000001'), 0);
blockedStorage = true;
login('first@example.test');
openSelectedLesson();
videoId = 'core0000001'; seconds = 33; state = 2;
ctx.saveStudentPlayback(true); ctx.closePlayer(null);
assert.equal(ctx.savedPlaybackStart('core0000001'), 33);
blockedStorage = false;

// Public playback follows the current free-preview permissions.
run("PUBLIC_TUTORIALS.set('naUyVYZzo2Y', {title: 'Tools', epNum: 'Free lesson'});");
ctx.openPlayer('naUyVYZzo2Y'); assert.equal(run('currentVideoId'), 'naUyVYZzo2Y');
const before = storage.size;
ctx.saveStudentPlayback(true); assert.equal(storage.size, before);
ctx.closePlayer(null);
run('PUBLIC_TUTORIALS.clear();');
ctx.openPlayer('naUyVYZzo2Y'); assert.equal(run('currentVideoId'), '');

// Hiding the tab persists a paused position even inside the normal write throttle.
login('first@example.test'); openSelectedLesson();
videoId = 'core0000001'; seconds = 177; state = 2;
document.visibilityState = 'hidden'; events.visibilitychange();
assert.equal(JSON.parse(storage.get(key)).seconds, 177);

// A newly created iframe gets the saved start time; switching during initial load uses
// the latest requested lesson instead of replaying the first iframe's stale video.
ctx.closePlayer(null); ctx.clearTutorialAccess();
run('youtubePlayer = null; youtubePlayerReady = false;');
login('first@example.test'); openSelectedLesson();
assert.equal(configuration.playerVars.start, 177);
assert.equal(configuration.videoId, 'core0000001');
ctx.openPlayer('core0000002');
configuration.events.onReady({ target: player });
assert.deepEqual(loaded.at(-1), ['core0000002', 0]);
assert.equal(JSON.parse(storage.get(key)).videoId, 'core0000001');

// Filtering keeps catalogue order/numbering and full-library progress intact.
ctx.closePlayer(null); ctx.clearTutorialAccess(); login('filters@example.test');
ctx.selectTutorialLibrary('core-studio');
assert.equal(get('libraryCount-core-studio').textContent, '2 lessons');
assert.equal(get('libraryCount-young-artists').textContent, '1 lesson');
assert.equal(get('lessonResultsCount').textContent, 'Showing 2 of 2 lessons');
run("completedTutorials = new Set(['core0000001']);"); ctx.updateProgressDisplay();
get('lessonCompletionFilter').value = 'incomplete'; ctx.applyLessonFilters();
const cards = get('episodeGrid').children;
assert.equal(cards[0].hidden, true);
assert.equal(cards[1].hidden, false);
assert.match(cards[1]['aria-label'], /Episode 02/);
assert.equal(get('courseProgressCount').textContent, '1 of 2 complete');
assert.equal(get('lessonFilterIncomplete').textContent, 'Not completed (1)');
assert.equal(get('lessonFilterCompleted').textContent, 'Completed (1)');
get('lessonSearch').value = '  SHADING  '; ctx.applyLessonFilters();
assert.equal(get('lessonResultsCount').textContent, 'Showing 1 of 2 lessons');
assert.equal(get('lessonEmptyState').hidden, true);
get('lessonCompletionFilter').value = 'completed'; ctx.applyLessonFilters();
assert.equal(get('lessonResultsCount').textContent, 'Showing 0 of 2 lessons');
assert.equal(get('lessonEmptyState').hidden, false);
assert.match(get('lessonEmptyState').textContent, /No lessons match/);
assert.equal(get('lessonFiltersReset').hidden, false);
ctx.resetLessonFilters();
assert.equal(document.activeElement, get('lessonSearch'));
assert.equal(get('lessonFiltersReset').hidden, true);
assert.equal(get('lessonResultsCount').textContent, 'Showing 2 of 2 lessons');

// Marking complete inside a filtered view removes the card and preserves a usable focus.
get('lessonCompletionFilter').value = 'incomplete'; ctx.applyLessonFilters();
document.activeElement = cards[1].querySelector('.ep-complete-btn');
run("completedTutorials.add('core0000002');"); ctx.updateProgressDisplay();
assert.equal(cards[1].hidden, true);
assert.equal(document.activeElement, get('lessonSearch'));
assert.equal(get('lessonFilterCompleted').textContent, 'Completed (2)');
assert.equal(get('lessonEmptyState').hidden, false);
get('lessonCompletionFilter').value = 'completed'; ctx.applyLessonFilters();
assert.equal(cards[1].hidden, false);
run("completedTutorials.delete('core0000002');"); ctx.updateProgressDisplay();
assert.equal(cards[1].hidden, true);

// The nested completion button must not also trigger playback from bubbled key events.
let prevented = false;
cards[1].listeners.keydown({ target: cards[1].querySelector('.ep-complete-btn'), key: 'Enter', preventDefault() { prevented = true; } });
assert.equal(prevented, false);
assert.equal(run('currentVideoId'), '');
get('lessonSearch').value = 'Shading';
ctx.selectTutorialLibrary('young-artists');
assert.equal(get('lessonSearch').value, '');
assert.equal(get('lessonCompletionFilter').value, 'all');
assert.equal(get('lessonResultsCount').textContent, 'Showing 1 of 1 lesson');
assert.equal(get('libraryContentTitle').textContent, 'Young Artists Foundations');
ctx.clearTutorialAccess();
assert.equal(get('episodeGrid').children.length, 0);
assert.equal(get('lessonResultsCount').textContent, '');

// Library preferences are restored per approved account, not inferred from playback.
login('preferences@example.test');
assert.equal(run('activeLibrary'), '');
ctx.selectTutorialLibrary('young-artists'); ctx.clearTutorialAccess();
login('other-preferences@example.test');
assert.equal(run('activeLibrary'), '');
ctx.clearTutorialAccess(); login('PREFERENCES@example.test');
assert.equal(run('activeLibrary'), 'young-artists');
assert.equal(get('libraryContent').hidden, false);
ctx.clearTutorialAccess();
const preferenceKey = 'gcs:library:v1:preferences%40example.test';
storage.set(preferenceKey, 'unknown-library'); login('preferences@example.test');
assert.equal(run('activeLibrary'), '');
ctx.clearTutorialAccess();
storage.set(preferenceKey, 'young-artists');
ctx.loadStudentPlayback('preferences@example.test');
run("activeAccessToken = 'verified';");
ctx.renderTutorials(tutorials.filter(item => item.libraries.includes('core-studio')));
assert.equal(run('activeLibrary'), '', 'a saved library must exist in the approved catalogue');
ctx.clearTutorialAccess();
blockedStorage = true; login('preferences@example.test');
ctx.selectTutorialLibrary('young-artists');
assert.equal(run('activeLibrary'), 'young-artists');
ctx.clearTutorialAccess(); blockedStorage = false;

// Previous/next operate on full library order, independently of search filters.
login('navigation@example.test'); ctx.selectTutorialLibrary('core-studio');
get('lessonSearch').value = 'Shading'; ctx.applyLessonFilters();
ctx.openPlayer('core0000002');
assert.equal(get('modalPreviousBtn').disabled, false);
assert.equal(get('modalNextBtn').disabled, true);
const modalHistoryIndex = historyIndex;
ctx.openPreviousTutorial();
assert.equal(run('currentVideoId'), 'core0000001');
assert.equal(get('modalPreviousBtn').disabled, true);
ctx.openPreviousTutorial();
assert.equal(run('currentVideoId'), 'core0000001');
ctx.openNextTutorial();
assert.equal(run('currentVideoId'), 'core0000002');
assert.equal(historyIndex, modalHistoryIndex, 'switching lessons must replace the modal history entry');
history.back();
assert.equal(run('currentVideoId'), '');
assert.equal(get('modalOverlay').classList.contains('open'), false);
assert.equal(get('lessonSearch').value, 'Shading');
history.forward();
assert.equal(run('currentVideoId'), 'core0000002');
ctx.closePlayer(null);
assert.equal(historyIndex, modalHistoryIndex - 1, 'explicit close consumes the modal history entry');

// A rapid reopen waits for the outstanding Back operation, then opens the new lesson.
ctx.openPlayer('core0000001');
deferHistory = true; ctx.closePlayer(null);
assert.equal(historyEventPending, true);
ctx.openPlayer('core0000002');
assert.equal(run('currentVideoId'), '');
deferHistory = false; historyEventPending = false;
events.popstate({ state: history.state });
assert.equal(run('currentVideoId'), 'core0000002');
ctx.closePlayer(null);

// Forward after sign-out cannot reopen a private lesson.
ctx.openPlayer('core0000001'); ctx.clearTutorialAccess();
assert.equal(run('currentVideoId'), '');
history.forward();
assert.equal(run('currentVideoId'), '');
assert.equal(get('vidLib').hidden, true);

// Public lessons get the same first/previous/back behaviour without student access.
run("PUBLIC_TUTORIALS.set('public00001', {title: 'First', epNum: 'Free'}); PUBLIC_TUTORIALS.set('public00002', {title: 'Second', epNum: 'Free'});");
ctx.openPlayer('public00002'); ctx.openPreviousTutorial();
assert.equal(run('currentVideoId'), 'public00001');
assert.equal(get('modalPreviousBtn').disabled, true);
ctx.openNextTutorial();
assert.equal(run('currentVideoId'), 'public00002');
history.back();
assert.equal(run('currentVideoId'), '');
console.log('✓ Playback restore, account isolation, preview permissions, search/filter combinations, counts, completion updates, keyboard focus and library resets verified');
console.log('✓ Remembered library isolation, unavailable storage, previous/next boundaries, Back/Forward, rapid reopen and sign-out history verified');
