// Centralized crypto metadata for 50+ symbols
import { isTradableBinanceSpotSymbol } from "@/lib/binance-spot-sync";

export type CryptoCategory = 
  | "Layer 1" 
  | "Layer 2" 
  | "DeFi" 
  | "Meme" 
  | "AI" 
  | "Gaming" 
  | "Infrastructure" 
  | "Exchange"
  | "Stablecoin"
  | "Inovação"
  | "Outros";

export interface CryptoMeta {
  symbol: string;       // e.g., "BTCUSDT"
  name: string;         // e.g., "Bitcoin"
  short: string;        // e.g., "BTC"
  color: string;        // Brand color hex
  category: CryptoCategory;
  description?: string; // Brief description
  rank?: number;        // Approx market cap rank
  launchYear?: number;
}

export const CRYPTO_LIST: CryptoMeta[] = [
  // === Layer 1 ===
  { symbol: "BTCUSDT", name: "Bitcoin", short: "BTC", color: "#f7931a", category: "Layer 1", rank: 1, launchYear: 2009, description: "A primeira e maior criptomoeda por capitalização de mercado" },
  { symbol: "ETHUSDT", name: "Ethereum", short: "ETH", color: "#627eea", category: "Layer 1", rank: 2, launchYear: 2015, description: "Plataforma de contratos inteligentes e DApps" },
  { symbol: "SOLUSDT", name: "Solana", short: "SOL", color: "#9945ff", category: "Layer 1", rank: 5, launchYear: 2020, description: "Blockchain de alta performance para DeFi e NFTs" },
  { symbol: "BNBUSDT", name: "BNB", short: "BNB", color: "#f3ba2f", category: "Layer 1", rank: 4, launchYear: 2017, description: "Token nativo da Binance Smart Chain" },
  { symbol: "AVAXUSDT", name: "Avalanche", short: "AVAX", color: "#e84142", category: "Layer 1", rank: 12, launchYear: 2020, description: "Plataforma de contratos inteligentes ultra-rápida" },
  { symbol: "ADAUSDT", name: "Cardano", short: "ADA", color: "#0033ad", category: "Layer 1", rank: 8, launchYear: 2017, description: "Blockchain baseada em pesquisa acadêmica" },
  { symbol: "DOTUSDT", name: "Polkadot", short: "DOT", color: "#e6007a", category: "Layer 1", rank: 14, launchYear: 2020, description: "Protocolo de interoperabilidade entre blockchains" },
  { symbol: "ATOMUSDT", name: "Cosmos", short: "ATOM", color: "#2e3148", category: "Layer 1", rank: 25, launchYear: 2019, description: "Rede de blockchains interoperáveis" },
  { symbol: "NEARUSDT", name: "NEAR Protocol", short: "NEAR", color: "#00c1de", category: "Layer 1", rank: 18, launchYear: 2020, description: "Blockchain escalável com sharding" },
  { symbol: "ALGOUSDT", name: "Algorand", short: "ALGO", color: "#000000", category: "Layer 1", rank: 50, launchYear: 2019, description: "Blockchain de consenso puro proof-of-stake" },
  { symbol: "SUIUSDT", name: "Sui", short: "SUI", color: "#4da2ff", category: "Layer 1", rank: 22, launchYear: 2023, description: "Layer 1 com execução paralela" },
  { symbol: "APTUSDT", name: "Aptos", short: "APT", color: "#2dd8a3", category: "Layer 1", rank: 30, launchYear: 2022, description: "Layer 1 com Move language" },
  { symbol: "SEIUSDT", name: "Sei", short: "SEI", color: "#9b1c2e", category: "Layer 1", rank: 45, launchYear: 2023, description: "Blockchain otimizada para trading" },
  { symbol: "TIAUSDT", name: "Celestia", short: "TIA", color: "#7c3aed", category: "Layer 1", rank: 35, launchYear: 2023, description: "Rede modular de disponibilidade de dados" },
  { symbol: "INJUSDT", name: "Injective", short: "INJ", color: "#0082fa", category: "Layer 1", rank: 40, launchYear: 2020, description: "Blockchain para finanças DeFi" },
  
  // === Layer 2 ===
  { symbol: "POLUSDT", name: "Polygon (POL)", short: "POL", color: "#8247e5", category: "Layer 2", rank: 20, launchYear: 2020, description: "Solução Layer 2 para Ethereum (ex-MATIC)" },
  { symbol: "ARBUSDT", name: "Arbitrum", short: "ARB", color: "#28a0f0", category: "Layer 2", rank: 28, launchYear: 2023, description: "Rollup otimístico para Ethereum" },
  { symbol: "OPUSDT", name: "Optimism", short: "OP", color: "#ff0420", category: "Layer 2", rank: 32, launchYear: 2022, description: "Optimistic rollup para Ethereum" },
  { symbol: "MANTAUSDT", name: "Manta Network", short: "MANTA", color: "#1e40af", category: "Layer 2", rank: 80, launchYear: 2024, description: "Layer 2 com privacidade ZK" },
  { symbol: "STRKUSDT", name: "Starknet", short: "STRK", color: "#ec796b", category: "Layer 2", rank: 55, launchYear: 2024, description: "ZK-rollup com STARK proofs" },
  
  // === DeFi ===
  { symbol: "LINKUSDT", name: "Chainlink", short: "LINK", color: "#2a5ada", category: "DeFi", rank: 15, launchYear: 2017, description: "Rede oráculo descentralizada líder" },
  { symbol: "UNIUSDT", name: "Uniswap", short: "UNI", color: "#ff007a", category: "DeFi", rank: 22, launchYear: 2020, description: "DEX líder com AMM" },
  { symbol: "AAVEUSDT", name: "Aave", short: "AAVE", color: "#b6509e", category: "DeFi", rank: 38, launchYear: 2020, description: "Protocolo de empréstimo descentralizado" },
  { symbol: "ENAUSDT", name: "Ethena", short: "ENA", color: "#6366f1", category: "DeFi", rank: 42, launchYear: 2024, description: "Protocolo de dólar sintético baseado em Ethereum" },
  { symbol: "COMPUSDT", name: "Compound", short: "COMP", color: "#00d395", category: "DeFi", rank: 65, launchYear: 2020, description: "Mercado de empréstimos algorítmico" },
  { symbol: "CRVUSDT", name: "Curve DAO", short: "CRV", color: "#ff4e4e", category: "DeFi", rank: 60, launchYear: 2020, description: "DEX otimizado para stablecoins" },
  { symbol: "SNXUSDT", name: "Synthetix", short: "SNX", color: "#00d1ff", category: "DeFi", rank: 70, launchYear: 2018, description: "Protocolo de ativos sintéticos" },
  { symbol: "LDOUSDT", name: "Lido DAO", short: "LDO", color: "#00a3ff", category: "DeFi", rank: 33, launchYear: 2020, description: "Liquid staking líder para ETH" },
  { symbol: "DYDXUSDT", name: "dYdX", short: "DYDX", color: "#6966ff", category: "DeFi", rank: 48, launchYear: 2021, description: "Exchange descentralizada de margem" },
  { symbol: "PENDLEUSDT", name: "Pendle", short: "PENDLE", color: "#1f6fff", category: "DeFi", rank: 75, launchYear: 2021, description: "Protocolo para rendimentos futuros" },
  
  // === Meme ===
  { symbol: "DOGEUSDT", name: "Dogecoin", short: "DOGE", color: "#c3a634", category: "Meme", rank: 9, launchYear: 2013, description: "A primeira meme coin" },
  { symbol: "SHIBUSDT", name: "Shiba Inu", short: "SHIB", color: "#ffa409", category: "Meme", rank: 11, launchYear: 2020, description: "Meme coin ecossistema DeFi" },
  { symbol: "PEPEUSDT", name: "Pepe", short: "PEPE", color: "#3e7b27", category: "Meme", rank: 25, launchYear: 2023, description: "Meme coin baseada no meme Pepe" },
  { symbol: "FLOKIUSDT", name: "Floki", short: "FLOKI", color: "#f6a623", category: "Meme", rank: 55, launchYear: 2021, description: "Meme coin inspirada por Elon Musk" },
  { symbol: "BONKUSDT", name: "Bonk", short: "BONK", color: "#f8a400", category: "Meme", rank: 60, launchYear: 2022, description: "Meme coin da Solana" },
  { symbol: "WIFUSDT", name: "dogwifhat", short: "WIF", color: "#a855f7", category: "Meme", rank: 45, launchYear: 2023, description: "Meme coin do dog com chapéu" },
  
  // === AI ===
  { symbol: "FETUSDT", name: "Fetch.ai", short: "FET", color: "#1d1d3c", category: "AI", rank: 50, launchYear: 2019, description: "Plataforma de IA autônoma" },
  { symbol: "RENDERUSDT", name: "Render", short: "RNDR", color: "#e63946", category: "AI", rank: 35, launchYear: 2017, description: "Rede descentralizada de renderização GPU" },
  { symbol: "IOUSDT", name: "io.net", short: "IO", color: "#00f0ff", category: "AI", rank: 65, launchYear: 2024, description: "Rede descentralizada de clusters GPU de alta performance para IA" },
  { symbol: "TAOUSDT", name: "Bittensor", short: "TAO", color: "#2a2a3d", category: "AI", rank: 38, launchYear: 2023, description: "Rede de machine learning descentralizada" },
  
  // === Gaming ===
  { symbol: "IMXUSDT", name: "Immutable", short: "IMX", color: "#00c3ff", category: "Gaming", rank: 40, launchYear: 2021, description: "Plataforma NFT e gaming Layer 2" },
  { symbol: "GALAUSDT", name: "Gala Games", short: "GALA", color: "#000000", category: "Gaming", rank: 70, launchYear: 2020, description: "Plataforma de jogos blockchain" },
  { symbol: "RONINUSDT", name: "Ronin", short: "RON", color: "#1268fb", category: "Gaming", rank: 55, launchYear: 2022, description: "Blockchain para jogos Sky Mavis" },
  { symbol: "AXSUSDT", name: "Axie Infinity", short: "AXS", color: "#0055d5", category: "Gaming", rank: 75, launchYear: 2020, description: "Jogo play-to-earn líder" },
  
  // === Infrastructure ===
  { symbol: "FILUSDT", name: "Filecoin", short: "FIL", color: "#0090ff", category: "Infrastructure", rank: 30, launchYear: 2020, description: "Armazenamento descentralizado" },
  { symbol: "ARUSDT", name: "Arweave", short: "AR", color: "#222326", category: "Infrastructure", rank: 55, launchYear: 2018, description: "Armazenamento permanente descentralizado" },
  { symbol: "ETHFIUSDT", name: "ether.fi", short: "ETHFI", color: "#7c3aed", category: "Infrastructure", rank: 60, launchYear: 2023, description: "Protocolo de liquid staking" },
  
  // === Exchange/Payment ===
  { symbol: "XRPUSDT", name: "XRP", short: "XRP", color: "#00aae4", category: "Exchange", rank: 6, launchYear: 2012, description: "Protocolo de pagamento global" },
  { symbol: "LTCUSDT", name: "Litecoin", short: "LTC", color: "#bfbbbb", category: "Exchange", rank: 20, launchYear: 2011, description: "Pagamentos rápidos e baratos" },
  { symbol: "TRXUSDT", name: "TRON", short: "TRX", color: "#ff0013", category: "Exchange", rank: 13, launchYear: 2017, description: "Rede de entretenimento descentralizada" },
  { symbol: "XLMUSDT", name: "Stellar", short: "XLM", color: "#08b5e5", category: "Exchange", rank: 28, launchYear: 2014, description: "Rede de pagamentos transfronteiriços" },

  // === Top Gainers / Novas Moedas em Destaque ===
  { symbol: "MOVRUSDT", name: "Moonriver", short: "MOVR", color: "#53cbc9", category: "Layer 1", rank: 95, launchYear: 2021, description: "Rede de smart contracts compatível com EVM na Kusama/Polkadot" },
  { symbol: "JUPUSDT", name: "Jupiter", short: "JUP", color: "#e2538b", category: "DeFi", rank: 55, launchYear: 2024, description: "Agregador DEX e infraestrutura líder de swaps da Solana" },
  { symbol: "ZROUSDT", name: "LayerZero", short: "ZRO", color: "#000000", category: "Infrastructure", rank: 45, launchYear: 2024, description: "Protocolo líder de interoperabilidade e mensagens omnichain" },
  { symbol: "PUMPUSDT", name: "Pump", short: "PUMP", color: "#10b981", category: "Meme", rank: 90, launchYear: 2024, description: "Meme coin de alta volatilidade e grande engajamento comunitário" },
  { symbol: "BERAUSDT", name: "Berachain", short: "BERA", color: "#8d5b4c", category: "Layer 1", rank: 48, launchYear: 2024, description: "Blockchain Layer 1 baseada em Proof-of-Liquidity compatível com EVM" },
  { symbol: "PHAUSDT", name: "Phala Network", short: "PHA", color: "#d1f237", category: "AI", rank: 80, launchYear: 2021, description: "Rede de computação confidencial e coprocessadores para IA autônoma" },
  { symbol: "NIGHTUSDT", name: "Midnight", short: "NIGHT", color: "#312e81", category: "Infrastructure", rank: 88, launchYear: 2024, description: "Blockchain de proteção de dados e privacidade programável com ZK proofs" },
  { symbol: "INITUSDT", name: "Initia", short: "INIT", color: "#f97316", category: "Layer 1", rank: 92, launchYear: 2024, description: "Rede de rollups entrelaçados com arquitetura modular de execução" },
  { symbol: "OGUSDT", name: "OG Fan Token", short: "OG", color: "#8b5cf6", category: "Gaming", rank: 99, launchYear: 2020, description: "Token oficial da lendária organização de eSports bicampeã OG" },
  { symbol: "QNTUSDT", name: "Quant", short: "QNT", color: "#2563eb", category: "Infrastructure", rank: 35, launchYear: 2018, description: "Sistema operacional Overledger conectando blockchains e redes corporativas" },
];

