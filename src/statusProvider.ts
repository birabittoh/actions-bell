import * as vscode from 'vscode';
import { TrackedRun, WorkflowJob, WorkflowStep } from './types';

// ------ node types ------
type TreeNode = PushNode | RunNode | JobNode | StepNode;

interface PushNode { kind: 'push'; sha: string; branch: string; runs: TrackedRun[] }
interface RunNode  { kind: 'run';  tracked: TrackedRun; sha: string }
interface JobNode  { kind: 'job';  job: WorkflowJob; tracked: TrackedRun }
interface StepNode { kind: 'step'; step: WorkflowStep; job: WorkflowJob; tracked: TrackedRun }

// ------ icons ------
function conclusionIcon(status: string | null, conclusion: string | null): vscode.ThemeIcon {
  if (status === 'in_progress') return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
  if (status === 'queued' || status === 'waiting') return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
  switch (conclusion) {
    case 'success':  return new vscode.ThemeIcon('pass',    new vscode.ThemeColor('charts.green'));
    case 'failure':  return new vscode.ThemeIcon('error',   new vscode.ThemeColor('charts.red'));
    case 'cancelled':return new vscode.ThemeIcon('circle-slash');
    case 'skipped':  return new vscode.ThemeIcon('debug-step-over');
    case 'timed_out':return new vscode.ThemeIcon('watch',   new vscode.ThemeColor('charts.red'));
    default:         return new vscode.ThemeIcon('circle-outline');
  }
}

function durationLabel(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '';
  const end = completedAt ? new Date(completedAt) : new Date();
  const sec = Math.round((end.getTime() - new Date(startedAt).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export class StatusProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // sha-key → runs, ordered newest-first
  private data = new Map<string, { sha: string; branch: string; runs: TrackedRun[] }>();

  updateRuns(sha: string, branch: string, runs: TrackedRun[]) {
    this.data.set(sha, { sha, branch, runs });
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  getFirstItem(): TreeNode | undefined {
    const first = this.data.values().next().value;
    return first ? { kind: 'push', sha: first.sha, branch: first.branch, runs: first.runs } : undefined;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'push': {
        const anyRunning = node.runs.some(r => r.run.status !== 'completed');
        const anyFailed  = node.runs.some(r => r.run.conclusion === 'failure' || r.run.conclusion === 'timed_out');
        const item = new vscode.TreeItem(
          `${node.branch} @ ${node.sha.slice(0, 7)}`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = anyRunning
          ? new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'))
          : anyFailed
            ? new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
            : new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
        item.contextValue = 'push';
        item.tooltip = `Push ${node.sha}`;
        return item;
      }
      case 'run': {
        const r = node.tracked.run;
        const hasJobs = node.tracked.jobs.length > 0;
        const item = new vscode.TreeItem(
          r.name ?? 'Workflow',
          hasJobs ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = conclusionIcon(r.status, r.conclusion);
        item.description = r.status === 'completed'
          ? (r.conclusion ?? '')
          : (r.status ?? '');
        item.contextValue = 'run';
        item.tooltip = r.html_url;
        item.command = { command: 'actionsBell.openLogs', title: 'View Logs', arguments: [node] };
        return item;
      }
      case 'job': {
        const j = node.job;
        const hasSteps = j.steps?.length > 0;
        const item = new vscode.TreeItem(
          j.name,
          hasSteps ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = conclusionIcon(j.status, j.conclusion);
        item.description = durationLabel(j.started_at, j.completed_at);
        item.contextValue = 'job';
        item.tooltip = j.html_url;
        item.command = { command: 'actionsBell.openLogs', title: 'View Logs', arguments: [node] };
        return item;
      }
      case 'step': {
        const s = node.step;
        const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
        item.iconPath = conclusionIcon(s.status, s.conclusion);
        item.description = durationLabel(s.started_at, s.completed_at);
        item.contextValue = 'step';
        return item;
      }
    }
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      // roots: one PushNode per tracked push, newest first
      return [...this.data.values()].reverse().map(d => ({
        kind: 'push',
        sha: d.sha,
        branch: d.branch,
        runs: d.runs,
      } satisfies PushNode));
    }
    switch (node.kind) {
      case 'push':
        return node.runs.map(t => ({ kind: 'run', tracked: t, sha: node.sha } satisfies RunNode));
      case 'run':
        return node.tracked.jobs.map(j => ({ kind: 'job', job: j, tracked: node.tracked } satisfies JobNode));
      case 'job':
        return (node.job.steps ?? []).map(s => ({ kind: 'step', step: s, job: node.job, tracked: node.tracked } satisfies StepNode));
      case 'step':
        return [];
    }
  }
}
