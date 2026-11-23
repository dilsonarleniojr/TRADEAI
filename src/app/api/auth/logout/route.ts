import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';
import { guardApiRequest } from '@/lib/auth/request-guard';

export async function POST(req: NextRequest) {
  const blocked = guardApiRequest(req, { requireSession: false });
  if (blocked) return blocked;

  const token = req.cookies.get('tradeai_session')?.value;
  if (token) {
    AuthService.revokeSession(token);
  }

  const response = NextResponse.json({ success: true, message: 'Logout realizado com sucesso.' });
  response.cookies.delete('tradeai_session');
  return response;
}
