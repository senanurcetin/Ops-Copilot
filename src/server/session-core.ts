/**
 * Pure, offline-testable session boundary. Firebase Admin and Next.js cookies
 * are injected by auth-session.ts; no provider credentials or network are needed.
 */
export const SESSION_COOKIE_NAME = '__session';
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5;

/**
 * Authenticated Firebase UIDs must be a single safe Firestore document ID.
 * Never let malformed token claims alter an admin-SDK document path.
 * Firebase UIDs are up to 128 characters; slashes and control bytes cannot
 * represent an isolated users/{uid} tenant document.
 */
export function isSafeFirestoreUid(uid: unknown): uid is string {
  return typeof uid === 'string' &&
    uid.length > 0 && uid.length <= 128 &&
    uid.trim() === uid && uid !== '.' && uid !== '..' &&
    !/[/\\\u0000-\u001F\u007F]/u.test(uid) &&
    !/^__.*__$/.test(uid);
}


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

export interface SessionCookieStore {
  get(name: string): { value: string } | undefined;
}

interface DecodedSession {
  uid: string;
  email?: string | null;
  name?: string | null;
}

export interface SessionVerifier {
  verifySessionCookie(cookie: string, checkRevoked: boolean): Promise<DecodedSession>;
}

export interface SessionIssuer {
  createSessionCookie(idToken: string, options: { expiresIn: number }): Promise<string>;
}

/**
 * Never instantiate Firebase Admin until a nonempty session cookie exists.
 * A missing, invalid or revoked token fails closed, without logging the
 * rejected token or a provider exception that might contain its value.
 */
export async function resolveSessionUser(
  cookieStore: SessionCookieStore,
  getAuth: () => SessionVerifier,
): Promise<SessionUser | null> {
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await getAuth().verifySessionCookie(sessionCookie, true);
    if (!isSafeFirestoreUid(decoded?.uid)) return null;

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
    };
  } catch {
    return null;
  }
}

export function requireSessionUser(user: SessionUser | null): SessionUser {
  if (!user) throw new SessionAuthError();
  return user;
}

export function issueSessionCookie(
  idToken: string,
  getAuth: () => SessionIssuer,
): Promise<string> {
  if (!idToken?.trim()) throw new SessionAuthError('Missing Firebase ID token.');
  return getAuth().createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
}
