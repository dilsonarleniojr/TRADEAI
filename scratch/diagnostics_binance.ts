import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

const API_KEY = process.env.BINANCE_API_KEY || "";
const API_SECRET = process.env.BINANCE_API_SECRET || "";
const SYMBOL = "BTCUSDT";

async function runDiagnostics() {
  console.log("=========================================================================");
  console.log("   DIAGNÓSTICO OFICIAL DE CONECTIVIDADE E CREDENCIAIS BINANCE           ");
  console.log("=========================================================================\n");

  console.log(`[*] Chave API detectada: ${API_KEY ? `${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}` : "NÃO CONFIGURADA"}`);
  console.log(`[*] Chave Secret detectada: ${API_SECRET ? `${API_SECRET.slice(0, 8)}...${API_SECRET.slice(-4)}` : "NÃO CONFIGURADA"}\n`);

  // 1. Teste de Conectividade e Latência/Relógio do Servidor
  console.log("[1] Testando Conectividade Pública e Drift do Relógio...");
  let serverTime = 0;
  try {
    const t0 = performance.now();
    const res = await fetch("https://api.binance.com/api/v3/time");
    const t1 = performance.now();
    const latency = Math.round(t1 - t0);

    if (!res.ok) {
      console.log(`[FALHA] Endpoint público inacessível: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    serverTime = data.serverTime;
    const localTime = Date.now();
    const drift = localTime - serverTime;

    console.log(`  -> [OK] Conexão pública estabelecida (Latência RTT: ${latency} ms)`);
    console.log(`  -> [INFO] Drift do relógio local vs servidor Binance: ${drift} ms`);

    if (Math.abs(drift) > 1000) {
      console.log("  -> [ALERTA CRÍTICO] Drift > 1000 ms. A API rejeitará ordens por timestamp/recvWindow!");
      console.log("     Execute no Linux: sudo systemctl restart systemd-timesyncd");
    } else {
      console.log("  -> [OK] Relógio sincronizado (Drift < 1000 ms).");
    }
  } catch (err: any) {
    console.log(`[FALHA] Erro de rede ou endpoint público: ${err.message}`);
    return;
  }

  // 2. Teste de Autenticação e Permissões da API
  console.log("\n[2] Testando Autenticação e Permissões da API...");
  let accountData: any = null;
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&recvWindow=60000`;
    const signature = crypto.createHmac("sha256", API_SECRET).update(queryString).digest("hex");

    const res = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
      headers: {
        "X-MBX-APIKEY": API_KEY,
      },
    });

    const body = await res.json();

    if (!res.ok) {
      console.log(`  -> [FALHA] Erro de autenticação Binance: HTTP ${res.status} | Código: ${body.code}`);
      console.log(`     Mensagem da Binance: ${body.msg}`);
      if (body.code === -2014 || body.code === -2015) {
        console.log("     Causa provável: Chave de API inválida, IP não autorizado na lista branca da Binance ou chave expirada.");
      }
    } else {
      accountData = body;
      console.log("  -> [OK] Autenticação bem-sucedida! Permissões e saldos obtidos com sucesso.");
      console.log(`     Pode transacionar (canTrade): ${body.canTrade}`);
      console.log(`     Pode sacar (canWithdraw): ${body.canWithdraw}`);
      console.log(`     Pode depositar (canDeposit): ${body.canDeposit}`);
    }
  } catch (err: any) {
    console.log(`  -> [FALHA] Falha na chamada autenticada: ${err.message}`);
  }

  // 3. Checagem de Mercados e Limites Operacionais (Min Notional / Step Size)
  console.log("\n[3] Checagem de Limites Operacionais na Binance (BTCUSDT)...");
  let minCost = 5.0;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${SYMBOL}`);
    const data = await res.json();
    const symbolInfo = data.symbols?.[0];

    if (symbolInfo) {
      const lotSize = symbolInfo.filters.find((f: any) => f.filterType === "LOT_SIZE");
      const notionalFilter = symbolInfo.filters.find(
        (f: any) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL"
      );
      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === "PRICE_FILTER");

      const minQty = lotSize ? parseFloat(lotSize.minQty) : 0;
      const stepSize = lotSize ? parseFloat(lotSize.stepSize) : 0;
      minCost = notionalFilter
        ? parseFloat(notionalFilter.minNotional || notionalFilter.notional || "5.0")
        : 5.0;

      const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${SYMBOL}`);
      const ticker = await tickerRes.json();
      const lastPrice = parseFloat(ticker.price);

      console.log(`  -> [INFO] Par: ${SYMBOL} | Último preço: $${lastPrice.toFixed(2)}`);
      console.log(`  -> Quantidade mínima por ordem (minQty): ${minQty} BTC`);
      console.log(`  -> Incremento de quantidade (stepSize): ${stepSize} BTC`);
      console.log(`  -> Valor financeiro mínimo por ordem (minNotional): $${minCost} USDT`);
    }
  } catch (err: any) {
    console.log(`  -> [ALERTA] Não foi possível obter parâmetros de mercado: ${err.message}`);
  }

  // 4. Verificação de Saldo Operacional
  console.log("\n[4] Verificação de Saldo Operacional...");
  if (accountData) {
    const usdtBal = accountData.balances.find((b: any) => b.asset === "USDT");
    const btcBal = accountData.balances.find((b: any) => b.asset === "BTC");

    const freeUsdt = usdtBal ? parseFloat(usdtBal.free) : 0;
    const lockedUsdt = usdtBal ? parseFloat(usdtBal.locked) : 0;
    const freeBtc = btcBal ? parseFloat(btcBal.free) : 0;
    const lockedBtc = btcBal ? parseFloat(btcBal.locked) : 0;

    console.log(`  -> Saldo Livre (Free) USDT: $${freeUsdt.toFixed(2)} (Em ordens: $${lockedUsdt.toFixed(2)})`);
    console.log(`  -> Saldo Livre (Free) BTC: ${freeBtc} (Em ordens: ${lockedBtc})`);

    if (freeUsdt < minCost) {
      console.log(`  -> [ALERTA] Saldo livre de USDT ($${freeUsdt.toFixed(2)}) está abaixo do mínimo exigido por ordem ($${minCost} USDT).`);
    } else {
      console.log(`  -> [OK] Saldo livre de USDT é suficiente para abrir ordens.`);
    }
  } else {
    console.log("  -> [PULADO] Consulta de saldo não disponível devido a falha na autenticação da API Key.");
  }

  // 5. Checagem de Ordens Pendentes Travadas
  console.log("\n[5] Checagem de Ordens Pendentes Travadas...");
  if (accountData) {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${SYMBOL}&timestamp=${timestamp}&recvWindow=60000`;
      const signature = crypto.createHmac("sha256", API_SECRET).update(queryString).digest("hex");

      const res = await fetch(`https://api.binance.com/api/v3/openOrders?${queryString}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": API_KEY },
      });
      const orders = await res.json();

      if (Array.isArray(orders)) {
        console.log(`  -> Ordens abertas no par ${SYMBOL}: ${orders.length}`);
        if (orders.length > 0) {
          console.log("  -> [AVISO] Existem ordens abertas retendo saldo:");
          orders.forEach((o: any) => {
            console.log(`     ID: ${o.orderId} | Lado: ${o.side} | Tipo: ${o.type} | Preço: ${o.price} | Qtd: ${o.origQty}`);
          });
        } else {
          console.log("  -> [OK] Nenhuma ordem aberta travando margem.");
        }
      }
    } catch (err: any) {
      console.log(`  -> [ALERTA] Erro ao consultar ordens abertas: ${err.message}`);
    }
  } else {
    console.log("  -> [PULADO] Não foi possível verificar ordens abertas.");
  }

  console.log("\n=========================================================================");
  console.log("   DIAGNÓSTICO FINALIZADO!                                               ");
  console.log("=========================================================================\n");
}

runDiagnostics().catch(console.error);
