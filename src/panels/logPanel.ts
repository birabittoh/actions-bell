import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TrackedRun, WorkflowJob } from '../types';
import { GitHubClient } from '../githubClient';

export class LogPanel {
  static open(context: vscode.ExtensionContext, client: GitHubClient, tracked: TrackedRun, focusJobId?: number) {
    const panel = vscode.window.createWebviewPanel(
      'actionsBellLog',
      `Logs: ${tracked.run.name ?? 'Workflow'}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const nonce = crypto.randomBytes(16).toString('hex');
    panel.webview.html = buildHtml(nonce, tracked, focusJobId);

    // Handle webview → extension messages
    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'loadLog': {
          const { jobId } = msg;
          try {
            panel.webview.postMessage({ type: 'logLoading', jobId });
            const log = await client.getJobLog(tracked.owner, tracked.repo, jobId);
            panel.webview.postMessage({ type: 'logContent', jobId, log });
          } catch (err: any) {
            panel.webview.postMessage({ type: 'logError', jobId, message: err.message });
          }
          break;
        }
        case 'openInGitHub':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        case 'openArtifacts':
          vscode.commands.executeCommand('actionsBell.openArtifacts', { trackedRun: tracked });
          break;
      }
    }, undefined, context.subscriptions);
  }
}

function buildHtml(nonce: string, tracked: TrackedRun, focusJobId?: number): string {
  const jobs = tracked.jobs;
  const runUrl = tracked.run.html_url;
  const initialJobId = focusJobId ?? jobs.find(j => j.conclusion === 'failure')?.id ?? jobs[0]?.id;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
}
.toolbar h2 { font-size: 13px; font-weight: 600; flex: 1; }
.btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 2px;
}
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
.layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.sidebar {
  width: 220px;
  overflow-y: auto;
  border-right: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
  flex-shrink: 0;
}
.job-item {
  padding: 7px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  border-left: 3px solid transparent;
  user-select: none;
}
.job-item:hover { background: var(--vscode-list-hoverBackground); }
.job-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
  border-left-color: var(--vscode-focusBorder);
}
.job-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.job-dur { font-size: 10px; opacity: 0.7; flex-shrink: 0; }
.main {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
.loading { padding: 20px; opacity: 0.7; font-style: italic; }
details.step { border-bottom: 1px solid var(--vscode-panel-border); }
details.step > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 500;
  list-style: none;
  background: var(--vscode-sideBar-background);
}
details.step > summary::-webkit-details-marker { display: none; }
details.step > summary:hover { background: var(--vscode-list-hoverBackground); }
details.step > summary .arrow { font-size: 10px; opacity: 0.7; transition: transform 0.15s; }
details.step[open] > summary .arrow { transform: rotate(90deg); }
.step-dur { font-size: 10px; opacity: 0.6; margin-left: auto; }
pre.step-log {
  margin: 0;
  padding: 4px 12px 4px 32px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
  background: var(--vscode-editor-background);
}
.line { display: block; }
.line.is-error {
  color: var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.08));
}
.line.is-warn { color: var(--vscode-editorWarning-foreground); }
.line.is-cmd  { color: var(--vscode-terminal-ansiBrightBlue, #5fafff); }
.ts { color: var(--vscode-descriptionForeground); font-size: 10px; margin-right: 6px; }
.icon { font-size: 13px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="toolbar">
  <h2 id="runTitle">${escHtml(tracked.run.name ?? 'Workflow')}</h2>
  <button class="btn btn-secondary" id="btn-artifacts">Artifacts</button>
  <button class="btn btn-secondary" id="btn-github" data-url="${escHtml(runUrl)}">Open in GitHub ↗</button>
</div>
<div class="layout">
  <div class="sidebar" id="jobList"></div>
  <div class="main" id="logView"><div class="loading">Select a job to view logs.</div></div>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const jobs = ${JSON.stringify(jobs)};
const initialJobId = ${initialJobId ?? 'null'};
let activeJobId = null;
const logCache = {};

function statusIcon(status, conclusion) {
  if (status === 'in_progress') return '⟳';
  switch (conclusion) {
    case 'success':   return '✅';
    case 'failure':   return '❌';
    case 'cancelled': return '⊘';
    case 'skipped':   return '⏭';
    case 'timed_out': return '⏱';
    default:          return '○';
  }
}

function duration(start, end) {
  if (!start) return '';
  const sec = Math.round((new Date(end || Date.now()) - new Date(start)) / 1000);
  return sec < 60 ? sec + 's' : Math.floor(sec/60) + 'm ' + (sec%60) + 's';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[mGKHFABCDJnsu]/g,'');
}

function renderJobList() {
  const el = document.getElementById('jobList');
  el.innerHTML = jobs.map(j => \`
    <div class="job-item \${j.id === activeJobId ? 'active' : ''}" id="job-\${j.id}" data-job-id="\${j.id}">
      <span class="icon">\${statusIcon(j.status, j.conclusion)}</span>
      <span class="job-name">\${escHtml(j.name)}</span>
      <span class="job-dur">\${duration(j.started_at, j.completed_at)}</span>
    </div>
  \`).join('');
}

function selectJob(jobId) {
  activeJobId = jobId;
  renderJobList();
  if (logCache[jobId]) {
    renderLog(jobId, logCache[jobId]);
  } else {
    document.getElementById('logView').innerHTML = '<div class="loading">Loading log…</div>';
    vscode.postMessage({ type: 'loadLog', jobId });
  }
}

// Parse raw GitHub Actions log text into step sections
function parseLog(raw) {
  const lines = raw.split('\\n');
  const sections = [];
  let cur = null;
  let depth = 0;

  for (const rawLine of lines) {
    const tsMatch = rawLine.match(/^(\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z) (.*)$/);
    const ts = tsMatch ? tsMatch[1].slice(11,19) : ''; // HH:MM:SS
    const content = tsMatch ? tsMatch[2] : rawLine;

    if (content.startsWith('##[group]')) {
      depth++;
      if (depth === 1) {
        if (cur) sections.push(cur);
        cur = { name: content.slice(9), lines: [], hasError: false };
      }
      // nested groups fall through to content rendering below
    } else if (content === '##[endgroup]') {
      if (depth > 0) depth--;
      if (depth === 0 && cur) { sections.push(cur); cur = null; }
    } else if (cur) {
      const isError = content.startsWith('##[error]')
        || /\\berror\\b/i.test(content)
        || /\\bfailed\\b/i.test(content)
        || /Process completed with exit code [^0]/.test(content);
      const isWarn = content.startsWith('##[warning]') || /\\bwarning\\b/i.test(content);
      const isCmd  = content.startsWith('##[command]');
      const text = stripAnsi(content
        .replace(/^##\\[error\\]/, '🔴 ')
        .replace(/^##\\[warning\\]/, '⚠️  ')
        .replace(/^##\\[command\\]/, '$ ')
        .replace(/^##\\[debug\\]/, '🐛 ')
        .replace(/^##\\[section\\]/, '── '));
      if (isError) cur.hasError = true;
      cur.lines.push({ ts, text, isError, isWarn, isCmd });
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

function renderLog(jobId, rawLog) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  const sections = parseLog(rawLog);

  // Correlate sections with API steps by order (GitHub logs group = step)
  const html = sections.map((sec, i) => {
    const apiStep = job.steps?.[i];
    const failed = sec.hasError || apiStep?.conclusion === 'failure';
    const stepDur = apiStep ? duration(apiStep.started_at, apiStep.completed_at) : '';

    const linesHtml = sec.lines.map(l => {
      const cls = l.isError ? 'is-error' : l.isWarn ? 'is-warn' : l.isCmd ? 'is-cmd' : '';
      return \`<span class="line \${cls}"><span class="ts">\${escHtml(l.ts)}</span>\${escHtml(l.text)}</span>\`;
    }).join('');

    return \`<details class="step" \${failed ? 'open' : ''}>
  <summary>
    <span class="arrow">▶</span>
    <span class="icon">\${failed ? '❌' : (apiStep?.conclusion === 'success' ? '✅' : '○')}</span>
    <span>\${escHtml(sec.name)}</span>
    <span class="step-dur">\${escHtml(stepDur)}</span>
  </summary>
  <pre class="step-log">\${linesHtml}</pre>
</details>\`;
  }).join('');

  document.getElementById('logView').innerHTML = html || '<div class="loading">No log sections found.</div>';

  // Scroll first failing section into view
  const firstFail = document.querySelector('details[open]');
  if (firstFail) firstFail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openGitHub(url) {
  vscode.postMessage({ type: 'openInGitHub', url });
}

function openArtifacts() {
  vscode.postMessage({ type: 'openArtifacts' });
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'logContent') {
    logCache[msg.jobId] = msg.log;
    if (msg.jobId === activeJobId) renderLog(msg.jobId, msg.log);
  }
  if (msg.type === 'logError') {
    if (msg.jobId === activeJobId) {
      document.getElementById('logView').innerHTML =
        \`<div class="loading" style="color:var(--vscode-errorForeground)">Failed to load log: \${escHtml(msg.message)}</div>\`;
    }
  }
});

document.getElementById('btn-artifacts').addEventListener('click', openArtifacts);
document.getElementById('btn-github').addEventListener('click', function() { openGitHub(this.dataset.url); });
document.getElementById('jobList').addEventListener('click', e => {
  const item = e.target.closest('[data-job-id]');
  if (item) selectJob(+item.dataset.jobId);
});

// Init
renderJobList();
if (initialJobId) selectJob(initialJobId);
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
