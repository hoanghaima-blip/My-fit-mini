(function (global) {
  'use strict';

  var lastAnnouncedSecond = null;
  var audioUnlocked = false;
  var currentClip = null;
  var clipCache = {};

  function getSpeechSynth() {
    return global.speechSynthesis || null;
  }

  function cancelSpeechOutput() {
    var synth = getSpeechSynth();
    if (synth && typeof synth.cancel === 'function') synth.cancel();
  }

  function getClipSrc(digit) {
    return 'assets/audio/count-' + digit + '.mp3';
  }

  function preloadClips() {
    var d;
    for (d = 1; d <= 5; d += 1) {
      if (clipCache[d]) continue;
      var audio = new global.Audio(getClipSrc(d));
      audio.preload = 'auto';
      audio.volume = 0.9;
      clipCache[d] = audio;
    }
  }

  function stopCurrentClip() {
    if (currentClip) {
      try {
        currentClip.pause();
        currentClip.currentTime = 0;
      } catch (err) {}
      currentClip = null;
    }
  }

  function unlockRestAudio() {
    audioUnlocked = true;
    preloadClips();
    var primer = clipCache[1];
    if (!primer) return;
    var prevVolume = primer.volume;
    primer.volume = 0.02;
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

  function speakWithSynth(digit) {
    var synth = getSpeechSynth();
    if (!synth || typeof global.SpeechSynthesisUtterance !== 'function') return false;
    if (typeof synth.resume === 'function') synth.resume();
    cancelSpeechOutput();
    var utter = new global.SpeechSynthesisUtterance(String(digit));
    utter.lang = 'vi-VN';
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.volume = 0.85;
    synth.speak(utter);
    return true;
  }

  function playClipDigit(digit) {
    var clip = clipCache[digit];
    if (!clip) {
      clip = new global.Audio(getClipSrc(digit));
      clip.preload = 'auto';
      clip.volume = 0.9;
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

  global.MyFitRestAudio = {
    shouldAnnounceCountdown: shouldAnnounceCountdown,
    handleRestCountdownTick: handleRestCountdownTick,
    resetCountdownAudio: resetCountdownAudio,
    stopRestCountdownAudio: stopRestCountdownAudio,
    speakCountdownDigit: speakCountdownDigit,
    unlockRestAudio: unlockRestAudio,
    _debugLastAnnounced: function () { return lastAnnouncedSecond; },
    _isUnlocked: function () { return audioUnlocked; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
