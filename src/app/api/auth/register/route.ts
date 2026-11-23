import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';
import { guardApiRequest } from '@/lib/auth/request-guard';

export async function POST(req: NextRequest) {
  const blocked = guardApiRequest(req, { requireSession: false, rateLimit: { limit: 5, windowMs: 60_000, scope: 'auth-register' } });
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const { name, email, password, enableTwoFactor } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Nome, email e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    const result = AuthService.register({
      name,
      email,
      password,
      enableTwoFactor: enableTwoFactor ?? true,
    });

    const response = NextResponse.json({
      success: true,
      user: result.user,
      twoFactorSecret: result.twoFactorSecret,
      otpauthUri: result.otpauthUri,
    });

    // Set HttpOnly cookie for session token
    response.cookies.set('tradeai_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Falha ao registrar usuário.' },
      { status: 400 }
    );
  }
}
