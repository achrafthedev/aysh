// static/js/voiceAssistant.js
//
// Aysh Voice Assistant — a Jarvis-style always-listening wake word.
//
// Holds a single continuous microphone stream open (so the OS mic
// indicator stays steady, not flickering) and watches its volume with a
// lightweight voice-activity check. When it detects speech, it records
// just that segment and sends it to Aysh's own /api/stt/transcribe
// endpoint — the same one the push-to-talk mic button uses — so
// transcription runs through whichever Speech-to-Text provider is
// already configured (local Whisper or an API endpoint), not a browser
// vendor's cloud service.
//
// An earlier version of this file used the browser's native
// SpeechRecognition API instead. That depends on a cloud speech backend
// that only official Google Chrome/Edge builds ship a key for — Brave
// and plain Chromium fail every session instantly with a 'network'
// error, which is both why it never worked there and why switching to
// this local-STT approach is the actual fix, not a workaround.
//
// Once woken, the next thing you say is dropped straight into the
// message composer and sent, and the reply is read back with the
// existing TTS pipeline (window.aiTTSManager, see tts-ai.js). Saying the
// sleep phrase (or a period of silence) puts it back to sleep.

const STATES = {
  OFF: 'off',
  ASLEEP: 'asleep',
  AWAKE: 'awake',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
};

const AUTO_SLEEP_MS = 15000;
const REPLY_START_TIMEOUT_MS = 40000;

// Voice-activity detection tuning for the always-on mic stream. Polling
// more often and triggering on a quieter threshold both trade a bit more
// CPU/false-positive risk for catching the true onset of a word instead
// of clipping its first few dozen ms — clipped onsets are a common cause
// of otherwise-fine short-word transcriptions coming back wrong.
const VAD_POLL_MS = 80;
const VAD_RMS_THRESHOLD = 0.015;
const VAD_SILENCE_HANGOVER_MS = 700;
const VAD_MIN_CHUNK_MS = 400;
const VAD_MAX_CHUNK_MS = 8000;

let armed = false;
let state = STATES.OFF;
let wakeWord = 'aysh';
let sleepPhrase = 'sleep aysh';
let autoSleepTimer = null;
let orbEl = null;
let transcriptEl = null;

let sttProvider = 'disabled';
let mediaStream = null;
let audioCtx = null;
let analyser = null;
let vadDataArray = null;
let vadTimer = null;
let mediaRecorder = null;
let recordedChunks = [];
let chunkStartedAt = null;
let chunkSilenceStartedAt = null;

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

// Edit distance between two short strings — used to tolerate speech-to-text
// mishearing invented wake words. Generic ASR language models bias toward
// real dictionary words, so "Aysh" (not a word) often comes back as "ash",
// "ice", "eyes", "ish", etc. rather than literally "aysh".
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

function fuzzyThreshold(len) {
  if (len <= 3) return 1; // "aysh" -> "ash"/"ice" is 1-2 edits; keep short words lenient too
  if (len <= 6) return 2;
  return 3;
}

// Known near-homophones for wake words that aren't real dictionary words.
// "Aysh" (/eɪʃ/) is a near-homophone of the letter "H" ("aitch", /eɪtʃ/) --
// differs by one consonant (sh vs ch) -- confirmed from real transcripts
// ("Hello, H."). Plain edit distance misses this: a single letter is "far"
// from a 4-letter word by character count alone, even though it's an
// almost perfect phonetic match, so these are checked as direct hits.
const WORD_ALIASES = {
  aysh: ['h', 'aitch', 'age'],
};

function wordMatches(transcriptWord, phraseWord) {
  if (transcriptWord === phraseWord) return true;
  const aliases = WORD_ALIASES[phraseWord];
  if (aliases && aliases.includes(transcriptWord)) return true;
  return levenshtein(transcriptWord, phraseWord) <= fuzzyThreshold(phraseWord.length);
}

