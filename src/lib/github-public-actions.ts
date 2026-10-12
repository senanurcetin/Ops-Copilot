export type PublicWorkflowRun = {
  id: number;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
};

export type PublicActionsSummary = {
  repository: string;
  total_matching_runs: number;
  inspected_runs: number;
  successful_runs: number;
  failed_runs: number;
  pending_runs: number;
  runs: PublicWorkflowRun[];
  scope_note: string;
};

export function parsePublicRepository(value: unknown): [string, string] {
  if (typeof value !== 'string' || value.length > 200 ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('Use a public GitHub repository in owner/name format.');
  }
  const parts = value.split('/') as [string, string];
  if (parts.some(part => part === '.' || part === '..' || part.length > 100)) {
    throw new Error('Use a valid public repository.');
  }
  return parts;
}

export function summarizePublicActions(repository: string, payload: unknown): PublicActionsSummary {
  parsePublicRepository(repository);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected GitHub API response.');
  }
  const data = payload as { total_count?: unknown; workflow_runs?: unknown };
  if (typeof data.total_count !== 'number' || !Number.isSafeInteger(data.total_count) || data.total_count < 0 ||
      !Array.isArray(data.workflow_runs)) {
    throw new Error('Unexpected GitHub API response.');
  }
  const runs: PublicWorkflowRun[] = data.workflow_runs.slice(0, 10).map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid workflow run.');
    const run = item as Partial<PublicWorkflowRun>;
    if (typeof run.id !== 'number' || !Number.isSafeInteger(run.id) || typeof run.name !== 'string' ||
        typeof run.status !== 'string' || typeof run.event !== 'string' ||
        (run.conclusion !== null && typeof run.conclusion !== 'string') ||
        typeof run.created_at !== 'string' || typeof run.html_url !== 'string') {
      throw new Error('Invalid workflow run.');
    }
    const expected = 'https://github.com/' + repository + '/actions/runs/' + run.id;
    if (run.html_url !== expected) throw new Error('Unexpected run URL.');
    return {
      id: run.id as number,
      name: run.name,
      status: run.status,
      event: run.event,
      conclusion: run.conclusion,
      created_at: run.created_at,
      html_url: expected,
    };
  });
  const failed = runs.filter(r => r.conclusion === 'failure').length;
  const successful = runs.filter(r => r.conclusion === 'success').length;
  return {
    repository,
    total_matching_runs: data.total_count as number,
    inspected_runs: runs.length,
    successful_runs: successful,
    failed_runs: failed,
    pending_runs: runs.length - successful - failed,
    runs,
    scope_note: 'Public workflows only. A sample of up to 10 recent runs; not billed minutes, monthly costs or a full historical audit.',
  };
}
