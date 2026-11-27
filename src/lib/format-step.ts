/**
 * Utilitário leve de quantização e arredondamento decimal sem dependências externas.
 * Substitui o uso pontual de bibliotecas pesadas prevenindo perda de precisão float.
 */
export function formatStepExact(value: number | string, stepSize: number | string): string {
  const v = typeof value === "string" ? parseFloat(value) : value;
  const s = typeof stepSize === "string" ? parseFloat(stepSize) : stepSize;
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (!Number.isFinite(s) || s <= 0) return String(v);

  const stepStr = s.toString();
  const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
  const factor = Math.pow(10, decimals);
  const steps = Math.floor(Math.round(v * factor * 1000) / 1000 / Math.round(s * factor * 1000) * 1000 / 1000);
  const result = Math.floor((v + 1e-12) / s) * s;
  return result.toFixed(decimals);
}

export function formatTickExact(price: number | string, tickSize: number | string): string {
  const p = typeof price === "string" ? parseFloat(price) : price;
  const t = typeof tickSize === "string" ? parseFloat(tickSize) : tickSize;
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (!Number.isFinite(t) || t <= 0) return String(p);

  const tickStr = t.toString();
  const decimals = tickStr.includes(".") ? tickStr.split(".")[1].length : 0;
  const result = Math.round(p / t) * t;
  return result.toFixed(decimals);
}
