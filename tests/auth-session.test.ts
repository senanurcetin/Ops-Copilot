import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SessionAuthError,
  issueSessionCookie,
  requireSessionUser,
  resolveSessionUser,
} from '../src/server/session-core';

const cookieStore = (value?: string) => ({
  get(name: string) {
    assert.equal(name, SESSION_COOKIE_NAME);
    return value === undefined ? undefined : { value };
  },
});

test('missing session cookie returns null without initializing Firebase Admin', async () => {
  const result = await resolveSessionUser(cookieStore(), () => {
    throw new Error('Firebase Admin must not be accessed');
  });
  assert.equal(result, null);
});

test('empty session cookie returns null without initializing Firebase Admin', async () => {
  const result = await resolveSessionUser(cookieStore(''), () => {
    throw new Error('Firebase Admin must not be accessed');
  });
  assert.equal(result, null);
});

test('valid cookie verifies revocation and maps user claims', async () => {
  let calls = 0;
  const user = await resolveSessionUser(cookieStore('valid-cookie'), () => ({
    verifySessionCookie: async (token, checkRevoked) => {
      calls += 1;
      assert.equal(token, 'valid-cookie');
      assert.equal(checkRevoked, true);
      return { uid: 'user-123', email: 'user@example.test', name: 'Test User' };
    },
  }));

  assert.equal(calls, 1);
  assert.deepEqual(user, {
    uid: 'user-123',
    email: 'user@example.test',
    displayName: 'Test User',
  });
});

test('missing optional Firebase claims become null rather than undefined', async () => {
  const result = await resolveSessionUser(cookieStore('token'), () => ({
    verifySessionCookie: async () => ({ uid: 'user-456' }),
  }));
  assert.deepEqual(result, { uid: 'user-456', email: null, displayName: null });
});

test('invalid or revoked cookie fails closed without logging credential-bearing errors', async () => {
  const secret = 'sensitive-session-cookie';
  const originalLog = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    for (const failure of ['invalid', 'revoked']) {
      const result = await resolveSessionUser(cookieStore(secret), () => ({
        verifySessionCookie: async (_token, checkRevoked) => {
          assert.equal(checkRevoked, true);
          throw new Error(`${failure}: ${secret}`);
        },
      }));
      assert.equal(result, null);
    }
    assert.deepEqual(logged, []);
  } finally {
    console.error = originalLog;
  }
});

test('malformed Firebase claims with missing uid fail closed', async () => {
  const result = await resolveSessionUser(cookieStore('token'), () => ({
    verifySessionCookie: async () => ({ uid: ' ' }),
  }));
  assert.equal(result, null);
});

test('requireSessionUser preserves authenticated data and rejects anonymous callers', () => {
  const user = { uid: 'test-user', email: null, displayName: null };
  assert.equal(requireSessionUser(user), user);
  assert.throws(() => requireSessionUser(null), (error: unknown) => {
    assert.ok(error instanceof SessionAuthError);
    assert.equal(error.name, 'SessionAuthError');
    assert.equal(error.message, 'Authentication required.');
    return true;
  });
});

test('issuing a session requires a nonblank ID token before accessing Firebase Admin', () => {
  for (const token of ['', '  ']) {
    assert.throws(() => issueSessionCookie(token, () => {
      throw new Error('Firebase Admin must not be accessed');
    }), SessionAuthError);
  }
});

test('session issuance forwards the five-day lifetime and returns provider result', async () => {
  let calls = 0;
  const cookie = await issueSessionCookie('id-token', () => ({
    createSessionCookie: async (token, options) => {
      calls += 1;
      assert.equal(token, 'id-token');
      assert.deepEqual(options, { expiresIn: SESSION_DURATION_MS });
      return 'signed-cookie';
    },
  }));
  assert.equal(calls, 1);
  assert.equal(cookie, 'signed-cookie');
  assert.equal(SESSION_DURATION_MS, 432_000_000);
});
