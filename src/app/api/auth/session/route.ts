import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, SessionAuthError, createSessionCookie } from '@/server/auth-session';

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    const sessionCookie = await createSessionCookie(idToken ?? '');

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_MS / 1000,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof SessionAuthError
        ? error.message
        : 'Could not create an authenticated session.';

    return NextResponse.json({ success: false, message }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
