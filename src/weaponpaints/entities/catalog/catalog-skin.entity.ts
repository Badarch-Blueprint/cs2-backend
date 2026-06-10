import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_skins')
export class CatalogSkin {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  weaponName!: string;

  @Column()
  weaponDefindex!: number;

  @Column()
  paintIndex!: number;

  @Column({ nullable: true })
  rarity!: string;

  @Column({ nullable: true })
  image!: string;
}
