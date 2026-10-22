import { describe, it, expect } from "bun:test";

describe("Desktop HFT UI & Order Book Enhancements", () => {
  describe("1. Cálculos de Circuit Breaker Diário (BotCockpit)", () => {
    it("deve calcular a perda diária e a razão de limite sobre o NAV (teto de 3.0%)", () => {
      const totalBalance = 1000;
      const maxLossLimit = totalBalance * 0.03; // $30 USDT
      expect(maxLossLimit).toBe(30);

      // Sem prejuízo (lucro de $10)
      const dailyProfit = 10;
      const lossProfit = dailyProfit < 0 ? Math.abs(dailyProfit) : 0;
      const ratioSafe = (lossProfit / maxLossLimit) * 100;
      expect(ratioSafe).toBe(0);

      // Prejuízo moderado ($15 de $30 = 50%)
      const lossModerate = 15;
      const ratioModerate = (lossModerate / maxLossLimit) * 100;
      expect(ratioModerate).toBe(50);
      expect(ratioModerate >= 75).toBe(false);

      // Prejuízo em alerta amarelo ($24 de $30 = 80%)
      const lossWarning = 24;
      const ratioWarning = (lossWarning / maxLossLimit) * 100;
      expect(ratioWarning).toBe(80);
      expect(ratioWarning >= 75 && ratioWarning < 100).toBe(true);

      // Circuit Breaker travado ($33 de $30 = 110%)
      const lossBreached = 33;
      const ratioBreached = Math.min(100, (lossBreached / maxLossLimit) * 100);
      expect(ratioBreached).toBe(100);
    });
  });

  describe("2. Formatação Numérica Tabular de Preços e Volumes (OrderBook)", () => {
    function formatBookPrice(price: number): string {
      if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (price >= 1) return price.toFixed(4);
      return price.toFixed(6);
    }

    function formatBookVolume(vol: number): string {
      if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
      if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
      if (vol >= 1) return vol.toFixed(4);
      return vol.toFixed(6);
    }

    it("deve formatar preços institucionais com precisão constante e tabular", () => {
      expect(formatBookPrice(65432.1)).toBe("65,432.10");
      expect(formatBookPrice(2450.555)).toBe("2,450.56");
      expect(formatBookPrice(3.45678)).toBe("3.4568");
      expect(formatBookPrice(0.001234)).toBe("0.001234");
    });

    it("deve abreviar volumes do order book sem perda de legibilidade", () => {
      expect(formatBookVolume(1500000)).toBe("1.50M");
      expect(formatBookVolume(42500)).toBe("42.50K");
      expect(formatBookVolume(12.34567)).toBe("12.3457");
      expect(formatBookVolume(0.054321)).toBe("0.054321");
    });
  });

  describe("3. Detecção de Micro-Tick Flash (OrderBook)", () => {
    it("deve detectar variações de volume em níveis existentes para disparar flash suave", () => {
      const prevVolumes = new Map<number, number>([
        [65000, 1.5],
        [64990, 3.2],
        [64980, 0.8],
      ]);

      const nextBids = [
        { price: 65000, volume: 1.5 }, // Sem alteração
        { price: 64990, volume: 4.8 }, // Volume aumentou
        { price: 64980, volume: 0.8 }, // Sem alteração
        { price: 64970, volume: 2.0 }, // Novo nível
      ];

      const newFlashes: Record<number, "bid" | "ask"> = {};
      nextBids.forEach((b) => {
        const prev = prevVolumes.get(b.price);
        if (prev !== undefined && prev !== b.volume) {
          newFlashes[b.price] = "bid";
        }
      });

      expect(newFlashes[64990]).toBe("bid");
      expect(newFlashes[65000]).toBeUndefined();
      expect(newFlashes[64980]).toBeUndefined();
    });
  });

  describe("4. Telemetria e Latência de Rede (GlobalStatusBar)", () => {
    function classifyLatency(latencyMs: number) {
      const isGood = latencyMs <= 80;
      const isModerate = latencyMs > 80 && latencyMs <= 200;
      const isHigh = latencyMs > 200;
      return { isGood, isModerate, isHigh };
    }

    it("deve classificar latências com base nas tolerâncias do Pilar 1", () => {
      expect(classifyLatency(35)).toEqual({ isGood: true, isModerate: false, isHigh: false });
      expect(classifyLatency(80)).toEqual({ isGood: true, isModerate: false, isHigh: false });
      expect(classifyLatency(120)).toEqual({ isGood: false, isModerate: true, isHigh: false });
      expect(classifyLatency(250)).toEqual({ isGood: false, isModerate: false, isHigh: true });
    });
  });
});
