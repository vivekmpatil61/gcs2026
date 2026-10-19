import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise real sign-in/progress code with a clock advanced past token expiry.
const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id, {
    style: {}, textContent: '', classList: { add() {}, remove() {}, toggle() {} },
    replaceChildren() {}, scrollIntoView() {}, setAttribute() {}
  });
  return nodes.get(id);
};
let now = 0;
let popup;
let closed = 0;
let renderCount = 0;
let requests = [];
let rejectProgress = false;
let timers = 0;
const library = {
  approved: true, user: { email: 'student@example.test' }, expiresIn: 3000,
  tutorials: [{ id: 'lesson00001', title: 'Test lesson' }], completedVideoIds: []
};
const google = { accounts: { oauth2: {
  initTokenClient(config) { popup = config; return { requestAccessToken() {} }; }, revoke() {}
} } };
const context = vm.createContext({
  document: { getElementById: element, querySelectorAll: () => [] },
  window: { google, setTimeout() { timers++; }, clearTimeout() {} }, google,
  Date: { now: () => now }, URLSearchParams, AbortSignal,
  fetch: async (_url, options) => {
    const params = options.body;
    requests.push(Object.fromEntries(params));
    const progress = params.get('action') === 'student_progress_set';
    return { ok: true, json: async () => progress
      ? rejectProgress ? { approved: false, code: 'google_token_rejected' }
        : { approved: true, completedVideoIds: ['lesson00001'] }
      : library };
  }
});
const source = readFileSync('gcs-website/assets/site-access.js', 'utf8');
vm.runInContext(source.split('  /* ── Registration form submission ── */')[0], context);
context.render = tutorials => { renderCount++; context.tutorials = tutorials; };
context.close = () => { closed++; };
vm.runInContext(`
  renderTutorials = tutorials => {
    render(tutorials);
    authorizedTutorials = new Map(tutorials.map(t => [t.id, t]));
  };
  closePlayer = close;
  updateProgressDisplay = () => {};
`, context);
await context.handleGoogleResponse({ access_token: 'original', expires_in: 3600 });
vm.runInContext("currentVideoId = 'lesson00001'; activeLibrary = 'core-studio';", context);
now = 3100 * 1000;
assert.equal(timers, 0, 'token expiry must not schedule a forced logout');
assert.equal(closed, 0);
assert.equal(vm.runInContext('currentVideoId', context), 'lesson00001');

const saving = context.toggleTutorialProgress('lesson00001');
assert.equal(popup.hint, library.user.email);
await popup.callback({ access_token: 'renewed', expires_in: 3600 });
await saving;
assert.equal(requests.at(-1).accessToken, 'renewed');
assert.equal(requests.at(-1).action, 'student_progress_set');
assert.equal(renderCount, 1, 'renewal must preserve the library selection and player');
assert.equal(closed, 0);
assert.equal(vm.runInContext('activeLibrary', context), 'core-studio');
assert.equal(vm.runInContext('currentVideoId', context), 'lesson00001');

now += 3100 * 1000;
const cancelled = context.toggleTutorialProgress('lesson00001');
popup.error_callback({ type: 'popup_closed' });
await cancelled;
assert.match(element('courseProgressStatus').textContent, /not completed/);
assert.equal(closed, 0);

const beforeWrongAccount = requests.length;
const wrongAccount = context.toggleTutorialProgress('lesson00001');
library.user.email = 'other@example.test';
await popup.callback({ access_token: 'wrong-account' });
await wrongAccount;
assert.equal(requests.length, beforeWrongAccount + 1, 'wrong account must not save progress');
assert.match(element('courseProgressStatus').textContent, /same approved/);
library.user.email = 'student@example.test';

const signingOut = context.toggleTutorialProgress('lesson00001');
context.signOut();
await popup.callback({ access_token: 'late-renewal' });
await signingOut;
assert.equal(vm.runInContext('activeAccessToken', context), '', 'late renewal cannot undo sign-out');

await context.handleGoogleResponse({ access_token: 'new-login', expires_in: 3600 });
rejectProgress = true;
await context.toggleTutorialProgress('lesson00001');
assert.match(element('courseProgressStatus').textContent, /verification expired/);
assert.equal(vm.runInContext('accessTokenExpiresAt', context), 0);
assert.equal(closed, 1, 'server rejection must not close playback');
console.log('✓ Student expiry, progress renewal, cancellation, account mismatch, sign-out race and rejected-token recovery verified');
