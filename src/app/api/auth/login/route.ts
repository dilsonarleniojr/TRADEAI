import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, twoFactorCode } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    const result = AuthService.login({
      email,
      password,
      twoFactorCode,
    });

    if (result.requiresTwoFactor) {
      return NextResponse.json({
        success: false,
        requiresTwoFactor: true,
        message: 'Código de autenticação em dois fatores (2FA) necessário.',
      });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      sessionToken: result.sessionToken,
    });

    response.cookies.set('tradeai_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Falha no login.' },
      { status: 401 }
    );
  }
}
