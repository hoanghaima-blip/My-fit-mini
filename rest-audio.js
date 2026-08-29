(function (global) {
  'use strict';

  var lastAnnouncedSecond = null;
  var audioUnlocked = false;
  var currentClip = null;
  var currentSource = null;
  var clipCache = {};
  var bufferCache = {};
  var bufferLoadPromise = null;
  var audioCtx = null;

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

  function getClipSrc(digit) {
    var rel = 'assets/audio/count-' + digit + '.mp3';
    if (global.document && global.document.createElement) {
      var link = global.document.createElement('a');
      link.href = rel;
      return link.href;
    }
    return rel;
  }

  function createHtmlAudio(digit) {
    var audio = new global.Audio(getClipSrc(digit));
    audio.preload = 'auto';
    audio.volume = 0.96;
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
      clipCache[d] = createHtmlAudio(d);
    }
  }

  function loadAudioBuffers() {
    if (bufferLoadPromise) return bufferLoadPromise;
    var ctx = getAudioContext();
    if (!ctx) {
      bufferLoadPromise = Promise.resolve();
      return bufferLoadPromise;
    }
    bufferLoadPromise = Promise.all([1, 2, 3, 4, 5].map(function (digit) {
      if (bufferCache[digit]) return Promise.resolve();
      return fetch(getClipSrc(digit))
        .then(function (response) {
          if (!response.ok) throw new Error('fetch failed');
          return response.arrayBuffer();
        })
        .then(function (data) {
          return new Promise(function (resolve, reject) {
            ctx.decodeAudioData(data, resolve, reject);
          });
        })
        .then(function (buffer) {
          bufferCache[digit] = buffer;
        })
        .catch(function () {});
    }));
    return bufferLoadPromise;
  }

  function stopCurrentClip() {
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
    if (ctx.state === 'suspended') return ctx.resume();
    return Promise.resolve();
  }

  function unlockRestAudio() {
    audioUnlocked = true;
    preloadClips();
    resumeAudioContext();
    loadAudioBuffers();
    var primer = clipCache[1] || createHtmlAudio(1);
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
    if (bindGlobalUnlockOnce.done) return;
    bindGlobalUnlockOnce.done = true;
    var unlockOnce = function () {
      unlockRestAudio();
    };
    global.document.addEventListener('touchstart', unlockOnce, { capture: true, passive: true });
    global.document.addEventListener('click', unlockOnce, { capture: true });
  }

  function speakWithSynth(digit) {
    var synth = getSpeechSynth();
    if (!synth || typeof global.SpeechSynthesisUtterance !== 'function') return false;
    if (typeof synth.resume === 'function') synth.resume();
    cancelSpeechOutput();
    var utter = new global.SpeechSynthesisUtterance(String(digit));
    utter.lang = 'en-US';
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.volume = 0.85;
    synth.speak(utter);
    return true;
  }

  function playBufferDigit(digit) {
    var ctx = getAudioContext();
    var buffer = bufferCache[digit];
    if (!ctx || !buffer) return false;
    if (ctx.state === 'suspended') ctx.resume();
    stopCurrentClip();
    var source = ctx.createBufferSource();
    var gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.96;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    currentSource = source;
    source.onended = function () {
      if (currentSource === source) currentSource = null;
    };
    return true;
  }

  function playHtmlDigit(digit) {
    var clip = clipCache[digit];
    if (!clip) {
      clip = createHtmlAudio(digit);
      clipCache[digit] = clip;
    }
    stopCurrentClip();
    clip.currentTime = 0;
    currentClip = clip;
    var playPromise = clip.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function () {
        speakWithSynth(digit);
      });
    }
    return true;
  }

  function playClipDigit(digit) {
    if (bufferCache[digit] && playBufferDigit(digit)) return;
    if (audioUnlocked && bufferLoadPromise) {
      bufferLoadPromise.then(function () {
        if (bufferCache[digit] && playBufferDigit(digit)) return;
        playHtmlDigit(digit);
      });
      return;
    }
    playHtmlDigit(digit);
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
    if (!audioUnlocked) preloadClips();
    resumeAudioContext();
    playClipDigit(digit);
  }

  function stopRestCountdownAudio() {
    stopCurrentClip();
    cancelSpeechOutput();
  }

  function resetCountdownAudio() {
    stopRestCountdownAudio();
    lastAnnouncedSecond = null;
  }

  function handleRestCountdownTick(remainingSeconds, hooks) {
    var remaining = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
    if (remaining <= 0) {
      stopRestCountdownAudio();
      lastAnnouncedSecond = null;
      return { announced: false, stopped: true, remaining: 0 };
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

  bindGlobalUnlockOnce();

  global.MyFitRestAudio = {
    shouldAnnounceCountdown: shouldAnnounceCountdown,
    handleRestCountdownTick: handleRestCountdownTick,
    resetCountdownAudio: resetCountdownAudio,
    stopRestCountdownAudio: stopRestCountdownAudio,
    speakCountdownDigit: speakCountdownDigit,
    unlockRestAudio: unlockRestAudio,
    isStandalonePwa: isStandalonePwa,
    _debugLastAnnounced: function () { return lastAnnouncedSecond; },
    _isUnlocked: function () { return audioUnlocked; },
    _hasBuffer: function (digit) { return !!bufferCache[digit]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
