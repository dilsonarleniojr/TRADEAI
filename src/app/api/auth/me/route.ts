import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';

export async function GET(req: NextRequest) {
  const sessionToken =
    req.cookies.get('tradeai_session')?.value ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const user = AuthService.validateSession(sessionToken);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user });
}