// Lookup maps
export const CRYPTO_BY_SYMBOL: Record<string, CryptoMeta> = {};
export const CRYPTO_COLORS: Record<string, string> = {};
export const CRYPTO_NAMES: Record<string, string> = {};
export const CRYPTO_CATEGORIES: Record<string, CryptoCategory> = {};
export const CRYPTO_SHORTS: Record<string, string> = {};

// Build lookup maps
CRYPTO_LIST.forEach((crypto) => {
  CRYPTO_BY_SYMBOL[crypto.symbol] = crypto;
  CRYPTO_COLORS[crypto.symbol] = crypto.color;
  CRYPTO_NAMES[crypto.symbol] = crypto.name;
  CRYPTO_CATEGORIES[crypto.symbol] = crypto.category;
  CRYPTO_SHORTS[crypto.symbol] = crypto.short;
});

// All symbol strings for easy use
export const ALL_SYMBOLS = CRYPTO_LIST.map(c => c.symbol);

// Category definitions with metadata
export const CATEGORY_META: Record<CryptoCategory, { label: string; emoji: string; color: string }> = {
  "Layer 1": { label: "Layer 1", emoji: "⛓️", color: "#627eea" },
  "Layer 2": { label: "Layer 2", emoji: "🔲", color: "#8247e5" },
  "DeFi": { label: "DeFi", emoji: "🏦", color: "#2a5ada" },
  "Meme": { label: "Meme", emoji: "🐕", color: "#c3a634" },
  "AI": { label: "IA", emoji: "🤖", color: "#1d1d3c" },
  "Gaming": { label: "Gaming", emoji: "🎮", color: "#00c3ff" },
  "Infrastructure": { label: "Infraestrutura", emoji: "🔧", color: "#0090ff" },
  "Exchange": { label: "Exchange", emoji: "💱", color: "#00aae4" },
  "Stablecoin": { label: "Stablecoin", emoji: "💲", color: "#26a17b" },
  "Inovação": { label: "Inovação", emoji: "✨", color: "#ec4899" },
  "Outros": { label: "Outros", emoji: "🌐", color: "#64748b" },
};

