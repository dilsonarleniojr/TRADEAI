/**
 * Largest Triangle Three Buckets (LTTB) Downsampling Algorithm
 *
 * Algoritmo de amostragem adaptativa geométrica para séries temporais e curvas
 * de patrimônio contínuas (Equity Curves) no Diário e no Estúdio Quant.
 *
 * Preserva picos, vales (drawdowns) e a tendência estrutural da curva ao reduzir
 * uma série de O(N) operações para uma malha constante (ex: 60 pontos), eliminando
 * sobrecarga de renderização de milhares de nós <circle> e polígonos no DOM/SSR.
 *
 * Referência: Sveinn Steinarsson (MIT / University of Iceland)
 */

export interface LTTBAccessors<T> {
  getX?: (item: T, index: number) => number;
  getY?: (item: T, index: number) => number;
}

/**
 * Reduz uma série de dados para um número fixo de pontos representativos (threshold),
 * preservando a integridade visual e os extremos (topos/fundos).
 *
 * @param data Lista original de pontos/trades
 * @param threshold Número alvo de pontos na saída (padrão: 60)
 * @param accessors Funções extratoras de coordenada X e Y (opcionais)
 * @returns Array reduzido contendo exatamente `threshold` pontos (ou o array original se data.length <= threshold)
 */
export function lttbDownsample<T>(
  data: readonly T[],
  threshold: number = 60,
  accessors?: LTTBAccessors<T>
): T[] {
  const dataLen = data.length;

  // Se o número de pontos for menor ou igual ao threshold, ou threshold for insuficiente
  if (threshold >= dataLen || threshold <= 2) {
    return Array.from(data);
  }

  const getX =
    accessors?.getX ??
    ((item: any, index: number): number => {
      if (typeof item === "number") return index;
      if (typeof item?.x === "number") return item.x;
      if (item?.timestamp) {
        const t = new Date(item.timestamp).getTime();
        return isNaN(t) ? index : t;
      }
      return index;
    });

  const getY =
    accessors?.getY ??
    ((item: any): number => {
      if (typeof item === "number") return item;
      if (typeof item?.equity === "number") return item.equity;
      if (typeof item?.y === "number") return item.y;
      if (typeof item?.pnl === "number") return item.pnl;
      return 0;
    });

  const sampled: T[] = new Array(threshold);
  let sampledIndex = 0;

  // Tamanho médio de cada balde nos pontos intermediários
  const every = (dataLen - 2) / (threshold - 2);

  // O primeiro ponto da série é sempre preservado (ancoragem inicial)
  let aIndex = 0;
  sampled[sampledIndex++] = data[aIndex];

  for (let i = 0; i < threshold - 2; i++) {
    // Calcula o ponto médio do PRÓXIMO balde (C)
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * every) + 1;
    let avgRangeEnd = Math.floor((i + 2) * every) + 1;
    if (avgRangeEnd > dataLen) {
      avgRangeEnd = dataLen;
    }

    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (let idx = avgRangeStart; idx < avgRangeEnd; idx++) {
      avgX += getX(data[idx], idx);
      avgY += getY(data[idx], idx);
    }

    if (avgRangeLength > 0) {
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    }

    // Intervalo do balde ATUAL
    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;

    // Ponto A (ponto selecionado no balde anterior)
    const pointAX = getX(data[aIndex], aIndex);
    const pointAY = getY(data[aIndex], aIndex);

    let maxArea = -1;
    let maxAreaIndex = rangeOffs;

    // Busca o ponto B no balde atual que maximiza a área do triângulo (A, B, C)
    for (let idx = rangeOffs; idx < rangeTo; idx++) {
      const pointBX = getX(data[idx], idx);
      const pointBY = getY(data[idx], idx);

      // Área do triângulo em 2D: 0.5 * |(Ax - Cx)(By - Ay) - (Ax - Bx)(Cy - Ay)|
      const area = Math.abs(
        (pointAX - avgX) * (pointBY - pointAY) -
          (pointAX - pointBX) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = idx;
      }
    }

    // Seleciona o ponto de maior área para o balde atual
    sampled[sampledIndex++] = data[maxAreaIndex];
    aIndex = maxAreaIndex;
  }

  // O último ponto da série é sempre preservado (ancoragem final)
  sampled[sampledIndex] = data[dataLen - 1];

  return sampled;
}
