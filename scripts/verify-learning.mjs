import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class Element {
  constructor() {
    this.style = {}; this.dataset = {}; this.children = []; this.textContent = ''; this.hidden = false;
    const classes = new Set();
    this.classList = { add: x => classes.add(x), remove: (...xs) => xs.forEach(x => classes.delete(x)),
      contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) };
  }
  setAttribute(name, value) { this[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener() {}
  focus() {}
  querySelector() { return new Element(); }
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
const YT = { Player: function (_id, config) { configuration = config; return player; },
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
const document = {
  getElementById: get, querySelector: get, querySelectorAll: () => [], createElement: () => new Element(),
  body: { style: {} }, addEventListener: (name, handler) => { events[name] = handler; }
};
const window = { YT, addEventListener: (name, handler) => { events[name] = handler; },
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
function login(email) {
  ctx.loadStudentPlayback(email);
  run("activeAccessToken = 'verified'; completedTutorials = new Set();");
  ctx.renderTutorials(tutorials);
}
login('first@example.test');
assert.equal(get('continueLearning').hidden, false);
assert.equal(get('continueLearningButton').textContent, 'Start your first lesson');
ctx.continueStudentLearning();
assert.equal(run('activeLibrary'), 'core-studio');
assert.equal(configuration.videoId, 'core0000001');
configuration.events.onReady({ target: player });
seconds = 125; now += 6000;
ctx.updatePlayerProgress();
ctx.closePlayer(null);
assert.equal(get('continueLearningButton').textContent, 'Resume lesson');
assert.match(get('continueLearningNote').textContent, /2:05/);
assert.equal(storage.size, 1);
assert.ok(![...storage.values()][0].includes('verified'), 'tokens must not be stored');

// Fresh sign-in restores the approved account's position in an existing player.
ctx.clearTutorialAccess();
assert.equal(get('continueLearning').hidden, true);
assert.equal(get('continueLearningLesson').textContent, '');
login('FIRST@example.test');
ctx.continueStudentLearning();
assert.deepEqual(loaded.at(-1), ['core0000001', 125]);

// An old player's time must not be attributed to a newly selected lesson.
ctx.openPlayer('core0000002');
seconds = 220; now += 6000;
ctx.saveStudentPlayback(true);
assert.equal(JSON.parse([...storage.values()][0]).videoId, 'core0000001');
videoId = 'core0000002'; seconds = 42;
ctx.saveStudentPlayback(true);
ctx.closePlayer(null);
assert.match(get('continueLearningLesson').textContent, /Shading/);
assert.match(get('continueLearningNote').textContent, /0:42/);

// Account switching hides the first student's history and restores it only on their sign-in.
ctx.clearTutorialAccess();
login('second@example.test');
assert.equal(get('continueLearningButton').textContent, 'Start your first lesson');
ctx.clearTutorialAccess(); login('first@example.test');
assert.match(get('continueLearningNote').textContent, /0:42/);
ctx.selectTutorialLibrary('young-artists');
assert.match(get('continueLearningLesson').textContent, /Simple shapes/);
ctx.continueStudentLearning();
assert.equal(loaded.at(-1)[0], 'young000001');

// Finished lessons propose another incomplete lesson, without changing completion records.
videoId = 'young000001'; seconds = 600; state = 0;
ctx.saveStudentPlayback(true); ctx.closePlayer(null);
assert.equal(run('completedTutorials.size'), 0);
ctx.selectTutorialLibrary('core-studio');
assert.match(get('continueLearningLesson').textContent, /Tools/);
run("completedTutorials = new Set(['core0000001', 'core0000002']);");
ctx.updateProgressDisplay();
assert.equal(get('continueLearningTitle').textContent, 'Revisit a lesson');

// Damaged or denied storage must never prevent access or open a removed/private lesson.
ctx.clearTutorialAccess();
const key = 'gcs:playback:v1:first%40example.test';
storage.set(key, '{bad json'); login('first@example.test');
assert.equal(get('continueLearningButton').textContent, 'Start your first lesson');
storage.set(key, JSON.stringify({ videoId: 'removed0001', library: 'core-studio', seconds: 70, duration: 600, finished: false }));
login('first@example.test');
assert.match(get('continueLearningLesson').textContent, /Tools/);
storage.set(key, JSON.stringify({ videoId: 'core0000001', library: 'core-studio', seconds: -9, duration: 600, finished: false }));
login('first@example.test');
assert.equal(ctx.savedPlaybackStart('core0000001'), 0);
blockedStorage = true;
login('first@example.test');
ctx.continueStudentLearning();
videoId = 'core0000001'; seconds = 33; state = 2;
ctx.saveStudentPlayback(true); ctx.closePlayer(null);
assert.match(get('continueLearningNote').textContent, /0:33/);
blockedStorage = false;

// The public starting point follows the current public-preview permissions.
run("PUBLIC_TUTORIALS.set(BEGINNER_LESSON_ID, {title: 'Tools', epNum: 'Free lesson'});");
ctx.updateBeginnerStart(); assert.equal(get('beginnerStart').hidden, false);
ctx.openBeginnerLesson(); assert.equal(run('currentVideoId'), 'naUyVYZzo2Y');
const before = storage.size;
ctx.saveStudentPlayback(true); assert.equal(storage.size, before);
ctx.closePlayer(null);
run('PUBLIC_TUTORIALS.clear();');
ctx.updateBeginnerStart(); assert.equal(get('beginnerStart').hidden, true);
ctx.openBeginnerLesson(); assert.equal(run('currentVideoId'), '');

// Hiding the tab persists a paused position even inside the normal write throttle.
login('first@example.test'); ctx.continueStudentLearning();
videoId = 'core0000001'; seconds = 177; state = 2;
document.visibilityState = 'hidden'; events.visibilitychange();
assert.equal(JSON.parse(storage.get(key)).seconds, 177);

// A newly created iframe gets the saved start time; switching during initial load uses
// the latest requested lesson instead of replaying the first iframe's stale video.
ctx.closePlayer(null); ctx.clearTutorialAccess();
run('youtubePlayer = null; youtubePlayerReady = false;');
login('first@example.test'); ctx.continueStudentLearning();
assert.equal(configuration.playerVars.start, 177);
assert.equal(configuration.videoId, 'core0000001');
ctx.openPlayer('core0000002');
configuration.events.onReady({ target: player });
assert.deepEqual(loaded.at(-1), ['core0000002', 0]);
assert.equal(JSON.parse(storage.get(key)).videoId, 'core0000001');
console.log('✓ First lesson, playback restore, video-switch race, account isolation, library selection, finished lessons, storage failure and preview permissions verified');
