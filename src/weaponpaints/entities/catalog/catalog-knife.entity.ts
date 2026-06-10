import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_knives')
export class CatalogKnife {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  weaponName!: string;

  /**
   * Weapon entity class name used by the CS2 server / WeaponPaints plugin
   * (e.g. `weapon_knife_butterfly`). The frontend should send this value
   * when equipping a knife via `PUT /weaponpaints/loadout/knife`.
   */
  @Column({ type: 'varchar', nullable: true })
  weaponEntity!: string | null;

  @Column()
  weaponDefindex!: number;

  @Column()
  paintIndex!: number;

  @Column({ nullable: true })
  rarity!: string;

  @Column({ nullable: true })
  image!: string;
}
