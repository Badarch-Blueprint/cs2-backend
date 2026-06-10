import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wp_catalog_stickers')
export class CatalogSticker {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  defindex!: number;

  @Column({ nullable: true })
  rarity!: string;

  @Column({ nullable: true })
  image!: string;
}
