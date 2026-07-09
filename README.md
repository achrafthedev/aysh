<p align="center">
  <img src="docs/aysh-wordmark.svg" alt="Aysh" width="260">
</p>

<p align="center">
  A self-hosted AI workspace for chat, agents, research, documents, email, notes, and calendar —
  with a Jarvis-style wake word so you can just <em>talk</em> to it.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#-voice-assistant----say-aysh">Voice Assistant</a> ·
  <a href="docs/setup.md">Setup Guide</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## About

**Aysh** is a fork of [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) — the
excellent self-hosted AI workspace originally released by PewDiePie. This fork rebrands the
project and adds a hands-free, always-listening voice assistant on top. Everything else —
chat, agents, research, documents, email, notes, calendar, Cookbook — is Odysseus's
architecture, carried forward under the same AGPL-3.0-or-later license. Full credit and a
huge thank-you to the upstream project; see [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for
the complete attribution.

## Quick Start

```bash
git clone https://github.com/achrafthedev/aysh.git
cd aysh
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:7000` when the containers are healthy. The first admin password is printed in `docker compose logs aysh`.

Native installs, GPU notes, Windows/macOS instructions, HTTPS, and configuration live in the [setup guide](docs/setup.md).

### Linux: launch it from your applications menu

If you'd rather have Aysh as a proper app icon than a terminal command:

```bash
./desktop/install-linux.sh
```

This sets up a native (non-Docker) venv and adds an "Aysh" entry to your applications
menu with its own icon. The server only starts on demand, the first time you open it
from the menu — nothing is installed to run at boot or login.

## 🎙️ Voice Assistant — say "Aysh"

Aysh can listen for its own name, the way Jarvis listens for "Sir." Turn it on in
**Settings → AI → Voice Assistant** and a small orb appears in the corner of the window:

- **Say "Aysh"** — it wakes up (a short chime + "Yes?") and listens for what you want.
- **Just talk** — your next sentence is sent as a chat message automatically, and the
  reply is read back out loud.
- **Say "sleep Aysh"** (or stay quiet for ~15 seconds) — it goes back to sleep and stops
  actively listening for a command, but keeps a low-power ear out for the wake word.
- **Click the orb** any time to arm/disarm it manually.

The wake word and sleep phrase are both configurable — rename your assistant, change the
phrase, whatever you like.

This runs entirely in your browser tab via the Web Speech API (no extra service, no extra
dependency) and reuses Aysh's existing Speech-to-Text / Text-to-Speech settings to talk
back. It needs a Chromium-based browser (Chrome/Edge/Brave) and microphone access, and —
like the browser STT/TTS options it's built on — routes audio through your browser's
built-in speech engine, which is not purely local. If full offline/local wake-word
detection matters to you, that's a great area to contribute (see
[CONTRIBUTING.md](CONTRIBUTING.md)); the local/endpoint STT and TTS providers Aysh already
ships (Whisper, Kokoro-82M, OpenAI-compatible endpoints) are unaffected either way and can
be swapped in once you're past the wake word.

## Features

- **🎙️ Voice Assistant** — say "Aysh" to wake it, talk hands-free, say "sleep Aysh" to stop.
- **Chat + Agents** — local/API models, tools, MCP, files, shell, skills, and memory.
- **Cookbook** — hardware-aware model recommendations, downloads, and serving.
- **Deep Research** — multi-step web research with source reading and report generation.
- **Compare** — blind side-by-side model testing and synthesis.
- **Documents** — writing-first editor with AI edits, suggestions, Markdown, HTML, CSV, and syntax highlighting.
- **Email** — IMAP/SMTP inbox with triage, tags, summaries, reminders, and reply drafts.
- **Notes, Tasks + Calendar** — reminders, todos, scheduled agent tasks, and CalDAV sync.
- **Extras** — gallery/image editor, themes, uploads, web search, presets, sessions, and 2FA.

## Demo

A full hover-to-play tour lives on the landing page: [`docs/index.html`](docs/index.html).

## Contributing

Help is welcome. Fresh-install testing, provider setup bugs, mobile/editor polish, docs,
small focused refactors — and especially a local/offline wake-word engine to replace the
browser-based one — are all great entry points. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[ROADMAP.md](ROADMAP.md).

## Security

Aysh is a self-hosted workspace with powerful local tools. Keep auth enabled, keep private data out of Git, and do not expose raw model/service ports publicly. Deployment details are in the [setup guide](docs/setup.md#security-notes).

## License

AGPL-3.0-or-later -- see [LICENSE](LICENSE) and [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

Aysh is a fork of [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) and keeps
its AGPL-3.0-or-later license, as required. If you use or build on Aysh, consider checking
out and starring the original project too.
