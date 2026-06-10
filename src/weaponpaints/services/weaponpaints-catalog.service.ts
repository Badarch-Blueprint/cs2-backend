import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';

import { CatalogSkin } from '../entities/catalog/catalog-skin.entity';
import { CatalogAgent } from '../entities/catalog/catalog-agent.entity';
import { CatalogCollectible } from '../entities/catalog/catalog-collectible.entity';
import { CatalogGlove } from '../entities/catalog/catalog-glove.entity';
import { CatalogKeychain } from '../entities/catalog/catalog-keychain.entity';
import { CatalogKnife } from '../entities/catalog/catalog-knife.entity';
import { CatalogMusic } from '../entities/catalog/catalog-music.entity';
import { CatalogSticker } from '../entities/catalog/catalog-sticker.entity';
import { CatalogVersion } from '../entities/catalog/catalog-version.entity';

@Injectable()
export class WeaponPaintsCatalogService {
  constructor(
    @InjectRepository(CatalogSkin)
    private readonly skinRepo: Repository<CatalogSkin>,
    @InjectRepository(CatalogAgent)
    private readonly agentRepo: Repository<CatalogAgent>,
    @InjectRepository(CatalogCollectible)
    private readonly collectibleRepo: Repository<CatalogCollectible>,
    @InjectRepository(CatalogGlove)
    private readonly gloveRepo: Repository<CatalogGlove>,
    @InjectRepository(CatalogKeychain)
    private readonly keychainRepo: Repository<CatalogKeychain>,
    @InjectRepository(CatalogKnife)
    private readonly knifeRepo: Repository<CatalogKnife>,
    @InjectRepository(CatalogMusic)
    private readonly musicRepo: Repository<CatalogMusic>,
    @InjectRepository(CatalogSticker)
    private readonly stickerRepo: Repository<CatalogSticker>,
    @InjectRepository(CatalogVersion)
    private readonly versionRepo: Repository<CatalogVersion>,
  ) {}

  async getVersion(): Promise<Date | null> {
    const version = await this.versionRepo.findOne({ where: { id: 'latest' } });
    return version?.updatedAt || null;
  }

  async getSkins(weaponName?: string, query?: string): Promise<CatalogSkin[]> {
    const where: any = {};
    if (weaponName) where.weaponName = weaponName;
    if (query) where.name = Like(`%${query}%`);
    return this.skinRepo.find({ where, take: 100 });
  }

  async getAgents(team?: string): Promise<CatalogAgent[]> {
    const where: any = {};
    if (team) where.team = team;
    return this.agentRepo.find({ where });
  }

  async getGloves(): Promise<CatalogGlove[]> {
    return this.gloveRepo.find();
  }

  async getKnives(): Promise<CatalogKnife[]> {
    return this.knifeRepo.find();
  }

  async getMusicKits(): Promise<CatalogMusic[]> {
    return this.musicRepo.find();
  }

  async getPins(): Promise<CatalogCollectible[]> {
    return this.collectibleRepo.find();
  }

  async getStickers(query?: string): Promise<CatalogSticker[]> {
    const where: any = {};
    if (query) where.name = Like(`%${query}%`);
    return this.stickerRepo.find({ where, take: 100 });
  }

  async getKeychains(): Promise<CatalogKeychain[]> {
    return this.keychainRepo.find();
  }
}
