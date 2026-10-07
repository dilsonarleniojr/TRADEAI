#!/usr/bin/env python3
import time
import json
import hmac
import hashlib
import urllib.request
import urllib.error
import os

# ==========================================
# CONFIGURAÇÃO DE ACESSO
# ==========================================
# Lê automaticamente do .env ou permite preencher diretamente
API_KEY = os.getenv("BINANCE_API_KEY", "vin3Z76PZnW3hQxgwXI4IrXORacd7BdSCVtwMpYc5Fb3MvjIl9Wkv0Gom3IUol9E")
SECRET = os.getenv("BINANCE_API_SECRET", "hixMtSvb37E58IHtIbTO7fROMbZV9HHhz2pLU0EXTBLcAAc0w5YfK0zSYQlnuBDd")

SYMBOL = "BTCUSDT"
BASE_URL = "https://api.binance.com"
# ==========================================

def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def run_diagnostics():
    print(f"[*] Iniciando diagnóstico de conectividade e credenciais da Binance...\n")
    print(f"[*] Chave API: {API_KEY[:8]}...{API_KEY[-4:] if len(API_KEY) > 12 else ''}")
    print(f"[*] Chave Secret: {SECRET[:8]}...{SECRET[-4:] if len(SECRET) > 12 else ''}\n")

    # 1. Teste de Conectividade e Latência/Relógio do Servidor
    try:
        t0 = time.time()
        time_data = http_get(f"{BASE_URL}/api/v3/time")
        latency = int((time.time() - t0) * 1000)
        server_time = time_data["serverTime"]
        local_time = int(time.time() * 1000)
        drift = local_time - server_time

        print(f"[OK] Conexão pública estabelecida (Latência RTT: {latency} ms)")
        print(f"[INFO] Drift do relógio local vs servidor: {drift} ms")
        if abs(drift) > 1000:
            print("  -> [ALERTA CRÍTICO] Drift > 1000 ms. A API rejeitará ordens por timestamp/recvWindow.")
            print("     Execute no Linux: sudo systemctl restart systemd-timesyncd")
        else:
            print("  -> [OK] Relógio sincronizado (Drift dentro da margem segura).")
    except Exception as e:
        print(f"[FALHA] Erro de rede ou endpoint público inacessível: {e}")
        return

    # 2. Teste de Autenticação e Permissões da API
    balance_data = None
    try:
        timestamp = int(time.time() * 1000)
        query = f"timestamp={timestamp}&recvWindow=60000"
        sig = hmac.new(SECRET.encode('utf-8'), query.encode('utf-8'), hashlib.sha256).hexdigest()
        url = f"{BASE_URL}/api/v3/account?{query}&signature={sig}"

        headers = {
            "X-MBX-APIKEY": API_KEY,
            "User-Agent": "TradeAI-Diagnostic/1.0"
        }
        balance_data = http_get(url, headers)
        print("\n[OK] Autenticação da API bem-sucedida (Chave e Secret válidos).")
        print(f"     Pode negociar (canTrade): {balance_data.get('canTrade')}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"\n[FALHA] Erro de autenticação Binance: HTTP {e.code}\nDetalhes: {err_msg}")
        print("     -> Causa provável: Chave inválida, IP não adicionado à lista branca na Binance ou chave expirada (90 dias).")
    except Exception as e:
        print(f"\n[FALHA] Falha na chamada autenticada: {e}")

    # 3. Checagem de Mercados e Limites Operacionais (Min Notional / Step Size)
    min_cost = 5.0
    try:
        market_info = http_get(f"{BASE_URL}/api/v3/exchangeInfo?symbol={SYMBOL}")
        symbol_data = market_info.get("symbols", [{}])[0]

        lot_size = next((f for f in symbol_data.get("filters", []) if f["filterType"] == "LOT_SIZE"), {})
        notional_filter = next((f for f in symbol_data.get("filters", []) if f["filterType"] in ("NOTIONAL", "MIN_NOTIONAL")), {})

        min_amount = float(lot_size.get("minQty", 0))
        min_cost = float(notional_filter.get("minNotional", notional_filter.get("notional", 5.0)))

        ticker = http_get(f"{BASE_URL}/api/v3/ticker/price?symbol={SYMBOL}")
        last_price = float(ticker.get("price", 0))

        print(f"\n[INFO] Par: {SYMBOL} | Último preço: ${last_price:.2f}")
        print(f"  -> Quantidade mínima por ordem: {min_amount} BTC")
        print(f"  -> Valor mínimo financeiro (Notional): {min_cost} USDT")
    except Exception as e:
        print(f"[ALERTA] Não foi possível obter parâmetros de mercado para {SYMBOL}: {e}")

    # 4. Verificação de Saldo Operacional
    if balance_data:
        try:
            balances = balance_data.get("balances", [])
            usdt = next((b for b in balances if b["asset"] == "USDT"), {})
            btc = next((b for b in balances if b["asset"] == "BTC"), {})

            free_quote = float(usdt.get("free", 0))
            free_base = float(btc.get("free", 0))

            print(f"\n[INFO] Saldos disponíveis (Free):")
            print(f"  -> USDT: ${free_quote:.2f}")
            print(f"  -> BTC: {free_base}")

            if free_quote < min_cost:
                print(f"  -> [ALERTA] Saldo livre de USDT (${free_quote:.2f}) está abaixo do mínimo exigido por ordem ({min_cost} USDT). O bot não conseguirá comprar.")
            else:
                print(f"  -> [OK] Saldo em USDT suficiente para execução de ordens.")
        except Exception as e:
            print(f"[ALERTA] Erro ao filtrar saldos específicos: {e}")
    else:
        print("\n[PULADO] Consulta de saldo indisponível devido a falha na autenticação da chave.")

    # 5. Checagem de Ordens Pendentes Travadas
    if balance_data:
        try:
            timestamp = int(time.time() * 1000)
            query = f"symbol={SYMBOL}&timestamp={timestamp}&recvWindow=60000"
            sig = hmac.new(SECRET.encode('utf-8'), query.encode('utf-8'), hashlib.sha256).hexdigest()
            url = f"{BASE_URL}/api/v3/openOrders?${query}&signature=${sig}"
            orders = http_get(url, {"X-MBX-APIKEY": API_KEY})
            print(f"\n[INFO] Ordens abertas no par {SYMBOL}: {len(orders)}")
            if len(orders) > 0:
                print("  -> Existem ordens abertas retendo saldo ou bloqueando novos ciclos:")
                for o in orders:
                    print(f"     ID: {o['orderId']} | Tipo: {o['type']} | Lado: {o['side']} | Preço: {o['price']} | Qtd: {o['origQty']}")
            else:
                print("  -> [OK] Nenhuma ordem aberta travando margem.")
        except Exception as e:
            print(f"[ALERTA] Não foi possível verificar ordens abertas: {e}")

    print("\n[*] Diagnóstico finalizado.")

if __name__ == '__main__':
    run_diagnostics()
