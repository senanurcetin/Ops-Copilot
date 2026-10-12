import { NextRequest, NextResponse } from 'next/server';
import { parsePublicRepository, summarizePublicActions } from '@/lib/github-public-actions';

export const runtime = 'nodejs';

/**
 * Public, GET-only demo endpoint. No token or privileged GitHub App credentials.
 * Fixed GitHub API host and strict repository validation prevent arbitrary fetch URLs.
 */
export async function GET(request: NextRequest) {
  const repository = request.nextUrl.searchParams.get('repository') || '';
  let owner: string;
  let name: string;
  try {
    [owner, name] = parsePublicRepository(repository);
  } catch {
    return NextResponse.json({ error: 'Enter a public repository as owner/name.' }, { status: 400 });
  }

  try {
    const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' +
      encodeURIComponent(name) + '/actions/runs?per_page=10&page=1';
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ops-copilot-public-actions-demo',
      },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Public repository or workflow history not found.' }, { status: 404 });
      }
      return NextResponse.json({
        error: 'GitHub API is unavailable or rate-limited. Retry later.',
      }, { status: 503 });
    }
    const data = summarizePublicActions(repository, await response.json());
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json({
      error: 'Could not read verified public GitHub workflow data.',
    }, { status: 502 });
  }
}
