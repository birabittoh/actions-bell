# Actions Bell

VS Code extension that watches for `git push`, tracks GitHub Actions workflows automatically, and plays a sound when they finish.

[![CI](https://github.com/birabittoh/actions-bell/actions/workflows/ci.yml/badge.svg)](https://github.com/birabittoh/actions-bell/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/birabittoh/actions-bell)](https://github.com/birabittoh/actions-bell/releases/latest)

## Install

### Latest stable release

Download the `.vsix` from the [latest release](https://github.com/birabittoh/actions-bell/releases/latest), then:

```
Extensions → ⋯ → Install from VSIX…
```

or via CLI:

```bash
code --install-extension actions-bell-*.vsix
```

### Nightly build

Built from every push to `main`.

**[⬇ Browse nightly builds](https://nightly.link/birabittoh/actions-bell/workflows/ci/main)**

Each artifact is named `actions-bell_YYYYMMDD_HHMMSS_<sha>`. Pick the latest, unzip it (nightly.link wraps artifacts in an extra ZIP), then install the `.vsix` inside.

## Setup

On first use, run:

```
Ctrl+Shift+P → Actions Bell: Set GitHub Token
```

Provide a [Personal Access Token](https://github.com/settings/tokens) with **repo** and **workflow** read scopes (`repo:status`, `actions:read`). The token is stored in VS Code's secret storage.

## Features

- **Auto-detects pushes** by watching `.git/refs/remotes/` — no manual trigger needed
- **Polls workflows** every 10 s, backing off to 30 s after 5 minutes
- **Sound on completion** — success and failure tones (disabled by default)
- **Sidebar tree** — push → workflows → jobs → steps, all with live status icons
- **Log viewer** — steps collapsed by default, failing step auto-expanded, error lines highlighted
- **Artifact browser** — list artifacts, download ZIP, or preview text files directly in the editor

## Configuration

| Setting | Default | Description |
|---|---|---|
| `actionsBell.sound.enabled` | `false` | Play sound on workflow completion |
| `actionsBell.sound.successCommand` | `""` | Custom shell command for success sound |
| `actionsBell.sound.failureCommand` | `""` | Custom shell command for failure sound |
| `actionsBell.polling.intervalSeconds` | `10` | Polling interval in seconds |
| `actionsBell.polling.backoffAfterMinutes` | `5` | Switch to 30 s polling after this many minutes |

WSL2 users get Windows system sounds (`Asterisk` / `Exclamation`) with no extra setup.

## Build from source

```bash
git clone https://github.com/birabittoh/actions-bell
cd actions-bell
npm install
make package        # produces actions-bell-*.vsix
make install        # package + install into VS Code
```
