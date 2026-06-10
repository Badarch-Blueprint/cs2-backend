import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors `wp_player_gloves`. Paint customisation for gloves (if any) is
 * stored in {@link PlayerSkin} keyed by the glove's defindex.
 */
@Entity('wp_player_gloves', { synchronize: false })
export class PlayerGlove {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 18 })
  steamid!: string;

  @PrimaryColumn({ name: 'weapon_team', type: 'int' })
  weaponTeam!: number;

  @Column({ name: 'weapon_defindex', type: 'int' })
  weaponDefindex!: number;
}
