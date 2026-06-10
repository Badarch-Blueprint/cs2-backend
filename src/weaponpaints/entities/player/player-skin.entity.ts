import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Mirrors the `wp_player_skins` table created by the cs2-WeaponPaints plugin.
 * See Utility.CheckDatabaseTables in https://github.com/Nereziel/cs2-WeaponPaints.
 *
 * Uniqueness is defined by (steamid, weapon_team, weapon_defindex). The plugin
 * declares this as a UNIQUE constraint rather than a PRIMARY KEY, but TypeORM
 * requires a primary key, so we declare the same tuple as the composite PK here.
 */
@Entity('wp_player_skins', { synchronize: false })
export class PlayerSkin {
  @PrimaryColumn({ name: 'steamid', type: 'varchar', length: 18 })
  steamid!: string;

  @PrimaryColumn({ name: 'weapon_team', type: 'int' })
  weaponTeam!: number;

  @PrimaryColumn({ name: 'weapon_defindex', type: 'int' })
  weaponDefindex!: number;

  @Column({ name: 'weapon_paint_id', type: 'int' })
  weaponPaintId!: number;

  @Column({ name: 'weapon_wear', type: 'float', default: 0.000001 })
  weaponWear!: number;

  @Column({ name: 'weapon_seed', type: 'int', default: 0 })
  weaponSeed!: number;

  @Column({ name: 'weapon_nametag', type: 'varchar', length: 128, nullable: true })
  weaponNametag!: string | null;

  @Column({ name: 'weapon_stattrak', type: 'tinyint', default: 0 })
  weaponStattrak!: number;

  @Column({ name: 'weapon_stattrak_count', type: 'int', default: 0 })
  weaponStattrakCount!: number;

  @Column({ name: 'weapon_sticker_0', type: 'varchar', length: 128, default: '0;0;0;0;0;0;0' })
  weaponSticker0!: string;

  @Column({ name: 'weapon_sticker_1', type: 'varchar', length: 128, default: '0;0;0;0;0;0;0' })
  weaponSticker1!: string;

  @Column({ name: 'weapon_sticker_2', type: 'varchar', length: 128, default: '0;0;0;0;0;0;0' })
  weaponSticker2!: string;

  @Column({ name: 'weapon_sticker_3', type: 'varchar', length: 128, default: '0;0;0;0;0;0;0' })
  weaponSticker3!: string;

  @Column({ name: 'weapon_sticker_4', type: 'varchar', length: 128, default: '0;0;0;0;0;0;0' })
  weaponSticker4!: string;

  @Column({ name: 'weapon_keychain', type: 'varchar', length: 128, default: '0;0;0;0;0' })
  weaponKeychain!: string;
}
