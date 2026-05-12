import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { PushEvent, TrackedRun, WorkflowRun } from './types';
import { GitHubClient } from './githubClient';

const TERMINAL = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral']);
const NO_RUNS_TIMEOUT_MS = 90_000; // give up waiting for runs to appear after 90s

export declare interface WorkflowPoller {
  on(event: 'update',   listener: (snap: { event: PushEvent; runs: TrackedRun[] }) => void): this;
  on(event: 'complete', listener: (snap: { event: PushEvent; runs: TrackedRun[]; passed: boolean }) => void): this;
  on(event: 'error',    listener: (e: { event: PushEvent; err: unknown }) => void): this;
}

export class WorkflowPoller extends EventEmitter {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private snapshots = new Map<string, TrackedRun[]>(); // sha-key → latest runs

  constructor(private client: GitHubClient) { super(); }

  startTracking(event: PushEvent) {
    const key = `${event.owner}/${event.repo}@${event.sha}`;
    if (this.timers.has(key)) return;
    this.poll(event, key, Date.now());
  }

  getSnapshot(key: string): TrackedRun[] | undefined {
    return this.snapshots.get(key);
  }

  getAllSnapshots(): Map<string, TrackedRun[]> {
    return this.snapshots;
  }

  private async poll(event: PushEvent, key: string, startTime: number) {
    try {
      const runs = await this.client.getRunsForSha(event.owner, event.repo, event.sha);
      const elapsed = Date.now() - startTime;

      if (runs.length === 0) {
        if (elapsed > NO_RUNS_TIMEOUT_MS) {
          this.timers.delete(key);
          return; // no workflows for this push
        }
        this.schedule(event, key, startTime, 5_000);
        return;
      }

      const trackedRuns: TrackedRun[] = await Promise.all(
        runs.map(async (run): Promise<TrackedRun> => {
          const needJobs = run.status === 'in_progress' || run.status === 'completed';
          const jobs = needJobs
            ? await this.client.getJobsForRun(event.owner, event.repo, run.id).catch(() => [])
            : [];
          return { owner: event.owner, repo: event.repo, run: run as WorkflowRun, jobs };
        })
      );

      this.snapshots.set(key, trackedRuns);
      this.emit('update', { event, runs: trackedRuns });

      const allDone = runs.every(r => r.status === 'completed');
      if (allDone) {
        this.timers.delete(key);
        const passed = runs.every(r => !r.conclusion || r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral');
        this.emit('complete', { event, runs: trackedRuns, passed });
        return;
      }

      const interval = elapsed > (this.backoffMinutes() * 60_000) ? 30_000 : this.intervalMs();
      this.schedule(event, key, startTime, interval);
    } catch (err) {
      this.emit('error', { event, err });
      this.schedule(event, key, startTime, 15_000);
    }
  }

  private schedule(event: PushEvent, key: string, startTime: number, ms: number) {
    const t = setTimeout(() => this.poll(event, key, startTime), ms);
    this.timers.set(key, t);
  }

  private intervalMs(): number {
    const cfg = vscode.workspace.getConfiguration('actionsBell');
    return (cfg.get('polling.intervalSeconds', 10) as number) * 1_000;
  }

  private backoffMinutes(): number {
    const cfg = vscode.workspace.getConfiguration('actionsBell');
    return cfg.get('polling.backoffAfterMinutes', 5) as number;
  }

  stopAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  dispose() { this.stopAll(); }
}
