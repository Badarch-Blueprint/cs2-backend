import type { LobbyFeatures, LobbyMode, LobbyRegion } from './lobby.types';

/** Event name consumed by {@link LobbyProvisioningService}. */
export const LOBBY_PROVISIONING_REQUESTED = 'lobby.provisioning.requested';

/**
 * Fired once lobby veto completes and the lobby row is marked PROVISIONING.
 * The eventual CS2 provisioner agent listens for this; during development,
 * admins PATCH the rental server to simulate readiness.
 */
export interface LobbyProvisioningRequestedEvent {
  readonly lobbyId: string;
  readonly matchId: string;
  readonly rentalServerId: string;
  readonly mode: LobbyMode;
  readonly region: LobbyRegion;
  readonly features: LobbyFeatures;
  /**
   * The single map the provisioner should boot the game server on for the
   * current leg of the series. BO3/BO5 advance via
   * `POST /admin/rental-servers/:id/map-finished` which re-emits this event
   * with the next map.
   */
  readonly mapName: string;
  /** 0-based index into {@link vetoSeriesMaps}. */
  readonly seriesMapIndex: number;
  /** True when {@link mapName} is the last map in the series. */
  readonly isFinalMap: boolean;
  /** Full ordered map list for context (picks + decider). */
  readonly vetoSeriesMaps: readonly string[];
  readonly serverPassword: string | null;
}
