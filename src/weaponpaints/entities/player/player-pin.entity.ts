import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors `wp_player_pins`. Stores the chosen pin (coin) id per team.
 */
@Entity('wp_player_pins', { synchronize: false })
export class PlayerPin {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 64 })
  steamid!: string;

  @PrimaryColumn({ name: 'weapon_team', type: 'int' })
  weaponTeam!: number;

  @Column({ name: 'id', type: 'int' })
  pinId!: number;
}
