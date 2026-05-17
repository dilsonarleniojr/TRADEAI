export function formatPrice(price: number | string | undefined | null): string {
  const num = typeof price === 'string' ? parseFloat(price) : Number(price);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  if (num >= 1000)
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (num >= 1)
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

export function formatVolume(volume: number | string | undefined | null): string {
  const num = typeof volume === 'string' ? parseFloat(volume) : Number(volume);
  if (!Number.isFinite(num)) return '$0.00';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function formatPercent(percent: number | string | undefined | null): string {
  const num = typeof percent === 'string' ? parseFloat(percent) : Number(percent);
  if (!Number.isFinite(num)) return '0.00%';
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

export function formatTime(timestamp: number | string | undefined | null): string {
  const num = typeof timestamp === 'string' ? parseFloat(timestamp) : Number(timestamp);
  if (!Number.isFinite(num)) return '--:--';
  return new Date(num).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(timestamp: number | string | undefined | null): string {
  const num = typeof timestamp === 'string' ? parseFloat(timestamp) : Number(timestamp);
  if (!Number.isFinite(num)) return '';
  return new Date(num).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
