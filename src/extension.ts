import * as vscode from 'vscode';
import { GitWatcher } from './gitWatcher';
import { GitHubClient } from './githubClient';
import { WorkflowPoller } from './workflowPoller';
import { SoundPlayer } from './soundPlayer';
import { StatusProvider } from './statusProvider';
import { LogPanel } from './panels/logPanel';
import { ArtifactPanel } from './panels/artifactPanel';
import { PushEvent, TrackedRun } from './types';

const CTX_TOKEN_SET = 'actionsBell.tokenSet';

async function syncTokenContext(client: GitHubClient) {
  const token = await client.getToken();
  vscode.commands.executeCommand('setContext', CTX_TOKEN_SET, !!token);
}

export function activate(context: vscode.ExtensionContext) {
  const client   = new GitHubClient(context);
  const poller   = new WorkflowPoller(client);
  const sound    = new SoundPlayer(context.extensionPath);
  const provider = new StatusProvider();

  // Sync context key immediately so menus/welcome view render correctly
  syncTokenContext(client);

  const treeView = vscode.window.createTreeView('actionsBell.status', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // ---- poller → UI ----
  poller.on('update', ({ event, runs }: { event: PushEvent; runs: TrackedRun[] }) => {
    provider.updateRuns(event.sha, event.branch, runs);
  });

  poller.on('complete', ({ event, runs, passed }: { event: PushEvent; runs: TrackedRun[]; passed: boolean }) => {
    provider.updateRuns(event.sha, event.branch, runs);

    if (passed) {
      sound.playSuccess();
      vscode.window.showInformationMessage(
        `✅ All workflows passed — ${event.branch}`,
        'View Logs'
      ).then(action => {
        if (action !== 'View Logs') return;
        const first = runs[0];
        if (first) LogPanel.open(context, client, first);
      });
    } else {
      sound.playFailure();
      const failed = runs.filter(r =>
        r.run.conclusion !== 'success' &&
        r.run.conclusion !== 'skipped' &&
        r.run.conclusion !== 'neutral'
      );
      vscode.window.showErrorMessage(
        `❌ ${failed.length} workflow(s) failed — ${event.branch}`,
        'View Logs', 'View Artifacts'
      ).then(action => {
        const target = failed[0] ?? runs[0];
        if (!target) return;
        if (action === 'View Logs')      LogPanel.open(context, client, target);
        if (action === 'View Artifacts') ArtifactPanel.open(context, client, target);
      });
    }
  });

  poller.on('error', ({ event, err }: { event: PushEvent; err: unknown }) => {
    const msg = err instanceof Error ? err.message : String(err);
    // Only surface token errors prominently; others are transient
    if (msg.includes('No GitHub token') || msg.includes('401') || msg.includes('403')) {
      vscode.window.showWarningMessage(`Actions Bell: ${msg}`, 'Set Token').then(async a => {
        if (a === 'Set Token') await client.promptForToken();
        syncTokenContext(client);
      });
    } else {
      console.error('[Actions Bell] poll error:', msg);
    }
  });

  // ---- git push detection ----
  const gitWatcher = new GitWatcher(context);
  gitWatcher.on('push', (event: PushEvent) => {
    vscode.window.setStatusBarMessage(
      `$(sync~spin) Actions Bell: tracking workflows for ${event.branch}…`,
      8_000
    );
    poller.startTracking(event);
  });

  // ---- commands ----
  context.subscriptions.push(
    treeView,
    gitWatcher,
    poller,
    sound,

    vscode.commands.registerCommand('actionsBell.setToken', async () => {
      await client.promptForToken();
      syncTokenContext(client);
    }),
    vscode.commands.registerCommand('actionsBell.clearToken', async () => {
      await client.clearToken();
      syncTokenContext(client);
    }),
    vscode.commands.registerCommand('actionsBell.refresh',   () => provider.refresh()),

    vscode.commands.registerCommand('actionsBell.openLogs', (node: any) => {
      // node can be a RunNode or JobNode from the tree, or a direct TrackedRun
      const tracked: TrackedRun | undefined = node?.tracked ?? node?.trackedRun;
      const focusJobId: number | undefined  = node?.kind === 'job' ? node.job?.id : undefined;
      if (tracked) LogPanel.open(context, client, tracked, focusJobId);
    }),

    vscode.commands.registerCommand('actionsBell.openArtifacts', (node: any) => {
      const tracked: TrackedRun | undefined = node?.tracked ?? node?.trackedRun;
      if (tracked) ArtifactPanel.open(context, client, tracked);
    }),

    vscode.commands.registerCommand('actionsBell.openInGitHub', (node: any) => {
      const url: string | undefined = node?.tracked?.run?.html_url ?? node?.job?.html_url;
      if (url) vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );
}

export function deactivate() {}
