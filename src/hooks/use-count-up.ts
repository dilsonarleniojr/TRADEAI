"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * useCountUp - Animates a number from its old value to a new value over time.
 * Uses easeOut curve for smooth deceleration.
 *
 * @param targetValue - The new value to animate to
 * @param duration - Animation duration in ms (default 500)
 * @param enabled - Whether animation is enabled (default true)
 * @returns The current animated value
 */
export function useCountUp(
  targetValue: number,
  duration: number = 500,
  enabled: boolean = true
): number {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevValueRef = useRef(targetValue);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const easeOut = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Skip animation - just use the target directly
      prevValueRef.current = targetValue;
      return;
    }

    const startValue = prevValueRef.current;
    if (startValue === targetValue) return;

    const diff = targetValue - startValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);
      const currentValue = startValue + diff * easedProgress;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
        prevValueRef.current = targetValue;
      }
    };

    // Cancel previous animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, enabled, easeOut]);

  // When animation is disabled, sync display value
  if (!enabled) {
    return targetValue;
  }

  return displayValue;
}
