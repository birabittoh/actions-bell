export interface PushEvent {
  workspaceRoot: string;
  owner: string;
  repo: string;
  sha: string;
  branch: string;
}

export type RunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
export type RunConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'neutral' | null;

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: RunStatus | null;
  conclusion: RunConclusion;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_sha: string;
  workflow_id: number;
  run_attempt: number;
}

export interface WorkflowStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps: WorkflowStep[];
  html_url: string;
}

export interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  expires_at: string;
  archive_download_url: string;
}

export interface TrackedRun {
  owner: string;
  repo: string;
  run: WorkflowRun;
  jobs: WorkflowJob[];
}

export interface PollSnapshot {
  event: PushEvent;
  runs: TrackedRun[];
  complete: boolean;
  passed: boolean;
}