// Generate deterministic vibrant HSL color for any new coin
export function generateColorForSymbol(sym: string): string {
  let hash = 0;
  for (let i = 0; i < sym.length; i++) {
    hash = sym.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 75%, 52%)`;
}

export function getCryptoName(baseOrSymbol: string): string {
  const clean = String(baseOrSymbol || "").toUpperCase();
  const sym = clean.endsWith("USDT") ? clean : `${clean}USDT`;
  return CRYPTO_NAMES[sym] || clean.replace(/USDT$/, "");
}

export function getCryptoIcon(baseOrSymbol: string): string {
  const clean = String(baseOrSymbol || "").toUpperCase().replace(/USDT$/, "");
  return clean.slice(0, 4);
}

export function getAssetCategory(baseOrSymbol: string): CryptoCategory {
  const clean = String(baseOrSymbol || "").toUpperCase();
  const sym = clean.endsWith("USDT") ? clean : `${clean}USDT`;
  return CRYPTO_CATEGORIES[sym] || "Inovação";
}

// Dynamically register new symbols fetched from Binance (only valid Spot crypto pairs)
export function registerDynamicSymbols(
  symbols: Array<{ symbol: string; name?: string; short?: string; category?: string }>
) {
  for (const item of symbols) {
    const sym = String(item?.symbol || "").toUpperCase();
    if (!isTradableBinanceSpotSymbol(sym)) continue;
    if (!CRYPTO_BY_SYMBOL[sym]) {
      const short = item.short || sym.replace(/USDT$/, "");
      const name = item.name && item.name !== sym ? item.name : short;
      const category = (item.category as CryptoCategory) || "Inovação";
      const color = generateColorForSymbol(sym);

      const meta: CryptoMeta = {
        symbol: sym,
        name,
        short,
        color,
        category,
        description: `Par ${short}/USDT negociado na Binance`,
        rank: 999,
      };

      CRYPTO_LIST.push(meta);
      CRYPTO_BY_SYMBOL[sym] = meta;
      CRYPTO_COLORS[sym] = color;
      CRYPTO_NAMES[sym] = name;
      CRYPTO_CATEGORIES[sym] = category;
      CRYPTO_SHORTS[sym] = short;
      if (!ALL_SYMBOLS.includes(sym)) {
        ALL_SYMBOLS.push(sym);
      }
    }
  }
}

// Get or create metadata for any symbol on the fly
export function getCryptoMeta(symbol: string): CryptoMeta {
  if (CRYPTO_BY_SYMBOL[symbol]) return CRYPTO_BY_SYMBOL[symbol];
  const short = symbol.replace(/USDT$/, "");
  const color = generateColorForSymbol(symbol);
  const meta: CryptoMeta = {
    symbol,
    name: short,
    short,
    color,
    category: "Inovação",
    rank: 999,
    description: `Par ${short}/USDT negociado na Binance`,
  };
  if (isTradableBinanceSpotSymbol(symbol)) {
    CRYPTO_LIST.push(meta);
    CRYPTO_BY_SYMBOL[symbol] = meta;
    CRYPTO_COLORS[symbol] = color;
    CRYPTO_NAMES[symbol] = short;
    CRYPTO_CATEGORIES[symbol] = "Inovação";
    CRYPTO_SHORTS[symbol] = short;
    if (!ALL_SYMBOLS.includes(symbol)) ALL_SYMBOLS.push(symbol);
  }
  return meta;
}

// Get symbols by category
export function getSymbolsByCategory(category: CryptoCategory): string[] {
  return CRYPTO_LIST.filter(c => c.category === category).map(c => c.symbol);
}

// Search function
export function searchCrypto(query: string): CryptoMeta[] {
  const q = query.toLowerCase().trim();
  if (!q) return CRYPTO_LIST;
  return CRYPTO_LIST.filter(c => 
    c.name.toLowerCase().includes(q) || 
    c.short.toLowerCase().includes(q) || 
    c.symbol.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q)
  );
}
