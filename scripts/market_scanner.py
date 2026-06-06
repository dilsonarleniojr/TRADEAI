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
