(function (global) {
  'use strict';

  var lastAnnouncedSecond = null;

  function getSpeechSynth() {
    return global.speechSynthesis || null;
  }

  function cancelSpeechOutput() {
    var synth = getSpeechSynth();
    if (synth && typeof synth.cancel === 'function') synth.cancel();
  }

  function shouldAnnounceCountdown(remainingSeconds) {
    var n = Number(remainingSeconds);
    return n >= 1 && n <= 5;
  }

  function speakCountdownDigit(digit, hooks) {
    var text = String(digit);
    if (hooks && typeof hooks.speak === 'function') {
      hooks.speak(text);
      return;
    }
    var synth = getSpeechSynth();
    if (!synth || typeof global.SpeechSynthesisUtterance !== 'function') return;
    cancelSpeechOutput();
    var utter = new global.SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 1.08;
    utter.pitch = 1;
    utter.volume = 0.78;
    synth.speak(utter);
  }

  function stopRestCountdownAudio() {
    cancelSpeechOutput();
  }

  function resetCountdownAudio() {
    cancelSpeechOutput();
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
    _debugLastAnnounced: function () { return lastAnnouncedSecond; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
