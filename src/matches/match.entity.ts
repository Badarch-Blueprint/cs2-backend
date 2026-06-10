import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MatchStatus } from './match-status.enum';
import { Team } from '../teams/team.entity';

/**
 * Completed or scheduled match: final scores (e.g. 13–8), optional team FKs,
 * and wall-clock bounds.
 *
 * Use {@link Match.code} for an optional bracket slot identifier (no zone FK), e.g.
 * Swiss zone rows: `Zone-C-R2-M1` (round 2, match 1); playoffs: `Playoff-Semi-1`.
 *
 * `roundDiff` is |scoreA − scoreB| whenever both scores are set; otherwise null.
 *
 * {@link MatchStatus} on {@link Match.status} drives veto / server / live / done flow.
 */
@Entity('matches')
@Index(['startAt'])
@Index(['lobbyId'])
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * When non-null, this match belongs to a rental Lobby (see `lobbies` table).
   * Kept as an opaque UUID — no TypeORM relation to avoid cyclical module imports
   * between `matches` / `lobbies`.
   */
  @Column({ name: 'lobby_id', type: 'uuid', nullable: true })
  lobbyId!: string | null;

  /**
   * Optional bracket slot code (one string), e.g. `Zone-C-Match-1`, `Playoff-Semi-1`.
   */
  @Column({ name: 'code', type: 'varchar', length: 160, nullable: true })
  code!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 48,
    default: MatchStatus.SCHEDULED,
  })
  status!: MatchStatus;

  @ManyToOne(() => Team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_a_id' })
  teamA!: Team | null;

  @ManyToOne(() => Team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_b_id' })
  teamB!: Team | null;

  /** Final score for side A (e.g. rounds 13 in a 13–8 result). */
  @Column({ name: 'score_a', type: 'int', nullable: true })
  scoreA!: number | null;

  /** Final score for side B. */
  @Column({ name: 'score_b', type: 'int', nullable: true })
  scoreB!: number | null;

  /** |scoreA − scoreB| when both scores are present. */
  @Column({ name: 'round_diff', type: 'int', nullable: true })
  roundDiff!: number | null;

  /**
   * Map played after veto (or chosen decider). Set when veto completes or admin assigns.
   */
  @Column({ name: 'map_name', type: 'varchar', length: 64, nullable: true })
  mapName!: string | null;

  /** Ban order during map veto (canonical CS2 competitive map names). */
  @Column({ name: 'veto_bans', type: 'jsonb', nullable: true })
  vetoBans!: string[] | null;

  /**
   * Maps chosen during Bo3 veto picks (playoffs). Empty or null for Bo1-only matches.
   */
  @Column({ name: 'veto_picks', type: 'jsonb', nullable: true })
  vetoPicks!: string[] | null;

  /**
   * Starting side choices for picked maps (order follows {@link Match.vetoPicks}):
   * each value is 'ct' or 't', selected by the opposing captain for that picked map.
   */
  @Column({ name: 'veto_pick_sides', type: 'jsonb', nullable: true })
  vetoPickSides!: ('ct' | 't')[] | null;

  @Column({ name: 'start_at', type: 'timestamp' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamp', nullable: true })
  endAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Public hostname/IP for CS2 `connect` (players reach the game port here).
   * Set when the LAN orchestrator reports the container is LIVE.
   */
  @Column({ name: 'game_server_host', type: 'varchar', length: 128, nullable: true })
  gameServerHost!: string | null;

  @Column({ name: 'game_port', type: 'int', nullable: true })
  gamePort!: number | null;

  @Column({ name: 'tv_port', type: 'int', nullable: true })
  tvPort!: number | null;

  /** Full console command, e.g. `connect 192.168.10.63:27015`. */
  @Column({ name: 'connect_command', type: 'varchar', length: 256, nullable: true })
  connectCommand!: string | null;

  /** Truncated orchestrator stdout for debugging (optional). */
  @Column({ name: 'cs2_start_log', type: 'text', nullable: true })
  cs2StartLog!: string | null;

  @BeforeInsert()
  @BeforeUpdate()
  syncRoundDiff(): void {
    if (this.scoreA != null && this.scoreB != null) {
      this.roundDiff = Math.abs(this.scoreA - this.scoreB);
    } else {
      this.roundDiff = null;
    }
  }
}
