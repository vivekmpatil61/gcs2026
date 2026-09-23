  /* ── Google Sign-In ── */
  const GOOGLE_CLIENT_ID = '120662687568-hbekineb2q7eah307s6ug5nlf65neija.apps.googleusercontent.com';
  const SCRIPT_URL       = 'https://script.google.com/macros/s/AKfycbyKiL-qYGP5t-Fg7-IdtNUHsWGtrFJTHHQeDwIocM7iKf3WTDr0ztkrpwpT3Fk9o3andQ/exec';

  const PUBLIC_TUTORIALS = new Map();
  let publicPlayback = false;

  function showEnrolPrompt() {
    document.getElementById('enrolDialog').showModal();
  }

  let googleClient;
  let activeAccessToken = '';
  let accessExpiryTimer;
  let authorizedTutorials = new Map();
  let allTutorials = [];
  let activeLibrary = '';
  let activeLibraryVideoIds = new Set();
  let completedTutorials = new Set();
  let currentVideoId = '';
  let youtubePlayer = null;
  let youtubePlayerReady = false;
  let pendingYoutubeVideoId = '';
  let playerProgressTimer;
  let playerControlsTimer;
  let centerPlaybackFeedbackTimer;
  let tutorialPlaybackActive = false;
  let captionsEnabled = false;
  let lastAudibleVolume = 100;
  let tutorialMuted = false;

  function signInWithGoogle() {
    if (!window.google?.accounts?.oauth2) { showErr("Google sign-in is still loading. Please try again."); return; }
    if (!googleClient) {
      googleClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: handleGoogleResponse,
      });
    }
    googleClient.requestAccessToken();
  }

  async function handleGoogleResponse(tokenResponse) {
    if (tokenResponse.error) {
      showErr('Google sign-in was cancelled. Please try again.');
      return;
    }

    document.getElementById('pwLoading').style.display = 'block';
    document.getElementById('pwErr').style.display = 'none';

    try {
      const checkRes = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ accessToken: tokenResponse.access_token })
      });
      if (!checkRes.ok) throw new Error('Authorization service unavailable');
      const data = await checkRes.json();
      document.getElementById('pwLoading').style.display = 'none';

      if (data.approved && data.user && Array.isArray(data.tutorials)) {
        activeAccessToken = tokenResponse.access_token;
        completedTutorials = new Set(Array.isArray(data.completedVideoIds) ? data.completedVideoIds : []);
        renderTutorials(data.tutorials);
        document.getElementById('vidUserAvatar').src = data.user.picture || '';
        document.getElementById('vidUserEmail').textContent = data.user.email || '';

        document.getElementById('pwWelcome').textContent =
          `Welcome, ${data.user.givenName || 'artist'}! Loading your tutorials...`;
        document.getElementById('pwWelcome').style.display = 'block';

        window.clearTimeout(accessExpiryTimer);
        accessExpiryTimer = window.setTimeout(() => {
          clearTutorialAccess();
          showErr('Your secure session expired. Please sign in again.');
        }, Math.max(60, Number(data.expiresIn) || 3000) * 1000);

        document.getElementById('publicPreview').hidden = true;
        document.getElementById('pwGate').style.display = 'none';
        document.getElementById('vidLib').classList.add('open');
        document.getElementById('videos').scrollIntoView({ behavior: 'smooth' });
      } else {
        activeAccessToken = '';
        showErr('This Google account is not registered. Please contact Vivek at hello@universeofvivek.in.');
      }
    } catch (err) {
      document.getElementById('pwLoading').style.display = 'none';
      showErr('Connection error. Please try again in a moment.');
    }
  }

  function showErr(msg) {
    document.getElementById('pwErr').textContent = msg;
    document.getElementById('pwErr').style.display = 'block';
  }

  function signOut() {
    const tokenToRevoke = activeAccessToken;
    clearTutorialAccess();
    if (tokenToRevoke && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }
  }

  function clearTutorialAccess() {
    window.clearTimeout(accessExpiryTimer);
    activeAccessToken = '';
    authorizedTutorials.clear();
    allTutorials = [];
    activeLibrary = '';
    activeLibraryVideoIds.clear();
    completedTutorials.clear();
    currentVideoId = '';
    document.getElementById('episodeGrid').replaceChildren();
    document.getElementById('libraryContent').hidden = true;
    document.querySelectorAll('.library-choice').forEach(button => button.classList.remove('active'));
    updateProgressDisplay();
    setProgressStatus('');
    closePlayer(null);
    document.getElementById('vidLib').classList.remove('open');
    document.getElementById('publicPreview').hidden = false;
    document.getElementById('pwGate').style.display = 'block';
    document.getElementById('pwWelcome').style.display = 'none';
    document.getElementById('pwErr').style.display = 'none';
    document.getElementById('vidUserAvatar').src = '';
    document.getElementById('vidUserEmail').textContent = '';
  }

  function renderTutorials(tutorials) {
    const grid = document.getElementById('episodeGrid');
    grid.replaceChildren();
    authorizedTutorials = new Map();
    allTutorials = [];
    activeLibrary = '';
    activeLibraryVideoIds = new Set();
    document.getElementById('libraryContent').hidden = true;
    document.querySelectorAll('.library-choice').forEach(button => button.classList.remove('active'));

    tutorials.forEach(tutorial => {
      const videoId = String(tutorial.id || '');
      const title = String(tutorial.title || '');
      const libraries = Array.isArray(tutorial.libraries)
        ? tutorial.libraries.filter(value => value === 'young-artists' || value === 'core-studio')
        : ['core-studio'];
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || !libraries.length) return;

      const normalized = { id: videoId, title, libraries };
      allTutorials.push(normalized);
      authorizedTutorials.set(videoId, { epNum: String(tutorial.number || ''), title });
    });
    updateProgressDisplay();
  }

  function selectTutorialLibrary(library) {
    if (library !== 'young-artists' && library !== 'core-studio') return;
    activeLibrary = library;
    document.querySelectorAll('.library-choice').forEach(button => {
      const active = button.dataset.library === library;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('libraryContent').hidden = false;
    renderTutorialLibrary(allTutorials.filter(tutorial => tutorial.libraries.includes(library)));
  }

  function renderTutorialLibrary(tutorials) {
    const grid = document.getElementById('episodeGrid');
    grid.replaceChildren();
    activeLibraryVideoIds = new Set(tutorials.map(tutorial => tutorial.id));

    tutorials.forEach((tutorial, index) => {
      const videoId = tutorial.id;
      const epNum = `Episode ${String(index + 1).padStart(2, '0')}`;
      const title = tutorial.title;

      authorizedTutorials.set(videoId, { epNum, title });

      const card = document.createElement('div');
      card.className = 'ep-card';
      card.dataset.videoId = videoId;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${epNum}: ${title}`);

      const thumb = document.createElement('div');
      thumb.className = 'ep-thumb';

      const image = document.createElement('img');
      image.className = 'ep-thumb-img';
      image.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg?v=20260923`;
      image.alt = `${epNum} tutorial thumbnail`;
      image.loading = 'lazy';
      image.decoding = 'async';

      const overlay = document.createElement('div');
      overlay.className = 'ep-thumb-overlay';
      overlay.innerHTML = '<div class="ep-play-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg></div>';

      const badge = document.createElement('span');
      badge.className = 'ep-badge';
      badge.textContent = epNum.replace(/^Episode\s*/i, 'EP ');

      const body = document.createElement('div');
      body.className = 'ep-body';
      const number = document.createElement('p');
      number.className = 'ep-num';
      number.textContent = epNum;
      const heading = document.createElement('p');
      heading.className = 'ep-title';
      heading.textContent = title;

      const completeButton = document.createElement('button');
      completeButton.className = 'ep-complete-btn';
      completeButton.type = 'button';
      completeButton.addEventListener('click', event => {
        event.stopPropagation();
        toggleTutorialProgress(videoId);
      });

      body.append(number, heading, completeButton);
      thumb.append(image, overlay, badge);
      card.append(thumb, body);
      card.addEventListener('click', () => openPlayer(videoId));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPlayer(videoId);
        }
      });
      grid.append(card);
    });
    updateProgressDisplay();
  }

  async function toggleTutorialProgress(videoId) {
    if (!activeAccessToken || !authorizedTutorials.has(videoId)) {
      clearTutorialAccess();
      showErr('Please sign in again to update your progress.');
      return;
    }

    const shouldComplete = !completedTutorials.has(videoId);
    setProgressStatus(shouldComplete ? 'Saving lesson as complete...' : 'Updating your progress...');
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          accessToken: activeAccessToken,
          action: 'student_progress_set',
          videoId,
          completed: String(shouldComplete)
        })
      });
      if (!response.ok) throw new Error('progress_update_failed');
      const data = await response.json();
      if (!data.approved || !Array.isArray(data.completedVideoIds)) {
        throw new Error(data.code || 'progress_update_failed');
      }
      completedTutorials = new Set(data.completedVideoIds);
      updateProgressDisplay();
      setProgressStatus(shouldComplete ? 'Lesson completed. Great work!' : 'Lesson returned to your learning list.');
    } catch (error) {
      const message = error.message === 'progress_busy'
        ? 'Another update is in progress. Please try again.'
        : 'Progress could not be saved. Please try again.';
      setProgressStatus(message, true);
    }
  }

  function toggleCurrentTutorialProgress() {
    if (currentVideoId && !publicPlayback) toggleTutorialProgress(currentVideoId);
  }

  function updateProgressDisplay() {
    const total = activeLibraryVideoIds.size;
    const completed = Array.from(completedTutorials).filter(videoId => activeLibraryVideoIds.has(videoId)).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    document.getElementById('courseProgressCount').textContent = `${completed} of ${total} complete`;
    document.getElementById('courseProgressFill').style.width = `${percent}%`;
    const progressTrack = document.getElementById('courseProgressTrack');
    progressTrack.setAttribute('aria-valuenow', String(percent));

    document.querySelectorAll('.ep-card[data-video-id]').forEach(card => {
      const isCompleted = completedTutorials.has(card.dataset.videoId);
      card.classList.toggle('completed', isCompleted);
      const button = card.querySelector('.ep-complete-btn');
      button.classList.toggle('completed', isCompleted);
      button.textContent = isCompleted ? 'Completed - undo' : 'Mark complete';
      button.setAttribute('aria-label', `${isCompleted ? 'Undo completion for' : 'Mark complete'} ${authorizedTutorials.get(card.dataset.videoId).title}`);
    });

    const modalButton = document.getElementById('modalCompleteBtn');
    modalButton.hidden = publicPlayback;
    const modalCompleted = currentVideoId && completedTutorials.has(currentVideoId);
    modalButton.classList.toggle('completed', Boolean(modalCompleted));
    modalButton.textContent = modalCompleted ? 'Completed - undo' : 'Mark as complete';
  }

  function setProgressStatus(message, isError = false) {
    const status = document.getElementById('courseProgressStatus');
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function chooseProgramme(programme) {
    const programmeValues = {
      access: 'Studio Access - Video Library',
      live: 'Studio Live - Video Library, WhatsApp Community and One/Two Live Sessions per Month'
    };
    const preferredFormat = document.getElementById('preferredFormat');
    if (preferredFormat && programmeValues[programme]) {
      preferredFormat.value = programmeValues[programme];
    }
  }

  /* ── Registration form submission ── */
  const registrationForm = document.getElementById('registrationForm');
  const registrationSubmit = document.getElementById('registrationSubmit');
  const registrationStatus = document.getElementById('registrationStatus');
  const registrationIntroBlock = document.getElementById('registrationIntroBlock');
  const registrationConfirmation = document.getElementById('registrationConfirmation');
  const confirmationName = document.getElementById('confirmationName');
  const confirmationSummary = document.getElementById('confirmationSummary');
  const submitAnotherRegistration = document.getElementById('submitAnotherRegistration');
  const registrationVerify = document.getElementById('registrationVerify');
  const registrationIdentity = document.getElementById('registrationIdentity');
  const registrationGoogleSignIn = document.getElementById('registrationGoogleSignIn');
  const registrationChangeAccount = document.getElementById('registrationChangeAccount');
  const registrationAvatar = document.getElementById('registrationAvatar');
  const registrationVerifiedEmail = document.getElementById('registrationVerifiedEmail');
  const emailAddress = document.getElementById('emailAddress');
  let registrationGoogleClient;
  let registrationAccessToken = '';
  let registrationExpiryTimer;
  let submittedRegistration = {};

  registrationGoogleSignIn.addEventListener('click', () => verifyRegistrationEmail());
  registrationChangeAccount.addEventListener('click', () => {
    clearRegistrationIdentity();
    verifyRegistrationEmail();
  });

  function verifyRegistrationEmail() {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      setRegistrationStatus('Google sign-in is still loading. Please try again.', 'error');
      return;
    }
    if (!registrationGoogleClient) {
      registrationGoogleClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: handleRegistrationGoogleResponse
      });
    }
    registrationGoogleSignIn.disabled = true;
    registrationGoogleSignIn.textContent = 'Opening Google...';
    setRegistrationStatus('', '');
    registrationGoogleClient.requestAccessToken({ prompt: 'select_account' });
  }

  async function handleRegistrationGoogleResponse(tokenResponse) {
    registrationGoogleSignIn.disabled = false;
    registrationGoogleSignIn.textContent = 'Verify with Google';
    if (tokenResponse.error || !tokenResponse.access_token) {
      setRegistrationStatus('Google verification was cancelled. Please try again.', 'error');
      return;
    }

    try {
      const data = await registrationRequest('registration_verify', tokenResponse.access_token);
      registrationAccessToken = tokenResponse.access_token;
      emailAddress.value = data.user.email || '';
      registrationVerifiedEmail.textContent = data.user.email || '';
      registrationAvatar.src = data.user.picture || '';
      registrationVerify.hidden = true;
      registrationIdentity.hidden = false;
      registrationSubmit.disabled = false;
      registrationSubmit.textContent = 'Send registration';
      setRegistrationStatus('Email verified. You can now submit the registration.', 'success');

      window.clearTimeout(registrationExpiryTimer);
      registrationExpiryTimer = window.setTimeout(() => {
        clearRegistrationIdentity();
        setRegistrationStatus('Your verification expired. Please verify with Google again.', 'error');
      }, Math.max(60, Number(data.expiresIn) || 3000) * 1000);
    } catch (error) {
      clearRegistrationIdentity();
      setRegistrationStatus(error.message, 'error');
    }
  }

  async function registrationRequest(action, token, details) {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(Object.assign({
        action: action,
        accessToken: token
      }, details || {}))
    });
    if (!response.ok) throw new Error('The registration service is unavailable. Please try again.');
    const data = await response.json();
    if (!data.approved || !data.registration) {
      const error = new Error(registrationMessageForCode(data.code));
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function clearRegistrationIdentity() {
    window.clearTimeout(registrationExpiryTimer);
    registrationAccessToken = '';
    emailAddress.value = '';
    registrationVerifiedEmail.textContent = '';
    registrationAvatar.src = '';
    registrationIdentity.hidden = true;
    registrationVerify.hidden = false;
    registrationSubmit.disabled = true;
    registrationSubmit.textContent = 'Verify with Google to submit';
  }

  registrationForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!registrationAccessToken || !emailAddress.value) {
      setRegistrationStatus('Verify your email with Google before submitting.', 'error');
      return;
    }

    const participantName = document.getElementById('participantName').value.trim();
    const preferredFormat = document.getElementById('preferredFormat');
    submittedRegistration = {
      name: participantName.split(/\s+/)[0] || 'artist',
      programme: preferredFormat.options[preferredFormat.selectedIndex].text
    };
    registrationSubmit.disabled = true;
    registrationSubmit.textContent = 'Sending...';
    setRegistrationStatus('', '');

    const subjects = Array.from(document.querySelectorAll('#subjectOptions input:checked'))
      .map(input => input.value);
    const details = {
      participantName: participantName,
      age: document.getElementById('participantAge').value,
      guardianName: Number(document.getElementById('participantAge').value) < 18 ? document.getElementById('guardianName').value.trim() : '',
      whatsapp: document.getElementById('whatsappNumber').value.trim(),
      location: document.getElementById('location').value.trim(),
      programme: preferredFormat.value,
      experience: document.getElementById('experience').value,
      subjects: JSON.stringify(subjects),
      requests: [document.getElementById('experience').selectedOptions[0]?.dataset.returning === 'true' ? 'Returning to drawing after a break.' : '', document.getElementById('specialRequests').value.trim()].filter(Boolean).join('\n'),
      consentFees: String(document.getElementById('consentFees').checked),
      consentAccuracy: String(document.getElementById('consentAccuracy').checked),
      consentContentUse: String(document.getElementById('consentContentUse').checked),
      contentUseAgreementVersion: 'GCS-CONTENT-USE-2026-08-06-v2'
    };

    try {
      await registrationRequest('registration_submit', registrationAccessToken, details);
      const verifiedEmail = emailAddress.value;
      registrationForm.reset();
      emailAddress.value = verifiedEmail;
      registrationSubmit.disabled = false;
      registrationSubmit.textContent = 'Send registration';
      setRegistrationStatus('', '');
      confirmationName.textContent = submittedRegistration.name || 'artist';
      confirmationSummary.textContent = `Your interest in ${submittedRegistration.programme || 'the studio'} has been recorded. Vivek will review your details and contact you personally at the verified email address.`;
      registrationForm.hidden = true;
      registrationIntroBlock.hidden = true;
      registrationConfirmation.hidden = false;
      registrationConfirmation.focus({ preventScroll: true });
      registrationConfirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (['google_token_rejected', 'authorization_failed', 'unverified_email'].includes(error.code)) {
        clearRegistrationIdentity();
      } else {
        registrationSubmit.disabled = false;
        registrationSubmit.textContent = 'Send registration';
      }
      setRegistrationStatus(error.message, 'error');
    }
  });

  function setRegistrationStatus(message, type) {
    registrationStatus.textContent = message || '';
    registrationStatus.className = `registration-status${type ? ` ${type}` : ''}`;
  }

  function registrationMessageForCode(code) {
    const messages = {
      google_token_rejected: 'Google could not verify this session. Please verify your email again.',
      wrong_token_audience: 'This Google verification was not issued for the studio website.',
      google_email_unverified: 'Choose a Google account with a verified email address.',
      unverified_email: 'Choose a Google account with a verified email address.',
      registration_invalid_fields: 'Please check the required fields and submit again.',
      registration_duplicate: 'A registration for this participant was already received from this email in the last 24 hours.',
      registration_rate_limited: 'This account has submitted several registrations recently. Please wait one hour or email Vivek directly.',
      registration_list_busy: 'Another registration is being saved. Please try again in a moment.',
      registration_sheet_invalid: 'The studio registration sheet needs attention. Please email Vivek directly.',
      registration_submit_failed: 'The registration could not be saved. Please try again or email Vivek directly.'
    };
    return messages[code] || 'Google verification failed. Please try again.';
  }

  submitAnotherRegistration.addEventListener('click', () => {
    submittedRegistration = {};
    registrationConfirmation.hidden = true;
    registrationIntroBlock.hidden = false;
    registrationForm.hidden = false;
    if (!registrationAccessToken) clearRegistrationIdentity();
    document.getElementById('participantName').focus();
  });


  async function loadPublicPreviews() {
    const status = document.getElementById('previewStatus');
    const retry = document.getElementById('previewRetry');
    const grid = document.getElementById('publicPreviewGrid');
    status.textContent = 'Loading free lessons…';
    retry.hidden = true;
    grid.replaceChildren();
    PUBLIC_TUTORIALS.clear();
    try {
      const local = ['localhost', '127.0.0.1'].includes(location.hostname);
      const response = await fetch(local ? '/gcs-website/assets/preview-demo.json' : SCRIPT_URL,
        local ? { cache: 'no-store' } : { method: 'POST',
          body: new URLSearchParams({ action: 'public_previews' }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Preview service unavailable');
      const data = await response.json();
      if (!Array.isArray(data.previews)) throw new Error('Preview service unavailable');
      data.previews.forEach(preview => {
        const free = preview.visibility === 'free';
        if (!['free', 'teaser'].includes(preview.visibility) || !preview.title ||
            !/^https:\/\/img\.youtube\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/.test(preview.thumbnail) ||
            (free && !/^[A-Za-z0-9_-]{11}$/.test(preview.id))) return;
        if (free) PUBLIC_TUTORIALS.set(preview.id, { title: preview.title, epNum: `${preview.label} · Free lesson` });
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ep-card preview-card';
        card.setAttribute('aria-label', `${free ? 'Watch free lesson' : 'Members only'}: ${preview.title}`);
        card.innerHTML = `<span class="ep-thumb"><img class="ep-thumb-img" alt="" loading="lazy" decoding="async"><span class="ep-thumb-overlay"><span class="ep-play-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${free ? 'M8 5v14l11-7z' : 'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8H4v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z'}"/></svg></span></span><span class="ep-badge"></span></span><span class="ep-body"><span class="ep-num"></span><span class="ep-title"></span><span class="ep-dur"></span></span>`;
        card.querySelector('img').src = `${preview.thumbnail}?v=20260923`;
        card.querySelector('.ep-badge').textContent = free ? 'Free lesson' : 'Members only';
        card.querySelector('.ep-num').textContent = preview.label;
        card.querySelector('.ep-title').textContent = preview.title;
        card.querySelector('.ep-dur').textContent = free ? 'Watch the full lesson, no sign-in needed.' : 'Enrol to unlock this lesson and the full library.';
        card.addEventListener('click', () => free ? openPlayer(preview.id) : showEnrolPrompt());
        grid.append(card);
      });
      status.textContent = grid.children.length ? '' : 'New previews are being prepared. Please check back soon.';
    } catch (error) {
      status.textContent = 'Free lessons could not be loaded. Please try again.';
      retry.hidden = false;
    }
  }
  document.getElementById('previewRetry').addEventListener('click', loadPublicPreviews);
  loadPublicPreviews();

  function syncGuardianField() {
    const ageValue = document.getElementById('participantAge').value;
    const required = ageValue !== '' && Number(ageValue) < 18;
    const forChild = document.getElementById('learnerType').value === 'child';
    document.getElementById('guardianField').hidden = !required && !(forChild && ageValue === '');
    document.getElementById('guardianName').required = required;
    document.getElementById('guardianName').disabled = ageValue !== '' && !required;
    document.getElementById('guardianRequired').hidden = !required;
    document.getElementById('guardianHint').textContent = 'Required for participants under 18.';
    document.querySelector('label[for="participantName"]').innerHTML = (forChild ? 'Learner’s full name' : 'Your full name') + ' <span class="required-mark">*</span>';
    document.querySelector('label[for="participantAge"]').innerHTML = (forChild ? 'Learner’s age' : 'Your age') + ' <span class="required-mark">*</span>';
  }
  document.getElementById('participantAge').addEventListener('input', syncGuardianField);
  document.getElementById('learnerType').addEventListener('change', syncGuardianField);
  registrationForm.addEventListener('reset', () => setTimeout(syncGuardianField, 0));
  syncGuardianField();
