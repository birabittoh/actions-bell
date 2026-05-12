import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { TrackedRun, Artifact } from '../types';
import { GitHubClient } from '../githubClient';

export class ArtifactPanel {
  static open(context: vscode.ExtensionContext, client: GitHubClient, tracked: TrackedRun) {
    const panel = vscode.window.createWebviewPanel(
      'actionsBellArtifacts',
      `Artifacts: ${tracked.run.name ?? 'Workflow'}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const nonce = crypto.randomBytes(16).toString('hex');

    // Load artifacts then render
    client.getArtifacts(tracked.owner, tracked.repo, tracked.run.id).then(artifacts => {
      panel.webview.html = buildHtml(nonce, tracked, artifacts);
    }).catch(err => {
      panel.webview.html = errorHtml(nonce, err.message);
    });

    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'download': {
          await handleDownload(client, tracked, msg.artifactId, msg.artifactName, panel);
          break;
        }
        case 'preview': {
          await handlePreview(client, tracked, msg.artifactId, msg.artifactName, panel, context);
          break;
        }
        case 'openInGitHub':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    }, undefined, context.subscriptions);
  }
}

async function handleDownload(
  client: GitHubClient,
  tracked: TrackedRun,
  artifactId: number,
  artifactName: string,
  panel: vscode.WebviewPanel,
) {
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${artifactName}.zip`),
    filters: { 'ZIP Archive': ['zip'] },
  });
  if (!saveUri) return;

  panel.webview.postMessage({ type: 'downloadStarted', artifactId });
  try {
    const buf = await client.downloadArtifactZip(tracked.owner, tracked.repo, artifactId);
    fs.writeFileSync(saveUri.fsPath, buf);
    panel.webview.postMessage({ type: 'downloadDone', artifactId });
    const open = await vscode.window.showInformationMessage(
      `Saved ${artifactName}.zip`, 'Reveal in Explorer'
    );
    if (open) vscode.commands.executeCommand('revealFileInOS', saveUri);
  } catch (err: any) {
    panel.webview.postMessage({ type: 'downloadError', artifactId, message: err.message });
    vscode.window.showErrorMessage(`Download failed: ${err.message}`);
  }
}

async function handlePreview(
  client: GitHubClient,
  tracked: TrackedRun,
  artifactId: number,
  artifactName: string,
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
) {
  panel.webview.postMessage({ type: 'previewLoading', artifactId });
  try {
    const buf = await client.downloadArtifactZip(tracked.owner, tracked.repo, artifactId);
    const zip = await JSZip.loadAsync(buf);
    const entries: Array<{ name: string; size: number; isText: boolean }> = [];

    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const raw = await file.async('uint8array');
      const isText = isTextFile(name, raw);
      entries.push({ name, size: raw.length, isText });
    }

    panel.webview.postMessage({ type: 'previewContents', artifactId, entries });

    // Handle open-file requests from the preview listing
    panel.webview.onDidReceiveMessage(async msg2 => {
      if (msg2.type !== 'openFile' || msg2.artifactId !== artifactId) return;
      const file = zip.file(msg2.fileName);
      if (!file) return;
      const content = await file.async('string');
      const tmpPath = path.join(context.globalStorageUri.fsPath, artifactName, msg2.fileName);
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, content, 'utf8');
      vscode.window.showTextDocument(vscode.Uri.file(tmpPath), { preview: true });
    });
  } catch (err: any) {
    panel.webview.postMessage({ type: 'previewError', artifactId, message: err.message });
  }
}