function containsPhrase(text, phrase) {
  const t = ' ' + normalize(text) + ' ';
  const p = ' ' + normalize(phrase) + ' ';
  if (!p.trim()) return false;
  if (t.includes(p)) return true;

  // Fuzzy fallback: each word of the phrase must appear, in order, among
  // the transcript's words within a small edit-distance tolerance (or a
  // known alias, see WORD_ALIASES above).
  const phraseWords = normalize(phrase).split(' ').filter(Boolean);
  const textWords = normalize(text).split(' ').filter(Boolean);
  let ti = 0;
  for (const pw of phraseWords) {
    let found = false;
    while (ti < textWords.length) {
      const tw = textWords[ti++];
      if (wordMatches(tw, pw)) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
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
  console.log('[Aysh Voice] speaking:', JSON.stringify(text));
  // Cancel anything mid-flight first — overlapping speak() calls (e.g. the
  // wake-up "Yes?" still playing when a reply starts) make some browsers
  // fire 'interrupted'/'canceled' on the earlier utterance instead of
  // queueing cleanly, which previously failed silently (see below).
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  if (window.aiTTSManager && window.aiTTSManager.available) {
    window.aiTTSManager.play(text)
      .catch((e) => { console.log('[Aysh Voice] TTS playback failed:', e && e.message); })
      .then(done, done);
  } else if ('speechSynthesis' in window) {
    // "Aysh" isn't a real word, so the browser's rule-based speechSynthesis
    // tends to mispronounce it — "H" ("aitch") is a near-homophone and
    // reads correctly instead (same fix as tts-ai.js's _playBrowser).
    const u = new SpeechSynthesisUtterance(text.replace(/\bAysh\b/gi, 'H'));
    u.onend = done;
    u.onerror = (e) => {
      console.log('[Aysh Voice] speechSynthesis error:', e.error);
      done();
    };
    window.speechSynthesis.speak(u);
  } else {
    console.log('[Aysh Voice] no TTS available at all (no aiTTSManager, no speechSynthesis).');
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
    // idx is -1 when the wake word only matched fuzzily (mis-transcribed) —
    // there's no reliable position to slice from, so just treat the whole
    // utterance as the wake-up and wait for the command separately.
    const after = idx === -1 ? '' : text.slice(idx + wakeWord.length).replace(/^[\s,.!:;-]+/, '');
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

// ---- Mic engine ----

function computeRms(dataArray) {
  let sumSquares = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128;
    sumSquares += v * v;
  }
  return Math.sqrt(sumSquares / dataArray.length);
}

function beginChunkRecording() {
  if (!mediaStream || mediaRecorder) return;
  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
  } catch (e) {
    try { mediaRecorder = new MediaRecorder(mediaStream); } catch (e2) { mediaRecorder = null; return; }
  }
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start();
  chunkStartedAt = Date.now();
  console.log('[Aysh Voice] speech detected, recording...');
}

function finishChunkRecording() {
  if (!mediaRecorder) return;
  const recorder = mediaRecorder;
  const startedAt = chunkStartedAt;
  mediaRecorder = null;
  chunkStartedAt = null;
  chunkSilenceStartedAt = null;
  recorder.onstop = () => {
    const durationMs = Date.now() - (startedAt || Date.now());
    const chunks = recordedChunks;
    recordedChunks = [];
    if (durationMs < VAD_MIN_CHUNK_MS || chunks.length === 0) {
      console.log('[Aysh Voice] speech blip too short to bother transcribing (' + durationMs + 'ms) — ignored.');
      return;
    }
    const blob = new Blob(chunks, { type: 'audio/webm' });
    transcribeChunk(blob);
  };
  try { recorder.stop(); } catch (e) { /* ignore */ }
}

async function transcribeChunk(blob) {
  if (!armed) return;
  console.log('[Aysh Voice] recorded a chunk (' + blob.size + ' bytes), sending for transcription...');
  if (state === STATES.ASLEEP || state === STATES.AWAKE) updateTranscriptPreview('…');
  try {
    const formData = new FormData();
    formData.append('file', blob, 'aysh-voice-chunk.webm');
    const res = await fetch('/api/stt/transcribe', { method: 'POST', credentials: 'same-origin', body: formData });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.log('[Aysh Voice] transcription request failed:', res.status, errBody);
      updateTranscriptPreview('');
      return;
    }
    const data = await res.json();
    const text = (data.text || '').trim();
    if (text) {
      console.log('[Aysh Voice] heard:', JSON.stringify(text));
      handleUtterance(text);
      // handleUtterance only clears the preview via setState if it actually
      // changes state (wake word matched); clear it here too so a heard-but-
      // ignored phrase doesn't leave stale text/an ellipsis stuck on screen.
      if (state === STATES.ASLEEP) updateTranscriptPreview('');
    } else {
      console.log('[Aysh Voice] transcription came back empty for that clip.');
      updateTranscriptPreview('');
    }
  } catch (e) {
    console.log('[Aysh Voice] transcription error:', e.message);
    updateTranscriptPreview('');
  }
}

function vadTick() {
  if (!armed || !analyser || !vadDataArray) return;
  // Don't transcribe while Aysh itself is busy/talking — nothing said during
  // THINKING or SPEAKING should be treated as a new command, and once TTS
  // audio is actually audible this also avoids the mic picking its own
  // voice back up as a fresh "utterance".
  if (state === STATES.THINKING || state === STATES.SPEAKING) return;
  // Don't fight the push-to-talk recorder for the mic while it's active.
  const sendBtn = document.querySelector('.send-btn');
  if (sendBtn && sendBtn.classList.contains('recording')) return;

  analyser.getByteTimeDomainData(vadDataArray);
  const rms = computeRms(vadDataArray);
  const now = Date.now();

  if (rms > VAD_RMS_THRESHOLD) {
    if (!mediaRecorder) beginChunkRecording();
    chunkSilenceStartedAt = null;
    if (chunkStartedAt && now - chunkStartedAt > VAD_MAX_CHUNK_MS) {
      finishChunkRecording();
    }
  } else if (mediaRecorder) {
    if (!chunkSilenceStartedAt) chunkSilenceStartedAt = now;
    if (now - chunkSilenceStartedAt > VAD_SILENCE_HANGOVER_MS) {
      finishChunkRecording();
    }
  }
}

async function startMicEngine() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.log('[Aysh Voice] microphone access denied:', e.message);
    return false;
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();
  const source = audioCtx.createMediaStreamSource(mediaStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  vadDataArray = new Uint8Array(analyser.fftSize);
  source.connect(analyser);

  vadTimer = setInterval(vadTick, VAD_POLL_MS);
  console.log('[Aysh Voice] voice assistant armed (STT provider: ' + sttProvider + '), listening for the wake word.');
  return true;
}

function stopMicEngine() {
  if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
  if (mediaRecorder) {
    try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
    mediaRecorder = null;
  }
  recordedChunks = [];
  chunkStartedAt = null;
  chunkSilenceStartedAt = null;
  analyser = null;
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) { /* ignore */ }
    audioCtx = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
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

export async function enable() {
  if (armed) return;
  if (!window.isSecureContext) {
    console.log('[Aysh Voice] requires HTTPS or localhost.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.log('[Aysh Voice] microphone not supported in this browser.');
    return;
  }
  if (typeof MediaRecorder === 'undefined') {
    console.log('[Aysh Voice] this browser has no MediaRecorder support.');
    return;
  }

  try {
    const res = await fetch('/api/stt/stats', { credentials: 'same-origin' });
    const stats = await res.json();
    sttProvider = stats.provider || 'disabled';
    if (!stats.available || sttProvider === 'disabled' || sttProvider === 'browser') {
      console.log(
        '[Aysh Voice] needs a server-side Speech-to-Text provider (Local Whisper or an API endpoint) ' +
        'configured under Settings → AI → Speech to Text — currently: ' + sttProvider + '.'
      );
      return;
    }
  } catch (e) {
    console.log('[Aysh Voice] could not check STT availability:', e.message);
    return;
  }

  armed = true;
  const ok = await startMicEngine();
  if (!ok) {
    armed = false;
    setState(STATES.OFF);
    return;
  }
  setState(STATES.ASLEEP);
}

export function disable() {
  armed = false;
  clearAutoSleep();
  stopMicEngine();
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
