import 'server-only';

import { cookies } from 'next/headers';
import { getAdminAuth } from './firebase-admin';
import {
  SESSION_COOKIE_NAME,
  issueSessionCookie,
  requireSessionUser,
  resolveSessionUser,
} from './session-core';

export {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SessionAuthError,
} from './session-core';
export type { SessionUser } from './session-core';

/** Server-only Next.js adapter for the pure session boundary. */
export async function getCurrentSessionUser() {
  const cookieStore = await cookies();
  return resolveSessionUser(cookieStore, getAdminAuth);
}

export async function requireCurrentSessionUser() {
  return requireSessionUser(await getCurrentSessionUser());
}

export function createSessionCookie(idToken: string) {
  return issueSessionCookie(idToken, getAdminAuth);
}
