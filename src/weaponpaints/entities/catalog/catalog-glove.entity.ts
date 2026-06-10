import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_gloves')
export class CatalogGlove {
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
