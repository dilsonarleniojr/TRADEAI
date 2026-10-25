import { redirect } from 'next/navigation';

/**
 * Redirecionamento automático para a interface unificada TradeAI HUB (/).
 * Garante que exista apenas um único frontend ativo em http://localhost:3000/.
 */
export default function SmartTradingRedirectPage() {
  redirect('/');
}
