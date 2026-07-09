// static/js/voiceAssistant.js
//
// Aysh Voice Assistant — a Jarvis-style always-listening wake word.
//
// Runs entirely client-side: the browser's Web Speech API listens
// ambiently for the wake word ("aysh" by default). Once woken, the next
// thing you say is dropped straight into the message composer and sent,
// and the reply is read back with the existing TTS pipeline
// (window.aiTTSManager, see tts-ai.js). Saying the sleep phrase (or a
// period of silence) puts it back to sleep.
//
// No server changes are required beyond the two settings that store the
// wake word / sleep phrase (see src/settings.py DEFAULT_SETTINGS) — the
// mic never leaves the browser except through the STT/TTS endpoints that
// already exist for push-to-talk and read-aloud.

const STATES = {
  OFF: 'off',
  ASLEEP: 'asleep',
  AWAKE: 'awake',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
};

const AUTO_SLEEP_MS = 15000;
const REPLY_START_TIMEOUT_MS = 40000;

let recognition = null;
let armed = false;
let state = STATES.OFF;
let wakeWord = 'aysh';
let sleepPhrase = 'sleep aysh';
let autoSleepTimer = null;
let restartTimer = null;
let orbEl = null;
let transcriptEl = null;

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsPhrase(text, phrase) {
  const t = ' ' + normalize(text) + ' ';
  const p = ' ' + normalize(phrase) + ' ';
  return !!p.trim() && t.includes(p);
}

async function loadSettings() {
  try {
    const res = await fetch('/api/auth/settings', { credentials: 'same-origin' });
    const s = await res.json();
    wakeWord = (s.voice_assistant_wake_word || 'aysh').trim() || 'aysh';
    sleepPhrase = (s.voice_assistant_sleep_phrase || 'sleep aysh').trim() || 'sleep aysh';
    return s;
  } catch (e) {
    return {};
  }
}

function speak(text, onDone) {
  const done = onDone || function () {};
  if (window.aiTTSManager && window.aiTTSManager.available) {
    window.aiTTSManager.play(text).catch(() => {}).then(done, done);
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  } else {
    done();
  }
}

function playChime(rising) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const from = rising ? 520 : 780;
    const to = rising ? 780 : 520;
    o.frequency.setValueAtTime(from, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.24);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch (e) { /* ignore — chime is a nicety, not required */ }
}

function setState(next) {
  state = next;
  updateOrbUI();
  updateTranscriptPreview('');
}

function clearAutoSleep() {
  if (autoSleepTimer) {
    clearTimeout(autoSleepTimer);
    autoSleepTimer = null;
  }
}

function armAutoSleep() {
  clearAutoSleep();
  autoSleepTimer = setTimeout(() => {
    speak('Going to sleep.', () => { if (armed) setState(STATES.ASLEEP); });
  }, AUTO_SLEEP_MS);
}

function handleUtterance(rawText) {
  const text = (rawText || '').trim();
  if (!text || !armed) return;

  if (state === STATES.ASLEEP) {
    if (!containsPhrase(text, wakeWord)) return;
    clearAutoSleep();
    const norm = normalize(text);
    const idx = norm.indexOf(normalize(wakeWord));
    const after = text.slice(idx + wakeWord.length).replace(/^[\s,.!:;-]+/, '');
    setState(STATES.AWAKE);
    if (after && after.split(/\s+/).length > 1) {
      sendCommand(after);
    } else {
      playChime(true);
      speak('Yes?', () => armAutoSleep());
    }
    return;
  }

  if (state === STATES.AWAKE) {
    if (containsPhrase(text, sleepPhrase) || containsPhrase(text, 'sleep ' + wakeWord) || containsPhrase(text, wakeWord + ' sleep')) {
      clearAutoSleep();
      playChime(false);
      speak('Going to sleep.', () => { if (armed) setState(STATES.ASLEEP); });
      return;
    }
    clearAutoSleep();
    sendCommand(text);
  }
}

function sendCommand(text) {
  setState(STATES.THINKING);
  const input = document.getElementById('message');
  const sendBtn = document.querySelector('.send-btn');
  if (!input || !sendBtn) {
    setState(STATES.AWAKE);
    armAutoSleep();
    return;
  }

  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));

  const mgr = window.aiTTSManager;
  const prevAutoPlay = mgr ? mgr.autoPlay : null;
  if (mgr) mgr.autoPlay = true;

  sendBtn.click();
  waitForReply(prevAutoPlay);
}

