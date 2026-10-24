import os
from typing import List, Optional, Dict
from dataclasses import dataclass
from mcp.server.fastmcp import FastMCP
import ccxt
import pandas as pd
from cachetools import TTLCache
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
SUPPORTED_EXCHANGES = ["binance", "okx", "bybit", "bitget", "gate", "coinex"]
CACHE_TTL = 300  # Cache current rates for 5 minutes
cache = TTLCache(maxsize=100, ttl=CACHE_TTL)

# Data structure for funding rate
@dataclass
class FundingRate:
    exchange: str
    symbol: str
    rate: float
    timestamp: int

# Initialize exchange clients safely
exchanges = {}
for name in SUPPORTED_EXCHANGES:
    exchange_cls = getattr(ccxt, name, None)
    if exchange_cls:
        try:
            exchanges[name] = exchange_cls({'enableRateLimit': True})
        except Exception:
            pass

# Lifespan management
def app_lifespan(server: FastMCP):
    """Manage application lifecycle"""
    yield {}

# Create MCP server
mcp = FastMCP(
    name="Funding Rates MCP",
    dependencies=["ccxt", "cachetools", "python-dotenv", "pandas"],
    lifespan=app_lifespan
)

# Fetch funding rates for multiple symbols
def fetch_funding_rates(exchange_name: str, symbols: List[str], params: Dict = {}) -> List[FundingRate]:
    """Fetch current funding rates for multiple symbols from an exchange

    Parameters:
        exchange_name (str): Name of the exchange (e.g., "binance").
        symbols (List[str]): List of trading pairs (e.g., ["BTC/USDT:USDT", "ETH/USDT:USDT"]).
        params (Dict, optional): Additional parameters for the API call (e.g., {"type": "swap"}). Defaults to {}.

    Returns:
        List[FundingRate]: List of funding rate objects for the requested symbols.
    """
    # Create cache key including params to avoid mixing different API calls
    params_key = ":".join(f"{k}={v}" for k, v in sorted(params.items()))
    cache_key = f"{exchange_name}:funding_rates:{','.join(symbols)}:{params_key}"
    if cache_key in cache:
        # Filter cached rates for requested symbols
        cached_rates = cache[cache_key]
        return [rate for rate in cached_rates if rate.symbol in symbols]

    exchange = exchanges.get(exchange_name)
    if not exchange:
        raise ValueError(f"Unsupported exchange: {exchange_name}")

    # Fetch funding rates for specified symbols
    if exchange_name in ['okx', 'cryptocom']:
      funding_data = {}
      for symbol in symbols:
        funding_data[symbol] = exchange.fetch_funding_rate(symbol, params)            
    else:
        funding_data = exchange.fetch_funding_rates(symbols, params)
    
    funding_rates = []
    for symbol in symbols:
        funding_info = funding_data.get(symbol)
        if funding_info and "fundingRate" in funding_info and "timestamp" in funding_info:
            funding_rates.append(FundingRate(
                exchange=exchange_name,
                symbol=symbol,
                rate=float(funding_info["fundingRate"]),
                timestamp=int(funding_info["timestamp"] or funding_info["fundingTimestamp"])
            ))

    cache[cache_key] = funding_rates
    return [rate for rate in funding_rates if rate.symbol in symbols]


# Tools
@mcp.tool()
def compare_funding_rates(
    symbols: List[str],
    exchanges: List[str] = [],
    params: Dict = {}
) -> str:
    """
    Compare current funding rates for multiple symbols across specified exchanges.

    Parameters:
        symbols (List[str]): List of trading pairs (e.g., ["BTC/USDT:USDT", "ETH/USDT:USDT"]).
        exchanges (List[str], optional): List of exchanges to compare (e.g., ["binance", "bybit"]).
            Defaults to all supported exchanges (binance, bybit, okx).
        params (Dict, optional): Additional parameters for the API call (e.g., {"type": "swap"}). Defaults to {}.

    Returns:
        str: Markdown table comparing funding rates across exchanges and symbols.
    """
    if not symbols:
        raise ValueError("At least one symbol must be provided")
    
    if not exchanges:
        exchanges = SUPPORTED_EXCHANGES
    
    invalid_exchanges = [ex for ex in exchanges if ex not in SUPPORTED_EXCHANGES]
    if invalid_exchanges:
        raise ValueError(f"Unsupported exchanges: {invalid_exchanges}")

    results = []
    for exchange in exchanges:
        funding_rates = fetch_funding_rates(exchange, symbols, params)
        for symbol in symbols:
            rate_info = next((r for r in funding_rates if r.symbol == symbol), None)
            results.append({
                "Exchange": exchange,
                "Symbol": symbol,
                "Funding Rate": rate_info.rate if rate_info else None,
                "Formatted Rate": f"{rate_info.rate:.6%}" if rate_info else "Unavailable"
            })
    
    # Create pivoted table
    df = pd.DataFrame(results)
    pivot_df = df.pivot_table(
        index="Symbol",
        columns="Exchange",
        values="Formatted Rate",
        aggfunc="first"
    ).fillna("Unavailable")
    
    # Calculate divergence (max - min funding rate) for each symbol
    numeric_df = df.pivot_table(
        index="Symbol",
        columns="Exchange",
        values="Funding Rate",
        aggfunc="first"
    )
    divergence = numeric_df.apply(
        lambda row: f"{(row.max() - row.min()):.6%}" if row.notna().any() else "Unavailable",
        axis=1
    )
    
    # Add Divergence column
    pivot_df["Divergence"] = divergence
    
    # Rename index for header
    pivot_df.index.name = "Symbol\Exchange"
    
    return f"Current funding rates:\n\n{pivot_df.to_markdown()}"
    
@mcp.prompt()
def compare_funding_rates_prompt(symbols: List[str]) -> str:
    """
    Compare current funding rates for multiple symbols across all exchanges.

    Args:
        symbols (List[str]): List of trading pairs (e.g., ["BTC/USDT:USDT", "ETH/USDT:USDT"]).

    Returns:
        str: Prompt for comparing funding rates.
    """
    if not symbols:
        raise ValueError("At least one symbol must be provided")
    
    return f"Compare the funding rates for {', '.join(symbols)} across {', '.join(SUPPORTED_EXCHANGES)}."

# Main execution
def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "stdio").lower()
    if transport == "sse":
        mcp.settings.host = os.getenv("MCP_HOST", "0.0.0.0")
        mcp.settings.port = int(os.getenv("MCP_PORT", "8002"))
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
    