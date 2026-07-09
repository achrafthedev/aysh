<p align="center">
  <img src="docs/aysh-wordmark.svg" alt="Aysh" width="280">
</p>

<p align="center">
  A self-hosted AI workspace for chat, agents, research, documents, email, notes, and calendar —
  with a Jarvis-style wake word so you can just <em>talk</em> to it.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0-or-later" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg"></a>
  <a href="https://github.com/achrafthedev/aysh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/achrafthedev/aysh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/pewdiepie-archdaemon/odysseus"><img alt="Fork of Odysseus" src="https://img.shields.io/badge/fork%20of-Odysseus-8b5cf6.svg"></a>
  <a href="https://github.com/achrafthedev/aysh/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/achrafthedev/aysh?color=ec4899"></a>
</p>

<p align="center">
  <a href="#quick-start"><b>Quick Start</b></a> ·
  <a href="#voice-assistant"><b>Voice Assistant</b></a> ·
  <a href="#features"><b>Features</b></a> ·
  <a href="docs/setup.md"><b>Setup Guide</b></a> ·
  <a href="CONTRIBUTING.md"><b>Contributing</b></a> ·
  <a href="ROADMAP.md"><b>Roadmap</b></a>
</p>

<br>

> **Aysh** is a fork of [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) — the
> excellent self-hosted AI workspace originally released by PewDiePie. This fork rebrands the
> project and adds a hands-free, always-listening voice assistant on top. Everything else —
> chat, agents, research, documents, email, notes, calendar, Cookbook — is Odysseus's
> architecture, carried forward under the same AGPL-3.0-or-later license. Full credit and a
> huge thank-you to the upstream project; see [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for
> the complete attribution.

---

## Quick Start

```bash
git clone https://github.com/achrafthedev/aysh.git
cd aysh
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:7000` when the containers are healthy. The first admin password is printed in `docker compose logs aysh`.

Native installs, GPU notes, Windows/macOS instructions, HTTPS, and configuration live in the [setup guide](docs/setup.md).

<details>
<summary><b>🐧 Linux: launch it from your applications menu instead</b></summary>
<br>

If you'd rather have Aysh as a proper app icon than a terminal command:

```bash
./desktop/install-linux.sh
```

This sets up a native (non-Docker) venv and adds an "Aysh" entry to your applications
menu with its own icon. The server only starts on demand, the first time you open it
from the menu — nothing is installed to run at boot or login.

</details>

---

<a id="voice-assistant"></a>
## 🎙️ Voice Assistant — say "Aysh"

Aysh can listen for its own name, the way Jarvis listens for "Sir." Turn it on in
**Settings → AI → Voice Assistant** and a small orb appears in the corner of the window:

| You do | Aysh does |
|---|---|
| Say **"Aysh"** | Wakes up (a short chime + "Yes?") and listens for what you want |
| Just talk | Sends your sentence as a chat message and reads the reply back out loud |
| Say **"sleep Aysh"** (or go quiet ~15s) | Goes back to sleep — keeps a low-power ear out for the wake word only |
| Click the orb | Arms / disarms it manually, any time |

The wake word and sleep phrase are both configurable — rename your assistant, change the
phrase, whatever you like.

It keeps the microphone open in your browser tab and transcribes through **Aysh's own
Speech-to-Text provider** — Local (Whisper) or an API endpoint, picked right there in the
Voice Assistant settings card — instead of a browser vendor's cloud speech service. That
also means it works the same in any browser with microphone access, not just Chrome/Edge:
browser-native speech recognition (the obvious first approach) depends on a Google cloud
key that only some Chromium builds ship, so it silently fails on Brave and plain Chromium.
Pick **Local (Whisper)** for a fully offline setup, or an API endpoint if you'd rather not
run Whisper locally. Replies are read back with your Text-to-Speech setting, same as
everywhere else in Aysh — and the same browser-vendor caveat applies there too: browser TTS
(`window.speechSynthesis`) often has zero voices available on non-Google Chromium builds
(Brave, plain Chromium), so if replies stay silent, switch **Settings → AI → Text to
Speech** to **Local (Kokoro-82M, needs an NVIDIA/CUDA GPU)** or an API endpoint instead of
Browser.

---

## Features

| | |
|---|---|
| 🎙️ **Voice Assistant** | Say "Aysh" to wake it, talk hands-free, say "sleep Aysh" to stop. |
| 💬 **Chat + Agents** | Local/API models, tools, MCP, files, shell, skills, and memory. |
| 📖 **Cookbook** | Hardware-aware model recommendations, downloads, and serving. |
| 🔎 **Deep Research** | Multi-step web research with source reading and report generation. |
| ⚖️ **Compare** | Blind side-by-side model testing and synthesis. |
| 📝 **Documents** | Writing-first editor with AI edits, suggestions, Markdown, HTML, CSV, and syntax highlighting. |
| 📧 **Email** | IMAP/SMTP inbox with triage, tags, summaries, reminders, and reply drafts. |
| ✅ **Notes, Tasks + Calendar** | Reminders, todos, scheduled agent tasks, and CalDAV sync. |
| ✨ **Extras** | Gallery/image editor, themes, uploads, web search, presets, sessions, and 2FA. |

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

AGPL-3.0-or-later — see [LICENSE](LICENSE) and [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

Aysh is a fork of [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) and keeps
its AGPL-3.0-or-later license, as required. If you use or build on Aysh, consider checking
out and starring the original project too.
