import 'server-only';

import { cookies } from 'next/headers';
import { getAdminAuth } from './firebase-admin';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5;

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export class SessionAuthError extends Error {
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'SessionAuthError';
  }
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
    };
  } catch (error) {
    console.error('Failed to verify session cookie.', error);
    return null;
  }
}

export async function requireCurrentSessionUser(): Promise<SessionUser> {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    throw new SessionAuthError();
  }

  return sessionUser;
}

export async function createSessionCookie(idToken: string) {
  if (!idToken) {
    throw new SessionAuthError('Missing Firebase ID token.');
  }

  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });
}
