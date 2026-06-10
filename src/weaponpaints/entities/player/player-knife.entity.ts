import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors `wp_player_knife`. Stores the chosen knife weapon entity (e.g.
 * "weapon_knife_butterfly") per player and team. Paint/seed/wear for that
 * knife live in {@link PlayerSkin} keyed by the knife's defindex.
 */
@Entity('wp_player_knife', { synchronize: false })
export class PlayerKnife {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 18 })
  steamid!: string;

  @PrimaryColumn({ name: 'weapon_team', type: 'int' })
  weaponTeam!: number;

  @Column({ name: 'knife', type: 'varchar', length: 64 })
  knife!: string;
}
