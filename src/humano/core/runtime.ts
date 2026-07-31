import type { Clock, IdGenerator, TokenEstimator } from "../ports/contracts";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  create(): string {
    return crypto.randomUUID();
  }
}

export class CharacterTokenEstimator implements TokenEstimator {
  constructor(private readonly charsPerToken: number) {}

  estimate(text: string): number {
    return Math.max(1, Math.ceil(text.length / this.charsPerToken));
  }
}
