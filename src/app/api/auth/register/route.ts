import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';

export async function POST(req: NextRequest) {
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
      sessionToken: result.sessionToken,
    });

    // Set HttpOnly cookie for session token
    response.cookies.set('tradeai_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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
