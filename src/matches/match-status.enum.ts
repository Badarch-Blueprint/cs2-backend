/** Lifecycle of a match row (zone, playoff, or future auto-scheduled). */
export enum MatchStatus {
  /** Created from matchmaking / admin schedule; not yet in veto. */
  SCHEDULED = 'SCHEDULED',
  /** Teams assigned; waiting to start map veto. */
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  /** Map ban/pick in progress. */
  VETO_PHASE = 'VETO_PHASE',
  /** Veto finished; game server (e.g. Docker CS2) is starting. */
  CONFIGURING_SERVER = 'CONFIGURING_SERVER',
  /** Server reachable; join / live play. */
  LIVE = 'LIVE',
  /** Final scores / stats recorded (e.g. MatchZy post-match). */
  FINISHED = 'FINISHED',
  /** Stopped by admin before a normal finish. */
  CANCELLED = 'CANCELLED',
}