function waitForReply(prevAutoPlay) {
  const startedAt = Date.now();
  const poll = setInterval(() => {
    if (!armed) { clearInterval(poll); return; }
    const mgr = window.aiTTSManager;
    if (mgr && (mgr.isPlaying || mgr._processing)) {
      clearInterval(poll);
      setState(STATES.SPEAKING);
      waitForSpeechEnd(prevAutoPlay);
    } else if (Date.now() - startedAt > REPLY_START_TIMEOUT_MS) {
      clearInterval(poll);
      if (mgr && prevAutoPlay !== null) mgr.autoPlay = prevAutoPlay;
      setState(STATES.AWAKE);
      armAutoSleep();
    }
  }, 200);
}

function waitForSpeechEnd(prevAutoPlay) {
  const poll = setInterval(() => {
    if (!armed) { clearInterval(poll); return; }
    const mgr = window.aiTTSManager;
    if (!mgr || (!mgr.isPlaying && !mgr._processing)) {
      clearInterval(poll);
      if (mgr && prevAutoPlay !== null) mgr.autoPlay = prevAutoPlay;
      setState(STATES.AWAKE);
      armAutoSleep();
    }
  }, 250);
}

function startRecognitionEngine() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        handleUtterance(res[0].transcript);
      } else {
        interim += res[0].transcript;
      }
    }
    updateTranscriptPreview(interim);
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      disable();
    }
    // 'no-speech' / 'aborted' / 'network' are routine for an always-on
    // recognizer — onend fires right after and restarts it.
  };

  recognition.onend = () => {
    if (!armed) return;
    // Don't fight the push-to-talk recorder for the mic while it's active.
    const sendBtn = document.querySelector('.send-btn');
    const manualRecording = sendBtn && sendBtn.classList.contains('recording');
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (!armed) return;
      try { recognition.start(); } catch (e) { /* already running */ }
    }, manualRecording ? 1200 : 250);
  };

  try {
    recognition.start();
    return true;
  } catch (e) {
    return false;
  }
}

function stopRecognitionEngine() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (recognition) {
    const r = recognition;
    recognition = null;
    r.onend = null;
    r.onerror = null;
    try { r.stop(); } catch (e) { /* ignore */ }
  }
}

function updateOrbUI() {
  if (!orbEl) return;
  orbEl.classList.remove('off', 'asleep', 'awake', 'thinking', 'speaking');
  orbEl.classList.add(state);
  const labels = {
    off: 'Voice assistant is off — click to wake Aysh up',
    asleep: `Listening for "${wakeWord}"…`,
    awake: 'Awake — go ahead',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
  };
  orbEl.title = labels[state] || 'Aysh';
  orbEl.setAttribute('aria-label', labels[state] || 'Aysh voice assistant');
}

function updateTranscriptPreview(text) {
  if (!transcriptEl) return;
  const showable = text && (state === STATES.ASLEEP || state === STATES.AWAKE);
  transcriptEl.textContent = showable ? text : '';
  transcriptEl.classList.toggle('visible', !!showable);
}

function buildOrb() {
  if (document.getElementById('aysh-voice-orb')) return;

  orbEl = document.createElement('button');
  orbEl.id = 'aysh-voice-orb';
  orbEl.type = 'button';
  orbEl.className = 'aysh-voice-orb off';
  orbEl.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
    '<line x1="12" y1="19" x2="12" y2="23"/>' +
    '<line x1="8" y1="23" x2="16" y2="23"/>' +
    '</svg>' +
    '<span class="aysh-voice-orb-ring"></span>';
  orbEl.addEventListener('click', toggle);
  document.body.appendChild(orbEl);

  transcriptEl = document.createElement('div');
  transcriptEl.id = 'aysh-voice-transcript';
  transcriptEl.className = 'aysh-voice-transcript';
  document.body.appendChild(transcriptEl);

  updateOrbUI();
}

export function enable() {
  if (armed) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!window.isSecureContext) {
    console.warn('[Aysh Voice] requires HTTPS or localhost.');
    return;
  }
  if (!SR) {
    console.warn('[Aysh Voice] this browser has no speech recognition (try Chrome/Edge).');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[Aysh Voice] microphone not supported in this browser.');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      armed = true;
      setState(STATES.ASLEEP);
      startRecognitionEngine();
    })
    .catch(() => console.warn('[Aysh Voice] microphone access denied.'));
}

export function disable() {
  armed = false;
  clearAutoSleep();
  stopRecognitionEngine();
  setState(STATES.OFF);
}

export function toggle() {
  if (state === STATES.OFF) enable();
  else disable();
}

export function getState() {
  return state;
}

export async function init() {
  buildOrb();
  const settings = await loadSettings();
  if (settings.voice_assistant_enabled) {
    enable();
  }
}

export async function refreshSettings() {
  await loadSettings();
}

const voiceAssistantModule = { init, enable, disable, toggle, getState, refreshSettings };
window.voiceAssistantModule = voiceAssistantModule;
export default voiceAssistantModule;
