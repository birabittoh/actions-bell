import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { WorkflowRun, WorkflowJob, Artifact } from './types';

const SECRET_KEY = 'actionsBell.githubToken';

export class GitHubClient {
  private octokit: Octokit | null = null;

  constructor(private context: vscode.ExtensionContext) {}

  private async kit(): Promise<Octokit> {
    if (this.octokit) return this.octokit;
    let token = await this.context.secrets.get(SECRET_KEY);
    if (!token) token = await this.promptForToken();
    if (!token) throw new Error('No GitHub token. Run "Actions Bell: Set GitHub Token".');
    this.octokit = new Octokit({ auth: token });
    return this.octokit;
  }

  async promptForToken(): Promise<string | undefined> {
    const token = await vscode.window.showInputBox({
      title: 'Actions Bell: GitHub Personal Access Token',
      prompt: 'Needs repo and workflow read scopes',
      placeHolder: 'ghp_...',
      password: true,
      ignoreFocusOut: true,
    });
    if (token) {
      await this.context.secrets.store(SECRET_KEY, token);
      this.octokit = null;
    }
    return token;
  }

  async clearToken() {
    await this.context.secrets.delete(SECRET_KEY);
    this.octokit = null;
    vscode.window.showInformationMessage('Actions Bell: GitHub token cleared.');
  }

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  async getRunsForSha(owner: string, repo: string, sha: string): Promise<WorkflowRun[]> {
    const k = await this.kit();
    const { data } = await k.actions.listWorkflowRunsForRepo({ owner, repo, head_sha: sha, per_page: 50 });
    return data.workflow_runs as WorkflowRun[];
  }

  async getJobsForRun(owner: string, repo: string, runId: number): Promise<WorkflowJob[]> {
    const k = await this.kit();
    const { data } = await k.actions.listJobsForWorkflowRun({ owner, repo, run_id: runId, per_page: 100, filter: 'latest' });
    return data.jobs as WorkflowJob[];
  }

  async getJobLog(owner: string, repo: string, jobId: number): Promise<string> {
    const k = await this.kit();
    // Returns a redirect; Octokit follows it and returns the raw text
    const resp = await k.actions.downloadJobLogsForWorkflowRun({ owner, repo, job_id: jobId });
    return resp.data as unknown as string;
  }

  async getArtifacts(owner: string, repo: string, runId: number): Promise<Artifact[]> {
    const k = await this.kit();
    const { data } = await k.actions.listWorkflowRunArtifacts({ owner, repo, run_id: runId, per_page: 100 });
    return data.artifacts as Artifact[];
  }

  async downloadArtifactZip(owner: string, repo: string, artifactId: number): Promise<Buffer> {
    const k = await this.kit();
    const resp = await k.actions.downloadArtifact({ owner, repo, artifact_id: artifactId, archive_format: 'zip' });
    return Buffer.from(resp.data as ArrayBuffer);
  }
}
