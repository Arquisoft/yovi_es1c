export class TurnTimerService {
  buildTimerEndsAt(turnTimeoutSec: number, now = Date.now()): number {
    return now + turnTimeoutSec * 1000;
  }
}
