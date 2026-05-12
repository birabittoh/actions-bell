import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { PushEvent } from './types';

// Minimal slices of the vscode.git extension API we need
interface GitExtension { getAPI(version: 1): GitAPI; }
interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
}
interface Repository {
  rootUri: vscode.Uri;
  state: RepositoryState;
}
interface RepositoryState {
  HEAD: { name?: string; commit?: string; upstream?: { name: string; remote: string; commit?: string } } | undefined;
  remotes: Array<{ name: string; fetchUrl?: string; pushUrl?: string }>;
}

export declare interface GitWatcher {
  on(event: 'push', listener: (e: PushEvent) => void): this;
  emit(event: 'push', e: PushEvent): boolean;
}

export class GitWatcher extends EventEmitter implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private knownRefs = new Map<string, string>(); // absPath → sha

  constructor(private context: vscode.ExtensionContext) {
    super();
    this.init().catch(err => console.error('[Actions Bell] GitWatcher init failed:', err));
  }

  private async init() {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) return;
    const gitExt: GitExtension = ext.isActive ? ext.exports : await ext.activate();
    const api = gitExt.getAPI(1);

    for (const repo of api.repositories) this.watchRepo(repo);
    api.onDidOpenRepository(repo => this.watchRepo(repo), undefined, this.context.subscriptions);
  }

  private watchRepo(repo: Repository) {
    const root = repo.rootUri.fsPath;
    const pattern = new vscode.RelativePattern(root, '.git/refs/remotes/**');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handler = (uri: vscode.Uri) => this.handleRefChange(uri, repo);
    watcher.onDidChange(handler, undefined, this.context.subscriptions);
    watcher.onDidCreate(handler, undefined, this.context.subscriptions);
    this.watchers.push(watcher);
    this.context.subscriptions.push(watcher);

    this.seedKnownRefs(root);
  }

  private seedKnownRefs(root: string) {
    const remotesDir = path.join(root, '.git', 'refs', 'remotes');
    if (!fs.existsSync(remotesDir)) return;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) { walk(full); continue; }
        try { this.knownRefs.set(full, fs.readFileSync(full, 'utf8').trim()); } catch { /* ignore */ }
      }
    };
    walk(remotesDir);
  }

  private handleRefChange(uri: vscode.Uri, repo: Repository) {
    try {
      const filePath = uri.fsPath;
      const newSha = fs.readFileSync(filePath, 'utf8').trim();
      const oldSha = this.knownRefs.get(filePath);
      if (newSha === oldSha) return;
      this.knownRefs.set(filePath, newSha);
      if (!oldSha) return; // initial seeding, not a real push

      // Only fire when the pushed SHA matches local HEAD (our push, not a fetch)
      const headCommit = repo.state.HEAD?.commit;
      if (headCommit && headCommit !== newSha) return;

      const parsed = this.parsePath(filePath);
      if (!parsed) return;

      const remote = repo.state.remotes.find(r => r.name === parsed.remoteName)
        ?? repo.state.remotes[0];
      const remoteUrl = remote?.pushUrl ?? remote?.fetchUrl;
      if (!remoteUrl) return;

      const gh = parseGitHubUrl(remoteUrl);
      if (!gh) return;

      const event: PushEvent = {
        workspaceRoot: repo.rootUri.fsPath,
        owner: gh.owner,
        repo: gh.repo,
        sha: newSha,
        branch: parsed.branch,
      };
      this.emit('push', event);
    } catch { /* ignore transient read errors */ }
  }

  private parsePath(filePath: string): { remoteName: string; branch: string } | null {
    const marker = `${path.sep}.git${path.sep}refs${path.sep}remotes${path.sep}`;
    const idx = filePath.indexOf(marker);
    if (idx === -1) return null;
    const rel = filePath.slice(idx + marker.length); // "origin/main" or "origin/feat/foo"
    const firstSep = rel.indexOf(path.sep);
    if (firstSep === -1) return null;
    return {
      remoteName: rel.slice(0, firstSep),
      branch: rel.slice(firstSep + 1).replace(/\\/g, '/'),
    };
  }

  dispose() {
    this.watchers.forEach(w => w.dispose());
  }
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\s|$)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
