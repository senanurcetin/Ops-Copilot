import { test, expect, type Page } from '@playwright/test';

// These are synthetic browser tests of the PUBLIC read-only explorer UI.
// No GitHub traffic, Firebase session, customer data, or external credentials.
const explorer = '/developer-tools/github-actions';
const originalRepository = 'senanurcetin/Ops-Copilot';
type MockRun = {
  id: number; name: string; event: string; status: string;
  conclusion: string | null; created_at: string; html_url: string;
};

function run(repository: string, id: number, conclusion: 'success' | 'failure'): MockRun {
  return {
    id, name: 'Mock Node CI', event: 'pull_request', status: 'completed',
    conclusion, created_at: '2026-11-04T00:00:00Z',
    html_url: `https://github.com/${repository}/actions/runs/${id}`,
  };
}

function response(repository: string, runs: MockRun[], total = runs.length) {
  const successes = runs.filter(item => item.conclusion === 'success').length;
  const failures = runs.filter(item => item.conclusion === 'failure').length;
  return {
    repository, total_matching_runs: total, inspected_runs: runs.length,
    successful_runs: successes, failed_runs: failures,
    pending_runs: runs.length - successes - failures, runs,
    scope_note: 'Synthetic public workflow fixture. Sample only; not billed minutes.',
  };
}

async function mockApi(
  page: Page,
  respond: (repo: string) => { status: number; body: unknown },
) {
  await page.route(url => url.pathname === '/api/public-actions', async route => {
    const value = new URL(route.request().url()).searchParams.get('repository') ?? '';
    const result = respond(value);
    await route.fulfill({
      status: result.status, contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });
}

test.describe('Public GitHub Actions Explorer — synthetic network-only E2E', () => {
  test('renders bounded sample counts and exact canonical GitHub run links', async ({ page }) => {
    const sample = response(originalRepository, [
      run(originalRepository, 101, 'success'),
      run(originalRepository, 102, 'failure'),
    ], 27);
    await mockApi(page, repo => ({ status: 200, body: { ...sample, repository: repo } }));
    await page.goto(explorer);
    await expect(page.getByRole('heading', { name: /GitHub Actions Explorer/ })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Workflow summary' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Runs inspected')).toBeVisible();
    await expect(summary.getByText('Successful')).toBeVisible();
    await expect(summary.getByText('Failed')).toBeVisible();
    await expect(page.getByText('Within 2 sampled runs. GitHub reports 27 matching runs overall.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Success 50 percent; failure 50 percent' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inspect run 101' })).toHaveAttribute(
      'href', 'https://github.com/senanurcetin/Ops-Copilot/actions/runs/101',
    );
    await expect(page.getByRole('link', { name: 'Inspect run 102' })).toHaveAttribute(
      'href', 'https://github.com/senanurcetin/Ops-Copilot/actions/runs/102',
    );
  });

  test('does not render a report when server rejects repository syntax', async ({ page }) => {
    await mockApi(page, repo => repo === originalRepository
      ? { status: 200, body: response(repo, []) }
      : { status: 400, body: { error: 'Enter a public repository as owner/name.' } });
    await page.goto(explorer);
    await page.getByRole('textbox', { name: 'GitHub repository' }).fill('invalid-repository');
    await page.getByRole('button', { name: 'Analyze repository' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a public repository as owner/name.');
    await expect(page.getByRole('region', { name: 'Workflow summary' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Inspect run/ })).toHaveCount(0);
  });

  test('displays rate limiting without fabricated data or success state', async ({ page }) => {
    await mockApi(page, () => ({
      status: 503,
      body: { error: 'GitHub API is unavailable or rate-limited. Retry later.' },
    }));
    await page.goto(explorer);
    await expect(page.getByRole('alert')).toHaveText(
      'GitHub API is unavailable or rate-limited. Retry later.',
    );
    await expect(page.getByRole('region', { name: 'Workflow summary' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Inspect run/ })).toHaveCount(0);
  });

  test('empty successful response is labeled empty, never zero-billing evidence', async ({ page }) => {
    await mockApi(page, repo => ({ status: 200, body: response(repo, [], 0) }));
    await page.goto(explorer);
    await expect(page.getByRole('region', { name: 'Workflow summary' })).toBeVisible();
    await expect(page.getByText('No workflow runs found for this public repository.')).toBeVisible();
    await expect(page.getByText('This page is not a billing or performance benchmark.')).toBeVisible();
  });

  test('supports alternative repositories on a narrow viewport without real GitHub requests', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const otherRepo = 'octocat/Hello-World';
    await mockApi(page, repo => ({
      status: 200, body: response(repo, [run(repo, 513, 'success')]),
    }));
    await page.goto(explorer);
    await expect(page.getByRole('heading', { name: /GitHub Actions Explorer/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'GitHub repository' }).fill(otherRepo);
    await page.getByRole('button', { name: 'Analyze repository' }).click();
    await expect(page.getByRole('link', { name: 'GitHub history' })).toHaveAttribute(
      'href', 'https://github.com/octocat/Hello-World/actions',
    );
    await expect(page.getByRole('link', { name: 'Inspect run 513' })).toHaveAttribute(
      'href', 'https://github.com/octocat/Hello-World/actions/runs/513',
    );
  });
});
