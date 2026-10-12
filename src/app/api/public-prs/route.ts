import { NextRequest, NextResponse } from 'next/server';
import { parsePublicRepository } from '@/lib/github-public-actions';
import { summarizePublicPullRequests } from '@/lib/nexus-public-prs';

export const runtime = 'nodejs';

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'nexus-devops-intelligence-public-preview',
};

/** Read-only, anonymous GitHub REST API preview for PUBLIC repositories only. */
export async function GET(request: NextRequest) {
  const repository = request.nextUrl.searchParams.get('repository') || '';
  let owner: string;
  let name: string;
  try {
    [owner, name] = parsePublicRepository(repository);
  } catch {
    return NextResponse.json({ error: 'Use a public GitHub repository in owner/name format.' }, { status: 400 });
  }

  const path = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  try {
    // Request six so the response can distinguish "five or fewer" from "more than five".
    const response = await fetch(`${path}/pulls?state=open&per_page=6&page=1`, {
      headers, next: { revalidate: 120 }, signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) {
      return NextResponse.json({ error: 'Public repository not found.' }, { status: 404 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: 'GitHub pull request data is unavailable or rate-limited.' }, { status: 503 });
    }
    const items: unknown = await response.json();
    if (!Array.isArray(items) || items.length > 6) {
      return NextResponse.json({ error: 'GitHub returned unexpected pull request data.' }, { status: 502 });
    }
    // Bound total upstream requests: one listing request, at most five details.
    const details = await Promise.all(items.slice(0, 5).map(async (item: unknown) => {
      if (!item || typeof item !== 'object' ||
          !Number.isSafeInteger((item as { number?: unknown }).number) ||
          ((item as { number: number }).number) < 1) return null;
      const number = (item as { number: number }).number;
      try {
        const detail = await fetch(`${path}/pulls/${number}`, {
          headers, next: { revalidate: 120 }, signal: AbortSignal.timeout(10000),
        });
        return detail.ok ? await detail.json() : null;
      } catch {
        return null;
      }
    }));
    const summary = summarizePublicPullRequests(repository, items, details);
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json({ error: 'Could not validate public pull request status.' }, { status: 502 });
  }
}