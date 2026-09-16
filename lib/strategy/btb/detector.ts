import {
  Candle,
  MarketContext,
  StrategySignal,
} from '../types';

import { StrategyDetector } from '../strategy-contract';
import {
  StrategyZone,
  detectZoneReturn,
  zoneContainsPrice,
} from '../context/zones';
import { buildRiskPlan } from '../risk';
import { CONFIG } from '../config';

type ContextWithZones = MarketContext & {
  strategyZones?: StrategyZone[];
};

function bodyRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

function bullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function bearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function invalid(
  reasons: string[],
  warnings: string[] = []
): StrategySignal {
  return {
    strategy: 'PRO_BTB',
    status: 'INVALID',
    direction: null,
    score: 0,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    risk: null,
    reasons,
    warnings,
  };
}

export class BTBDetector implements StrategyDetector {
  readonly name = 'PRO_BTB' as const;

  analyze(
    candles: Candle[],
    context: MarketContext
  ): StrategySignal {
    if (candles.length < 10) {
      return invalid(['Insufficient candles for BTB']);
    }

    const ctx = context as ContextWithZones;
    const zones = ctx.strategyZones ?? [];

    /*
     * BTB is intentionally zone-aware:
     *
     * previous impulse/zone
     *       ↓
     * price departs from zone
     *       ↓
     * price returns to zone
     *       ↓
     * confirmation candle
     *
     * This is a first deterministic implementation.
     * It is NOT presented as a final transcription of
     * the teacher's proprietary rules until those rules
     * are explicitly validated against the source material.
     */

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const candidateZones = zones
      .filter(z => z.active)
      .filter(z =>
        z.source === 'SPIKE' ||
        z.source === 'FVG' ||
        z.source === 'BREAKOUT'
      )
      .sort((a, b) => b.strength - a.strength);

    for (const zone of candidateZones) {
      if (!detectZoneReturn(candles, zone, 3)) {
        continue;
      }

      if (!zoneContainsPrice(zone, current.close) &&
          !(current.high >= zone.low && current.low <= zone.high)) {
        continue;
      }

      const direction = zone.direction;

      const confirmation =
        direction === 'LONG'
          ? bullish(current) &&
            current.close > previous.close &&
            bodyRatio(current) >= CONFIG.confirmation.minBodyToRange
          : bearish(current) &&
            current.close < previous.close &&
            bodyRatio(current) >= CONFIG.confirmation.minBodyToRange;

      if (!confirmation) {
        return {
          strategy: 'PRO_BTB',
          status: 'WATCH',
          direction,
          score: Math.min(75, zone.strength + 5),
          entry: null,
          stopLoss: null,
          takeProfit: null,
          risk: null,
          reasons: [
            `BTB return detected into ${zone.source} zone`,
            'Confirmation candle is not complete',
          ],
          warnings: [
            'BTB is waiting for directional confirmation',
          ],
        };
      }

      const entry = current.close;

      const stop =
        direction === 'LONG'
          ? Math.min(current.low, zone.low)
          : Math.max(current.high, zone.high);

      const risk = buildRiskPlan(
        direction,
        entry,
        stop,
        0,
        CONFIG
      );

      if (!risk.tradable) {
        return {
          strategy: 'PRO_BTB',
          status: 'INVALID',
          direction,
          score: zone.strength,
          entry,
          stopLoss: stop,
          takeProfit: risk.takeProfit,
          risk,
          reasons: [
            `BTB reaction found in ${zone.source} zone`,
            'Risk engine rejected the setup',
          ],
          warnings: [
            risk.noTradeReason ?? 'Risk constraints failed',
          ],
        };
      }

      const alignmentBonus =
        context.structureAlignment ? 10 : 0;

      const score = Math.min(
        100,
        zone.strength +
          alignmentBonus +
          10
      );

      return {
        strategy: 'PRO_BTB',
        status: 'VALID',
        direction,
        score,
        entry,
        stopLoss: stop,
        takeProfit: risk.takeProfit,
        risk,
        reasons: [
          `BTB reaction detected in ${zone.source} zone`,
          'Price departed from the zone before returning',
          'Directional confirmation candle detected',
          ...(context.structureAlignment
            ? ['Multi-timeframe structure aligned']
            : []),
        ],
        warnings: [],
      };
    }

    /*
     * Keep a WATCH state when price is close to a zone,
     * even if a complete return has not occurred yet.
     */
    const nearZone = candidateZones.find(zone => {
      const tolerance = Math.max(
        0.05,
        current.close * 0.0003
      );

      return (
        current.high >= zone.low - tolerance &&
        current.low <= zone.high + tolerance
      );
    });

    if (nearZone) {
      return {
        strategy: 'PRO_BTB',
        status: 'WATCH',
        direction: nearZone.direction,
        score: Math.min(60, nearZone.strength),
        entry: null,
        stopLoss: null,
        takeProfit: null,
        risk: null,
        reasons: [
          `Price is near ${nearZone.source} zone`,
          'BTB return/confirmation not completed',
        ],
        warnings: [],
      };
    }

    return invalid(
      ['No zone-based BTB setup'],
      zones.length === 0
        ? ['No strategy zones available for BTB']
        : []
    );
  }
}
