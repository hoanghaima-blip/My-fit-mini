(function (global) {
  'use strict';

  var GO_KEY = 'go';
  var lastAnnouncedSecond = null;
  var goPlayed = false;
  var goCallbackTimer = null;
  var audioUnlocked = false;
  var currentClip = null;
  var currentSource = null;
  var clipCache = {};
  var bufferCache = {};
  var bufferLoadPromise = null;
  var audioCtx = null;
  var unlockListenersBound = false;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(global.navigator && global.navigator.userAgent || '') ||
      (global.navigator && global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
  }

  function isStandalonePwa() {
    return !!(global.navigator && global.navigator.standalone) ||
      (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  }

  function getSpeechSynth() {
    return global.speechSynthesis || null;
  }

  function cancelSpeechOutput() {
    var synth = getSpeechSynth();
    if (synth && typeof synth.cancel === 'function') synth.cancel();
  }

  function resolveAssetUrl(rel) {
    if (global.document && global.document.createElement) {
      var link = global.document.createElement('a');
      link.href = rel;
      return link.href;
    }
    return rel;
  }

  function getDigitClipSrc(digit) {
    return resolveAssetUrl('assets/audio/count-' + digit + '.mp3');
  }

  function getGoClipSrc() {
    return resolveAssetUrl('assets/audio/count-go.mp3');
  }

  function createHtmlAudio(src, loud) {
    var audio = new global.Audio(src);
    audio.preload = 'auto';
    audio.volume = loud ? 1 : 0.96;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    if (typeof audio.playsInline !== 'undefined') audio.playsInline = true;
    return audio;
  }

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function preloadClips() {
    var d;
    for (d = 1; d <= 5; d += 1) {
      if (clipCache[d]) continue;
      clipCache[d] = createHtmlAudio(getDigitClipSrc(d), false);
    }
    if (!clipCache[GO_KEY]) clipCache[GO_KEY] = createHtmlAudio(getGoClipSrc(), true);
  }

  function fetchDecodeBuffer(ctx, url) {
    return fetch(url)
      .then(function (response) {
        if (!response || !response.ok) throw new Error('fetch failed');
        return response.arrayBuffer();
      })
      .then(function (data) {
        return new Promise(function (resolve, reject) {
          ctx.decodeAudioData(data, resolve, reject);
        });
      });
  }

  function loadAudioBuffers() {
    if (bufferLoadPromise) return bufferLoadPromise;
    var ctx = getAudioContext();
    if (!ctx) {
      bufferLoadPromise = Promise.resolve();
      return bufferLoadPromise;
    }
    var jobs = [1, 2, 3, 4, 5].map(function (digit) {
      if (bufferCache[digit]) return Promise.resolve();
      return fetchDecodeBuffer(ctx, getDigitClipSrc(digit)).then(function (buffer) {
        bufferCache[digit] = buffer;
      }).catch(function () {});
    });
    if (!bufferCache[GO_KEY]) {
      jobs.push(fetchDecodeBuffer(ctx, getGoClipSrc()).then(function (buffer) {
        bufferCache[GO_KEY] = buffer;
      }).catch(function () {}));
    }
    bufferLoadPromise = Promise.all(jobs);
    return bufferLoadPromise;
  }

  function clearGoCallbackTimer() {
    if (goCallbackTimer) {
      clearTimeout(goCallbackTimer);
      goCallbackTimer = null;
    }
  }

  function stopCurrentClip() {
    clearGoCallbackTimer();
    if (currentSource) {
      try { currentSource.stop(0); } catch (err) {}
      currentSource = null;
    }
    if (currentClip) {
      try {
        currentClip.pause();
        currentClip.currentTime = 0;
      } catch (err) {}
      currentClip = null;
    }
  }

  function resumeAudioContext() {
    var ctx = getAudioContext();
    if (!ctx) return Promise.resolve();
    if (ctx.state === 'suspended') return ctx.resume().catch(function () {});
    return Promise.resolve();
  }

  function removeUnlockListeners(unlockOnce) {
    if (!global.document || !unlockOnce) return;
    global.document.removeEventListener('touchstart', unlockOnce, true);
    global.document.removeEventListener('pointerdown', unlockOnce, true);
    global.document.removeEventListener('click', unlockOnce, true);
  }

  function unlockRestAudio() {
    var already = audioUnlocked;
    audioUnlocked = true;
    preloadClips();
    resumeAudioContext();
    loadAudioBuffers();
    // Only prime HTML Audio once — re-playing on every tap interrupts countdown.
    if (already) return;
    var primer = clipCache[1] || createHtmlAudio(getDigitClipSrc(1));
    clipCache[1] = primer;
    var prevVolume = primer.volume;
    primer.volume = isIOS() ? 0.001 : 0.02;
    primer.currentTime = 0;
    var played = primer.play();
    if (played && typeof played.then === 'function') {
      played.then(function () {
        primer.pause();
        primer.currentTime = 0;
        primer.volume = prevVolume;
      }).catch(function () {
        primer.volume = prevVolume;
      });
    } else {
      primer.volume = prevVolume;
    }
  }

  function bindGlobalUnlockOnce() {
    if (unlockListenersBound || !global.document) return;
    unlockListenersBound = true;
    var unlockOnce = function () {
      unlockRestAudio();
      removeUnlockListeners(unlockOnce);
    };
    global.document.addEventListener('touchstart', unlockOnce, { capture: true, passive: true });
    global.document.addEventListener('pointerdown', unlockOnce, { capture: true, passive: true });
    global.document.addEventListener('click', unlockOnce, { capture: true });
  }

  function speakWithSynth(text) {
    var synth = getSpeechSynth();
    if (!synth || typeof global.SpeechSynthesisUtterance !== 'function') return false;
    if (typeof synth.resume === 'function') synth.resume();
    cancelSpeechOutput();
    var utter = new global.SpeechSynthesisUtterance(String(text));
    utter.lang = 'en-US';
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.volume = 0.85;
    synth.speak(utter);
    return true;
  }

  function playBufferKey(key) {
    var ctx = getAudioContext();
    var buffer = bufferCache[key];
    if (!ctx || !buffer) return false;
    // Suspended context "starts" silently on iOS — fall back to HTML Audio.
    if (ctx.state !== 'running') {
      resumeAudioContext();
      return false;
    }
    stopCurrentClip();
    var source = ctx.createBufferSource();
    var gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = key === GO_KEY ? 1 : 0.96;
    source.connect(gain);
    gain.connect(ctx.destination);
    try {
      source.start(0);
    } catch (err) {
      return false;
    }
    currentSource = source;
    source.onended = function () {
      if (currentSource === source) currentSource = null;
    };
    return true;
  }

  function playHtmlKey(key, src, fallbackText) {
    var clip = clipCache[key];
    if (!clip) {
      clip = createHtmlAudio(src, key === GO_KEY);
      clipCache[key] = clip;
    }
    if (key === GO_KEY) clip.volume = 1;
    stopCurrentClip();
    try {
      clip.currentTime = 0;
    } catch (err) {}
    currentClip = clip;
    var playPromise = clip.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function () {
        if (fallbackText) speakWithSynth(fallbackText);
      });
    }
    return clip;
  }

  function playClipKey(key, src, fallbackText) {
    // Prefer immediate HTML playback so countdown never waits on buffer decode.
    // Use Web Audio only when context is already running and buffer is ready.
    if (bufferCache[key] && playBufferKey(key)) return Promise.resolve();
    playHtmlKey(key, src, fallbackText);
    if (audioUnlocked) loadAudioBuffers();
    return Promise.resolve();
  }

  function playClipDigit(digit) {
    playClipKey(digit, getDigitClipSrc(digit), String(digit));
  }

  function shouldAnnounceCountdown(remainingSeconds) {
    var n = Number(remainingSeconds);
    return n >= 1 && n <= 5;
  }

  function speakCountdownDigit(digit, hooks) {
    if (hooks && typeof hooks.speak === 'function') {
      hooks.speak(String(digit));
      return;
    }
    if (!audioUnlocked) {
      preloadClips();
      // Still attempt playback — may work after prior gesture; unlock if possible.
    }
    resumeAudioContext();
    playClipDigit(digit);
  }

  function stopRestCountdownAudio() {
    goPlayed = false;
    stopCurrentClip();
    cancelSpeechOutput();
  }

  function resetCountdownAudio() {
    goPlayed = false;
    lastAnnouncedSecond = null;
    stopCurrentClip();
    cancelSpeechOutput();
  }

  function handleRestCountdownTick(remainingSeconds, hooks) {
    var remaining = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
    if (remaining <= 0) {
      return { announced: false, stopped: false, remaining: 0, readyForGo: true };
    }
    if (!shouldAnnounceCountdown(remaining)) {
      return { announced: false, stopped: false, remaining: remaining };
    }
    if (lastAnnouncedSecond === remaining) {
      return { announced: false, stopped: false, duplicate: true, remaining: remaining };
    }
    lastAnnouncedSecond = remaining;
    speakCountdownDigit(remaining, hooks);
    return { announced: true, digit: remaining, stopped: false, remaining: remaining };
  }

  function playGoCue(onDone, hooks) {
    if (goPlayed) {
      if (typeof onDone === 'function') onDone();
      return { played: false, duplicate: true };
    }
    goPlayed = true;
    if (hooks && typeof hooks.speak === 'function') {
      hooks.speak('Go');
      if (typeof onDone === 'function') {
        goCallbackTimer = setTimeout(onDone, 650);
      }
      return { played: true, digit: 'Go' };
    }
    if (!audioUnlocked) preloadClips();
    resumeAudioContext();
    var doneCalled = false;
    var done = function () {
      if (doneCalled) return;
      doneCalled = true;
      clearGoCallbackTimer();
      if (typeof onDone === 'function') onDone();
    };
    playClipKey(GO_KEY, getGoClipSrc(), 'Go').then(function () {
      var clip = currentClip || clipCache[GO_KEY] || null;
      if (clip && typeof clip.addEventListener === 'function' && currentClip === clip) {
        var onEnded = function () {
          clip.removeEventListener('ended', onEnded);
          done();
        };
        clip.addEventListener('ended', onEnded);
      }
      goCallbackTimer = setTimeout(done, 900);
    });
    return { played: true, digit: 'Go' };
  }

  bindGlobalUnlockOnce();

  global.MyFitRestAudio = {
    shouldAnnounceCountdown: shouldAnnounceCountdown,
    handleRestCountdownTick: handleRestCountdownTick,
    resetCountdownAudio: resetCountdownAudio,
    stopRestCountdownAudio: stopRestCountdownAudio,
    speakCountdownDigit: speakCountdownDigit,
    playGoCue: playGoCue,
    unlockRestAudio: unlockRestAudio,
    isStandalonePwa: isStandalonePwa,
    _debugLastAnnounced: function () { return lastAnnouncedSecond; },
    _isUnlocked: function () { return audioUnlocked; },
    _hasBuffer: function (key) { return !!bufferCache[key]; },
    _goPlayed: function () { return goPlayed; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