function isTextFile(name: string, data: Uint8Array): boolean {
  const textExts = /\.(txt|log|json|xml|yaml|yml|md|csv|sh|py|js|ts|html|css|toml|ini|env|out)$/i;
  if (textExts.test(name)) return true;
  // Heuristic: if first 512 bytes are all printable ASCII → text
  const sample = data.slice(0, 512);
  return sample.every(b => (b >= 0x09 && b <= 0x0d) || (b >= 0x20 && b <= 0x7e));
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(nonce: string, tracked: TrackedRun, artifacts: Artifact[]): string {
  const runUrl = tracked.run.html_url;
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
  padding: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
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
.content { padding: 14px; }
.empty { padding: 20px; opacity: 0.7; font-style: italic; }
.artifact {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  margin-bottom: 10px;
  overflow: hidden;
}
.artifact-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--vscode-sideBar-background);
}
.artifact-name { font-weight: 600; flex: 1; }
.artifact-meta { font-size: 11px; opacity: 0.7; }
.artifact-actions { display: flex; gap: 6px; }
.artifact-body { padding: 8px 14px; font-size: 12px; }
.file-list { margin-top: 8px; }
.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
}
.file-link {
  color: var(--vscode-textLink-foreground);
  cursor: pointer;
  text-decoration: underline;
  background: none;
  border: none;
  font: inherit;
  padding: 0;
  text-align: left;
}
.file-link:hover { color: var(--vscode-textLink-activeForeground); }
.file-size { opacity: 0.6; margin-left: auto; flex-shrink: 0; }
.status { font-size: 11px; opacity: 0.7; padding: 4px 0; }
.expired { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div class="toolbar">
  <h2>Artifacts — ${escHtml(tracked.run.name ?? 'Workflow')}</h2>
  <button class="btn btn-secondary" id="btn-github" data-url="${escHtml(runUrl)}">Open in GitHub ↗</button>
</div>
<div class="content">
${artifacts.length === 0
  ? '<div class="empty">No artifacts for this run.</div>'
  : artifacts.map(a => `
<div class="artifact" id="artifact-${a.id}">
  <div class="artifact-header">
    <span>📦</span>
    <span class="artifact-name">${escHtml(a.name)}</span>
    <span class="artifact-meta">${fmtSize(a.size_in_bytes)}</span>
    <span class="artifact-meta ${a.expired ? 'expired' : ''}">
      ${a.expired ? 'Expired' : `Expires in ${daysUntil(a.expires_at)}d`}
    </span>
    <div class="artifact-actions">
      <button class="btn btn-secondary preview-btn" data-id="${a.id}" data-name="${escHtml(a.name)}" ${a.expired ? 'disabled' : ''}>Preview</button>
      <button class="btn download-btn" data-id="${a.id}" data-name="${escHtml(a.name)}" ${a.expired ? 'disabled' : ''}>Download ZIP</button>
    </div>
  </div>
  <div class="artifact-body" id="body-${a.id}"></div>
</div>`).join('')}
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function download(id, name) {
  vscode.postMessage({ type: 'download', artifactId: id, artifactName: name });
}

function preview(id, name) {
  vscode.postMessage({ type: 'preview', artifactId: id, artifactName: name });
  document.getElementById('body-' + id).innerHTML = '<div class="status">Loading contents…</div>';
}

function openFile(artifactId, fileName) {
  vscode.postMessage({ type: 'openFile', artifactId, fileName });
}

function openGitHub(url) {
  vscode.postMessage({ type: 'openInGitHub', url });
}

document.getElementById('btn-github').addEventListener('click', function() { openGitHub(this.dataset.url); });
document.addEventListener('click', e => {
  const btn = e.target.closest('.preview-btn, .download-btn');
  if (!btn || btn.disabled) return;
  const id = +btn.dataset.id, name = btn.dataset.name;
  if (btn.classList.contains('preview-btn')) preview(id, name);
  else download(id, name);
});

window.addEventListener('message', e => {
  const msg = e.data;
  const body = msg.artifactId ? document.getElementById('body-' + msg.artifactId) : null;

  if (msg.type === 'downloadStarted' && body) {
    body.innerHTML = '<div class="status">Downloading…</div>';
  }
  if (msg.type === 'downloadDone' && body) {
    body.innerHTML = '<div class="status">✅ Saved.</div>';
    setTimeout(() => { if (body) body.innerHTML = ''; }, 3000);
  }
  if (msg.type === 'downloadError' && body) {
    body.innerHTML = \`<div class="status expired">❌ \${escHtml(msg.message)}</div>\`;
  }
  if (msg.type === 'previewLoading' && body) {
    body.innerHTML = '<div class="status">Loading contents…</div>';
  }
  if (msg.type === 'previewContents' && body) {
    if (!msg.entries.length) {
      body.innerHTML = '<div class="status">Empty archive.</div>';
      return;
    }
    body.innerHTML = '<div class="file-list">' +
      msg.entries.map(f => \`<div class="file-item">
        \${f.isText
          ? \`<button class="file-link" onclick="openFile(\${msg.artifactId}, '\${escHtml(f.name)}')">\${escHtml(f.name)}</button>\`
          : \`<span>\${escHtml(f.name)}</span>\`}
        <span class="file-size">\${fmtSize(f.size)}</span>
      </div>\`).join('') + '</div>';
  }
  if (msg.type === 'previewError' && body) {
    body.innerHTML = \`<div class="status expired">❌ \${escHtml(msg.message)}</div>\`;
  }
});
</script>
</body>
</html>`;
}

function errorHtml(nonce: string, message: string): string {
  return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">body{font-family:sans-serif;padding:20px;color:var(--vscode-errorForeground)}</style>
</head><body><p>Failed to load artifacts: ${escHtml(message)}</p></body></html>`;
}
