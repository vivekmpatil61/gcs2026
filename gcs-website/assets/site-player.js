  let playerReturnFocus = null;
  let playerLoadTimer;
  function setPlayerStatus(message, retry = false) {
    document.getElementById('playerStatus').textContent = message;
    document.getElementById('playerRetry').hidden = !retry;
  }
  function retryTutorialVideo() {
    const id = currentVideoId;
    if (!id) return;
    if (youtubePlayer) youtubePlayer.destroy();
    youtubePlayer = null;
    youtubePlayerReady = false;
    loadTutorialVideo(id);
  }
  /* ── Active nav ── */
  const secs = document.querySelectorAll('section[id]');
  const navAs = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll', () => {
    let c = '';
    secs.forEach(s => { if(window.scrollY >= s.offsetTop - 80) c = s.id; });
    navAs.forEach(a => { a.style.color = a.getAttribute('href')==='#'+c ? '#F4C948' : ''; });
  });

  /* ── Modal player ── */
  function openPlayer(videoId) {
    const studentTutorial = activeAccessToken && authorizedTutorials.get(videoId);
    const tutorial = studentTutorial || PUBLIC_TUTORIALS.get(videoId);
    if (!tutorial) {
      clearTutorialAccess();
      showErr('Please sign in again to watch this tutorial.');
      return;
    }
    if (!currentVideoId) playerReturnFocus = document.activeElement;
    publicPlayback = !studentTutorial;
    currentVideoId = videoId;
    pendingYoutubeVideoId = videoId;
    document.getElementById('modalEp').textContent = tutorial.epNum;
    document.getElementById('modalTitle').textContent = tutorial.title;
    const modalOverlay = document.getElementById('modalOverlay');
    modalOverlay.classList.add('open');
    modalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('#main-content > :not(#modalOverlay), body > nav, body > footer').forEach(element => { element.inert = true; });
    document.querySelector('.modal-close').focus();
    resetCustomPlayerControls();
    loadTutorialVideo(videoId);
    updateProgressDisplay();
    updateModalNextButton();
  }

  function openNextTutorial() {
    if (publicPlayback) {
      const ids = Array.from(PUBLIC_TUTORIALS.keys());
      const next = ids[ids.indexOf(currentVideoId) + 1];
      if (next) openPlayer(next);
      else { closePlayer(null); showEnrolPrompt(); }
      return;
    }
    const libraryTutorials = allTutorials.filter(tutorial => tutorial.libraries.includes(activeLibrary));
    const currentIndex = libraryTutorials.findIndex(tutorial => tutorial.id === currentVideoId);
    const nextTutorial = libraryTutorials[currentIndex + 1];
    if (nextTutorial) openPlayer(nextTutorial.id);
  }

  function updateModalNextButton() {
    const button = document.getElementById('modalNextBtn');
    if (!button) return;
    if (publicPlayback) {
      button.disabled = false;
      const ids = Array.from(PUBLIC_TUTORIALS.keys());
      button.textContent = currentVideoId === ids[ids.length - 1] ? 'Unlock the full library →' : 'Next free lesson →';
      return;
    }
    const libraryTutorials = allTutorials.filter(tutorial => tutorial.libraries.includes(activeLibrary));
    const currentIndex = libraryTutorials.findIndex(tutorial => tutorial.id === currentVideoId);
    const hasNext = currentIndex >= 0 && currentIndex < libraryTutorials.length - 1;
    button.disabled = !hasNext;
    button.textContent = hasNext ? 'Next tutorial →' : 'Last tutorial';
  }

  function loadTutorialVideo(videoId) {
    setPlayerStatus('Loading lesson…');
    clearTimeout(playerLoadTimer);
    playerLoadTimer = setTimeout(() => setPlayerStatus('The lesson is taking longer to load. Check your connection and try again.', true), 15000);
    if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.loadVideoById === 'function') {
      captionsEnabled = false;
      if (typeof youtubePlayer.unloadModule === 'function') youtubePlayer.unloadModule('captions');
      youtubePlayer.loadVideoById(videoId);
      startPlayerProgressTimer();
      window.setTimeout(populatePlaybackRates, 500);
      window.setTimeout(syncCaptionsWithPlayer, 800);
      return;
    }

    if (!(window.YT && typeof window.YT.Player === 'function')) {
      const started = Date.now();
      const check = () => {
        if (currentVideoId !== videoId) return;
        if (window.YT && typeof window.YT.Player === 'function') loadTutorialVideo(videoId);
        else if (Date.now() - started < 15000) setTimeout(check, 250);
      };
      setTimeout(check, 250);
      return;
    }

    if (youtubePlayer) return;

    youtubePlayer = new YT.Player('modalIframe', {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: event => {
          youtubePlayerReady = true;
          if (!currentVideoId) { event.target.stopVideo(); return; }
          clearTimeout(playerLoadTimer);
          setPlayerStatus('');
          tutorialMuted = event.target.isMuted() || event.target.getVolume() === 0;
          if (event.target.getVolume() > 0) lastAudibleVolume = event.target.getVolume();
          const requestedVideoId = pendingYoutubeVideoId;
          if (requestedVideoId && requestedVideoId !== videoId) {
            event.target.loadVideoById(requestedVideoId);
          } else {
            event.target.playVideo();
          }
          startPlayerProgressTimer();
          updateCustomPlayerState();
          window.setTimeout(populatePlaybackRates, 500);
          window.setTimeout(syncCaptionsWithPlayer, 800);
        },
        onError: () => {
          clearTimeout(playerLoadTimer);
          setPlayerStatus('This lesson could not play. It may be unavailable or blocked by your connection. Please try again.', true);
        },
        onStateChange: event => {
          if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.CUED) {
            clearTimeout(playerLoadTimer);
            setPlayerStatus('');
          }
          updateCustomPlayerState();
          if (event.data === YT.PlayerState.PLAYING) {
            populatePlaybackRates();
            window.setTimeout(syncCaptionsWithPlayer, 250);
          }
        },
        onPlaybackRateChange: syncPlaybackRateControl,
        onApiChange: syncCaptionsWithPlayer,
      }
    });
  }

  function toggleTutorialPlayback() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const isPlaying = tutorialPlaybackActive
      || youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
    const shouldPlay = !isPlaying;
    tutorialPlaybackActive = shouldPlay;
    if (shouldPlay) {
      youtubePlayer.playVideo();
    } else {
      youtubePlayer.pauseVideo();
    }
    updatePlaybackButton(shouldPlay);
    showCenterPlaybackFeedback(shouldPlay);
    showPlayerControls(shouldPlay);
  }

  function updatePlaybackButton(isPlaying) {
    const button = document.getElementById('modalPlayBtn');
    if (!button) return;
    button.textContent = isPlaying ? '❚❚' : '▶';
    button.setAttribute('aria-label', isPlaying ? 'Pause video' : 'Play video');
  }

  function showCenterPlaybackFeedback(isPlaying) {
    const feedback = document.getElementById('modalCenterPlayFeedback');
    if (!feedback) return;
    window.clearTimeout(centerPlaybackFeedbackTimer);
    feedback.textContent = isPlaying ? '❚❚' : '▶';
    feedback.classList.add('is-visible');
    feedback.classList.toggle('is-feedback', isPlaying);
    if (isPlaying) {
      centerPlaybackFeedbackTimer = window.setTimeout(() => {
        feedback.classList.remove('is-visible', 'is-feedback');
      }, 650);
    }
  }

  function syncCenterPlaybackIndicator(isPlaying) {
    const feedback = document.getElementById('modalCenterPlayFeedback');
    if (!feedback) return;
    if (isPlaying) {
      if (!feedback.classList.contains('is-feedback')) feedback.classList.remove('is-visible');
      return;
    }
    window.clearTimeout(centerPlaybackFeedbackTimer);
    feedback.textContent = '▶';
    feedback.classList.remove('is-feedback');
    feedback.classList.add('is-visible');
  }

  function seekTutorialVideo(percent) {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const duration = Number(youtubePlayer.getDuration()) || 0;
    if (duration > 0) {
      const targetTime = duration * Number(percent) / 100;
      youtubePlayer.seekTo(targetTime, true);
      const time = document.getElementById('modalPlayerTime');
      if (time) time.textContent = `${formatPlayerTime(targetTime)} / ${formatPlayerTime(duration)}`;
    }
  }

  function toggleTutorialMute() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const shouldMute = !tutorialMuted;

    // Keep the visible state tied to the user's tap. YouTube's mobile API can
    // briefly return its previous mute state after mute/unmute is requested.
    tutorialMuted = shouldMute;
    updateMuteButton(shouldMute);
    if (shouldMute) {
      const currentVolume = Number(youtubePlayer.getVolume()) || 0;
      if (currentVolume > 0) lastAudibleVolume = currentVolume;
      youtubePlayer.mute();
      updateVolumeSlider(0);
    } else {
      const restoredVolume = lastAudibleVolume > 0 ? lastAudibleVolume : 100;
      youtubePlayer.setVolume(restoredVolume);
      youtubePlayer.unMute();
      updateVolumeSlider(restoredVolume);
    }
    showPlayerControls();
  }

  function setTutorialVolume(value) {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const volume = Math.max(0, Math.min(100, Number(value) || 0));
    youtubePlayer.setVolume(volume);
    if (volume > 0) {
      lastAudibleVolume = volume;
      tutorialMuted = false;
      youtubePlayer.unMute();
      updateMuteButton(false);
    } else {
      tutorialMuted = true;
      youtubePlayer.mute();
      updateMuteButton(true);
    }
    updateVolumeSlider(volume);
    showPlayerControls();
  }

  function updateVolumeSlider(volume) {
    const slider = document.getElementById('modalVolumeSlider');
    if (slider) slider.value = String(Math.max(0, Math.min(100, Number(volume) || 0)));
  }

  function toggleTutorialCaptions() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    if (captionsEnabled) {
      if (typeof youtubePlayer.unloadModule === 'function') youtubePlayer.unloadModule('captions');
      captionsEnabled = false;
      updateCaptionsButton();
      return;
    }

    if (typeof youtubePlayer.loadModule !== 'function') return;
    youtubePlayer.loadModule('captions');
    captionsEnabled = true;
    updateCaptionsButton();
    window.setTimeout(() => {
      const options = typeof youtubePlayer.getOptions === 'function' ? youtubePlayer.getOptions() : [];
      if (!Array.isArray(options) || options.indexOf('captions') === -1) {
        captionsEnabled = false;
        const button = document.getElementById('modalCaptionsBtn');
        if (button) {
          button.textContent = 'CC';
          button.classList.remove('is-active');
          button.disabled = true;
          button.title = 'Subtitles are not available for this video';
          button.setAttribute('aria-label', 'Subtitles are not available for this video');
          button.setAttribute('aria-pressed', 'false');
        }
      } else {
        syncCaptionsWithPlayer();
      }
    }, 600);
  }

  function syncCaptionsWithPlayer() {
    if (!youtubePlayerReady || !youtubePlayer
        || typeof youtubePlayer.getOptions !== 'function'
        || typeof youtubePlayer.getOption !== 'function') return;
    try {
      const options = youtubePlayer.getOptions();
      if (!Array.isArray(options) || options.indexOf('captions') === -1) return;
      const track = youtubePlayer.getOption('captions', 'track');
      captionsEnabled = Boolean(
        track && typeof track === 'object'
        && (track.languageCode || track.name || Object.keys(track).length)
      );
      updateCaptionsButton();
    } catch (error) {
      // The captions module can be briefly unavailable while a video loads.
    }
  }

  function updateCaptionsButton() {
    const button = document.getElementById('modalCaptionsBtn');
    if (!button) return;
    button.textContent = 'CC';
    button.disabled = false;
    button.classList.toggle('is-active', captionsEnabled);
    button.title = captionsEnabled ? 'Subtitles on' : 'Subtitles off';
    button.setAttribute('aria-label', captionsEnabled ? 'Turn subtitles off' : 'Turn subtitles on');
    button.setAttribute('aria-pressed', captionsEnabled ? 'true' : 'false');
  }

  function populatePlaybackRates() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const select = document.getElementById('modalPlayerSpeed');
    if (!select || typeof youtubePlayer.getAvailablePlaybackRates !== 'function') return;
    const rates = youtubePlayer.getAvailablePlaybackRates();
    if (!Array.isArray(rates) || !rates.length) return;

    const currentRate = Number(youtubePlayer.getPlaybackRate()) || 1;
    select.replaceChildren();
    rates.forEach(rate => {
      const option = document.createElement('option');
      option.value = String(rate);
      option.textContent = `${rate}×`;
      select.appendChild(option);
    });
    select.value = String(currentRate);
  }

  function setTutorialPlaybackRate(rate) {
    if (!youtubePlayerReady || !youtubePlayer || typeof youtubePlayer.setPlaybackRate !== 'function') return;
    youtubePlayer.setPlaybackRate(Number(rate));
  }

  function syncPlaybackRateControl() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const select = document.getElementById('modalPlayerSpeed');
    if (select) select.value = String(youtubePlayer.getPlaybackRate() || 1);
  }

  function updateCustomPlayerState() {
    const playButton = document.getElementById('modalPlayBtn');
    const muteButton = document.getElementById('modalMuteBtn');
    if (!playButton || !muteButton || !youtubePlayerReady || !youtubePlayer) return;

    const playerState = youtubePlayer.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
      tutorialPlaybackActive = true;
    } else if (
      playerState === YT.PlayerState.PAUSED
      || playerState === YT.PlayerState.ENDED
      || playerState === YT.PlayerState.CUED
      || playerState === YT.PlayerState.UNSTARTED
    ) {
      tutorialPlaybackActive = false;
    }
    const isPlaying = tutorialPlaybackActive;
    updatePlaybackButton(isPlaying);
    syncCenterPlaybackIndicator(isPlaying);
    updateMuteButton(tutorialMuted);
    updateVolumeSlider(tutorialMuted ? 0 : youtubePlayer.getVolume());
    updatePlayerProgress();
    if (isPlaying) showPlayerControls();
    else showPlayerControls(false);
  }

  function updateMuteButton(isMuted) {
    const button = document.getElementById('modalMuteBtn');
    if (!button) return;
    button.classList.toggle('is-muted', isMuted);
    button.setAttribute('aria-label', isMuted ? 'Turn sound on' : 'Turn sound off');
    button.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    button.title = isMuted ? 'Sound off' : 'Sound on';
  }

  function startPlayerProgressTimer() {
    window.clearInterval(playerProgressTimer);
    playerProgressTimer = window.setInterval(updatePlayerProgress, 500);
  }

  function updatePlayerProgress() {
    if (!youtubePlayerReady || !youtubePlayer) return;
    const current = Number(youtubePlayer.getCurrentTime()) || 0;
    const duration = Number(youtubePlayer.getDuration()) || 0;
    const seek = document.getElementById('modalPlayerSeek');
    const time = document.getElementById('modalPlayerTime');
    if (seek && duration > 0) {
      seek.value = String(current / duration * 100);
    }
    if (time) time.textContent = `${formatPlayerTime(current)} / ${formatPlayerTime(duration)}`;
  }

  function formatPlayerTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const remainder = String(total % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function resetCustomPlayerControls() {
    const seek = document.getElementById('modalPlayerSeek');
    const time = document.getElementById('modalPlayerTime');
    const playButton = document.getElementById('modalPlayBtn');
    const muteButton = document.getElementById('modalMuteBtn');
    const volumeSlider = document.getElementById('modalVolumeSlider');
    const speed = document.getElementById('modalPlayerSpeed');
    if (seek) seek.value = '0';
    if (time) time.textContent = '0:00 / 0:00';
    if (playButton) {
      updatePlaybackButton(true);
    }
    const centerFeedback = document.getElementById('modalCenterPlayFeedback');
    window.clearTimeout(centerPlaybackFeedbackTimer);
    if (centerFeedback) centerFeedback.classList.remove('is-visible', 'is-feedback');
    if (muteButton) {
      updateMuteButton(tutorialMuted);
    }
    if (volumeSlider) {
      const volume = tutorialMuted
        ? 0
        : youtubePlayerReady && youtubePlayer
          ? youtubePlayer.getVolume()
          : lastAudibleVolume;
      updateVolumeSlider(volume);
    }
    captionsEnabled = false;
    updateCaptionsButton();
    if (speed) {
      speed.replaceChildren();
      const normal = document.createElement('option');
      normal.value = '1';
      normal.textContent = '1×';
      speed.appendChild(normal);
    }
  }

  function togglePlayerFullscreen() {
    const player = document.querySelector('.modal-player');
    if (!player) return;

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFullscreen) exitFullscreen.call(document);
      return;
    }

    const requestFullscreen = player.requestFullscreen || player.webkitRequestFullscreen;
    if (requestFullscreen) requestFullscreen.call(player);
  }

  function updateFullscreenButton() {
    const button = document.getElementById('modalFullscreenBtn');
    if (!button) return;
    const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    button.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
  }

  function showPlayerControls(autoHide = true) {
    const player = document.querySelector('.modal-player');
    if (!player) return;
    player.classList.remove('is-controls-hidden');
    window.clearTimeout(playerControlsTimer);
    const isPlaying = youtubePlayerReady && youtubePlayer && tutorialPlaybackActive;
    if (autoHide && isPlaying) {
      playerControlsTimer = window.setTimeout(hidePlayerControls, 3000);
    }
  }

  function hidePlayerControls() {
    const player = document.querySelector('.modal-player');
    const isPlaying = youtubePlayerReady && youtubePlayer && tutorialPlaybackActive;
    if (!player || !isPlaying) return;
    player.classList.add('is-controls-hidden');
  }

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

  const modalPlayerSurface = document.querySelector('.modal-player');
  const modalVideoStage = document.querySelector('.modal-video-stage');
  const modalPlayerControls = document.querySelector('.modal-player-controls');
  if (modalPlayerSurface) modalPlayerSurface.addEventListener('pointermove', () => showPlayerControls());
  if (modalVideoStage) {
    modalVideoStage.addEventListener('pointerdown', () => showPlayerControls());
    modalVideoStage.addEventListener('touchstart', () => showPlayerControls(), { passive:true });
    modalVideoStage.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      toggleTutorialPlayback();
    });
  }
  if (modalPlayerControls) {
    modalPlayerControls.addEventListener('pointerdown', () => showPlayerControls());
  }

  function closePlayer(e) {
    if (e && e.target !== document.getElementById('modalOverlay')) return;
    clearTimeout(playerLoadTimer);
    setPlayerStatus('');
    pendingYoutubeVideoId = '';
    window.clearInterval(playerProgressTimer);
    window.clearTimeout(playerControlsTimer);
    window.clearTimeout(centerPlaybackFeedbackTimer);
    if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.stopVideo === 'function') {
      youtubePlayer.stopVideo();
    }
    const modalOverlay = document.getElementById('modalOverlay');
    modalOverlay.classList.remove('open');
    modalOverlay.setAttribute('aria-hidden', 'true');
    const player = document.querySelector('.modal-player');
    if (player) player.classList.remove('is-controls-hidden');
    document.body.style.overflow = '';
    document.querySelectorAll('#main-content > :not(#modalOverlay), body > nav, body > footer').forEach(element => { element.inert = false; });
    if (playerReturnFocus?.isConnected) playerReturnFocus.focus({ preventScroll: true });
    playerReturnFocus = null;
    currentVideoId = '';
    publicPlayback = false;
    tutorialPlaybackActive = false;
    resetCustomPlayerControls();
    updateProgressDisplay();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePlayer(null);
  });

  document.getElementById('modalOverlay').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = Array.from(event.currentTarget.querySelectorAll('button, input, select, iframe, [tabindex="0"]'))
      .filter(item => !item.disabled && !item.hidden && item.getClientRects().length);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
