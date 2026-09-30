/**
 * Queue Position Tracker
 * Estimates the exact placement of our Limit Order in the exchange order book queue.
 * Calculates distance from the best bid/ask and queue density.
 */

export interface OrderPosition {
  estimatedQueueIndex: number;
  totalQueueVolume: number;
  estimatedFillProbability: number; // 0.0 to 1.0
  averageFillTimeSeconds: number;
}

export class QueuePositionTracker {
  /**
   * Estimates queue parameters based on total depth volume, tick distance, and trade velocity.
   */
  public static estimatePosition(
    orderPrice: number,
    orderVolume: number,
    depth: Array<{ price: number; volume: number }>,
    tradeVelocityPerSecond: number
  ): OrderPosition {
    if (depth.length === 0) {
      return { estimatedQueueIndex: 1, totalQueueVolume: orderVolume, estimatedFillProbability: 1.0, averageFillTimeSeconds: 1 };
    }

    // Sort depth to see how much volume is ahead of us
    const isBid = orderPrice <= depth[0].price; // lower or equal is buy order queue
    
    let volumeAhead = 0;
    for (const level of depth) {
      if (isBid && level.price > orderPrice) {
        volumeAhead += level.volume;
      } else if (!isBid && level.price < orderPrice) {
        volumeAhead += level.volume;
      }
    }

    const totalQueueVolume = volumeAhead + orderVolume;
    
    // Position index proxy
    const estimatedQueueIndex = Math.max(1, Math.round(volumeAhead / (orderVolume || 1)));

    // Fill probability calculation: lower volume ahead means higher prob
    const estimatedFillProbability = Math.max(
      0.05,
      Math.min(0.99, 1.0 - volumeAhead / (volumeAhead + 50000))
    );

    // Average time based on trade speed/velocity
    const averageFillTimeSeconds = tradeVelocityPerSecond > 0 
      ? Math.max(1, Math.round(volumeAhead / tradeVelocityPerSecond))
      : 300; // fallback 5 min

    return {
      estimatedQueueIndex,
      totalQueueVolume,
      estimatedFillProbability,
      averageFillTimeSeconds,
    };
  }
}
