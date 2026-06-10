import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors `wp_player_music`. Stores the chosen music kit id per team.
 */
@Entity('wp_player_music', { synchronize: false })
export class PlayerMusic {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 64 })
  steamid!: string;

  @PrimaryColumn({ name: 'weapon_team', type: 'int' })
  weaponTeam!: number;

  @Column({ name: 'music_id', type: 'int' })
  musicId!: number;
}
