import urllib.request
import json

def run_market_scanner():
    url = "https://api.binance.com/api/v3/ticker/24hr"
    print(f"📡 Buscando dados de 24h da Binance: {url}...")
    
    try:
        # Fetching data using standard urllib to avoid requiring pip installs
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            
        print("✅ Dados recebidos com sucesso. Filtrando e analisando pares USDT...")
        
        # 1. Filter for USDT pairs, ignore stablecoins and index pairs
        usdt_pairs = []
        ignore_symbols = ["USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "BUSDUSDT", "EURUSDT"]
        
        for item in data:
            symbol = item['symbol']
            if symbol.endswith("USDT") and symbol not in ignore_symbols:
                try:
                    price_change = float(item['priceChangePercent'])
                    quote_volume = float(item['quoteVolume']) # Volume in USDT
                    usdt_pairs.append({
                        'symbol': symbol,
                        'priceChangePercent': price_change,
                        'volumeUSDT': quote_volume,
                        'lastPrice': float(item['lastPrice'])
                    })
                except ValueError:
                    continue
                    
        # 2. Select the top 50 pairs by volume (liquidity filter)
        usdt_pairs.sort(key=lambda x: x['volumeUSDT'], reverse=True)
        top_50_by_volume = usdt_pairs[:50]
        
        # 3. From the top 50 volume leaders, sort by price change descending (highest gainers with confirmed flow)
        # Flow Confirmation: High volume is guaranteed since they are in the top 50 volume leaders.
        top_50_by_volume.sort(key=lambda x: x['priceChangePercent'], reverse=True)
        top_3_picks = top_50_by_volume[:3]
        
        print("\n🔥 === TOP 3 ATIVOS DETECTADOS PELO MARKET SCANNER ===")
        print("Foco operacional para a próxima hora (Alta + Confirmação de Fluxo):")
        for i, pick in enumerate(top_3_picks):
            print(f"{i+1}. {pick['symbol']} | Alta: +{pick['priceChangePercent']:.2f}% | Volume: ${pick['volumeUSDT']/1e6:.2f}M | Preço: ${pick['lastPrice']:.4f}")
            
        return [pick['symbol'] for pick in top_3_picks]
        
    except Exception as e:
        print(f"❌ Erro ao executar o scanner de mercado: {e}")
        return ["BTCUSDT", "ETHUSDT", "SOLUSDT"] # Fallback

if __name__ == "__main__":
    run_market_scanner()


# ==============================================================================
# Async Crypto Screener Daemon
# ==============================================================================
import asyncio
import aiohttp

class AsyncCryptoScreener:
    def __init__(self, check_interval_seconds=3600):
        self.check_interval_seconds = check_interval_seconds
        self.is_running = False
        self.screener_task = None
        self.last_picks = []

    async def start(self):
        self.is_running = True
        self.screener_task = asyncio.create_task(self.run_loop())

    async def stop(self):
        self.is_running = False
        if self.screener_task:
            self.screener_task.cancel()
            try:
                await self.screener_task
            except asyncio.CancelledError:
                pass

    async def scan_market(self) -> list:
        url = "https://api.binance.com/api/v3/ticker/24hr"
        ignore_symbols = ["USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "BUSDUSDT", "EURUSDT"]
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                    else:
                        return ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
        except Exception:
            return ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

        usdt_pairs = []
        for item in data:
            symbol = item.get('symbol', '')
            if symbol.endswith("USDT") and symbol not in ignore_symbols:
                try:
                    price_change = float(item.get('priceChangePercent', 0.0))
                    quote_volume = float(item.get('quoteVolume', 0.0))
                    high = float(item.get('highPrice', 0.0))
                    low = float(item.get('lowPrice', 1.0))
                    volatility = abs(high - low) / (low if low > 0 else 1.0)
                    
                    usdt_pairs.append({
                        'symbol': symbol,
                        'priceChangePercent': price_change,
                        'volumeUSDT': quote_volume,
                        'volatility': volatility,
                        'lastPrice': float(item.get('lastPrice', 0.0))
                    })
                except (ValueError, TypeError):
                    continue

        usdt_pairs.sort(key=lambda x: x['volumeUSDT'], reverse=True)
        top_50 = usdt_pairs[:50]

        for pair in top_50:
            pair['asymmetry_score'] = pair['priceChangePercent'] * pair['volatility']

        top_50.sort(key=lambda x: x['asymmetry_score'], reverse=True)
        top_3 = top_50[:3]
        
        self.last_picks = [p['symbol'] for p in top_3]
        print(f"🔥 [Screener Daemon] Top 3 setup picks: {self.last_picks}")
        return self.last_picks

    async def run_loop(self):
        while self.is_running:
            try:
                await self.scan_market()
                await asyncio.sleep(self.check_interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ [Screener Daemon] Error: {e}")
                await asyncio.sleep(10)

