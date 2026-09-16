import {
  StrategyDetector,
} from './strategy-contract';

import {
  SP2LDetector,
} from './sp2l/adapter';

import {
  BTBDetector,
} from './btb/detector';

import {
  MicroMAPDetector,
} from './micromap/detector';

export function createStrategyRegistry():
  StrategyDetector[] {

  return [
    new SP2LDetector(),
    new BTBDetector(),
    new MicroMAPDetector(),
  ];
}
