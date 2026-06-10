import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';

import { CatalogSkin } from '../entities/catalog/catalog-skin.entity';
import { CatalogAgent } from '../entities/catalog/catalog-agent.entity';
import { CatalogCollectible } from '../entities/catalog/catalog-collectible.entity';
import { CatalogGlove } from '../entities/catalog/catalog-glove.entity';
import { CatalogKeychain } from '../entities/catalog/catalog-keychain.entity';
import { CatalogKnife } from '../entities/catalog/catalog-knife.entity';
import { CatalogMusic } from '../entities/catalog/catalog-music.entity';
import { CatalogSticker } from '../entities/catalog/catalog-sticker.entity';
import { CatalogVersion } from '../entities/catalog/catalog-version.entity';

// To avoid keeping 10+ MB in memory, fetch directly and chunk.
// If the list is large we should just stream it, but for now we increase maxContentLength
const BASE_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en';

@Injectable()
export class WeaponPaintsSyncService {
  private readonly logger = new Logger(WeaponPaintsSyncService.name);

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(CatalogSkin)
    private readonly catalogSkinRepo: Repository<CatalogSkin>,
    @InjectRepository(CatalogAgent)
    private readonly catalogAgentRepo: Repository<CatalogAgent>,
    @InjectRepository(CatalogCollectible)
    private readonly catalogCollectibleRepo: Repository<CatalogCollectible>,
    @InjectRepository(CatalogGlove)
    private readonly catalogGloveRepo: Repository<CatalogGlove>,
    @InjectRepository(CatalogKeychain)
    private readonly catalogKeychainRepo: Repository<CatalogKeychain>,
    @InjectRepository(CatalogKnife)
    private readonly catalogKnifeRepo: Repository<CatalogKnife>,
    @InjectRepository(CatalogMusic)
    private readonly catalogMusicRepo: Repository<CatalogMusic>,
    @InjectRepository(CatalogSticker)
    private readonly catalogStickerRepo: Repository<CatalogSticker>,
    @InjectRepository(CatalogVersion)
    private readonly catalogVersionRepo: Repository<CatalogVersion>,
  ) {}

  async syncAll(): Promise<void> {
    this.logger.log('Starting WeaponPaints catalog sync...');

    try {
      const inventory = await this.fetchApi<any>('inventory.json');

      await this.syncSkinsGlovesKnives(inventory.skins);
      await this.syncAgents(inventory.agents);
      await this.syncCollectibles(inventory.collectibles);
      await this.syncMusic(inventory.music_kits);
      await this.syncStickers(inventory.stickers);
      await this.syncKeychains(inventory.keychains);

      await this.catalogVersionRepo.save({
        id: 'latest',
        updatedAt: new Date(),
      });

      this.logger.log('WeaponPaints catalog sync completed successfully.');
    } catch (error) {
      this.logger.error('Failed to sync WeaponPaints catalog', error);
      throw error;
    }
  }

  private async fetchApi<T>(endpoint: string): Promise<T> {
    const { data } = await firstValueFrom(
      this.httpService.get<T>(`${BASE_URL}/${endpoint}`, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }),
    );
    return data;
  }

  private async syncSkinsGlovesKnives(skinsData: Record<string, Record<string, any>>): Promise<void> {
    if (!skinsData) return;
    const skins: CatalogSkin[] = [];
    const gloves: CatalogGlove[] = [];
    const knives: CatalogKnife[] = [];

    for (const [weaponIdStr, paints] of Object.entries(skinsData)) {
      const weaponDefindex = parseInt(weaponIdStr, 10);
      if (!Number.isFinite(weaponDefindex)) {
        this.logger.warn(`Skipping non-numeric weapon key: ${weaponIdStr}`);
        continue;
      }
      if (!paints || typeof paints !== 'object') continue;
      for (const [paintIndexStr, item] of Object.entries(paints)) {
        const paintIndex = parseInt(paintIndexStr, 10);
        if (!Number.isFinite(paintIndex)) {
          this.logger.warn(
            `Skipping non-numeric paint key for weapon ${weaponIdStr}: ${paintIndexStr}`,
          );
          continue;
        }
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') continue;
        const nameParts = item.name.split(' | ');
        const weaponName = nameParts[0];
        const skinName = nameParts.length > 1 ? nameParts.slice(1).join(' | ') : item.name;
        
        // Generate a unique ID since inventory.json doesn't provide the raw 'skin-xxx' id for nested skins
        const uniqueId = `skin-${weaponDefindex}-${paintIndex}`;

        // Heuristic: Knives usually have defindex 500-599. Gloves >= 4000.
        if (weaponDefindex >= 4000) {
          gloves.push(
            this.catalogGloveRepo.create({
              id: uniqueId,
              name: skinName,
              weaponName: weaponName,
              weaponDefindex,
              paintIndex,
              rarity: item.rarity?.name,
              image: item.image,
            }),
          );
        } else if (weaponDefindex >= 500 && weaponDefindex < 1000) {
          knives.push(
            this.catalogKnifeRepo.create({
              id: uniqueId,
              name: skinName,
              weaponName: weaponName,
              weaponEntity:
                typeof item.weapon?.id === 'string' ? item.weapon.id : null,
              weaponDefindex,
              paintIndex,
              rarity: item.rarity?.name,
              image: item.image,
            }),
          );
        } else {
          skins.push(
            this.catalogSkinRepo.create({
              id: uniqueId,
              name: skinName,
              weaponName: weaponName,
              weaponDefindex,
              paintIndex,
              rarity: item.rarity?.name,
              image: item.image,
            }),
          );
        }
      }
    }

    // Clear old data first, since we're generating new IDs
    await this.catalogSkinRepo.clear();
    await this.catalogGloveRepo.clear();
    await this.catalogKnifeRepo.clear();

    await this.catalogSkinRepo.save(skins, { chunk: 500 });
    await this.catalogGloveRepo.save(gloves, { chunk: 500 });
    await this.catalogKnifeRepo.save(knives, { chunk: 500 });
    this.logger.log(`Synced ${skins.length} skins, ${gloves.length} gloves, ${knives.length} knives.`);
  }

  private async syncAgents(agentsData: Record<string, any>): Promise<void> {
    if (!agentsData) return;
    const agents: CatalogAgent[] = [];
    for (const [defindexStr, item] of Object.entries(agentsData)) {
      const defindex = parseInt(defindexStr, 10);
      if (!Number.isFinite(defindex) || !item?.name) continue;
      // Agents team logic isn't perfectly exposed in inventory.json without reading it carefully,
      // but usually the name or other meta might hint at it. We will store 'Any' and users can adjust.
      agents.push(
        this.catalogAgentRepo.create({
          id: `agent-${defindex}`,
          name: item.name,
          defindex,
          team: 'Any',
          rarity: item.rarity?.name,
          image: item.image,
        }),
      );
    }
    await this.catalogAgentRepo.clear();
    await this.catalogAgentRepo.save(agents, { chunk: 500 });
    this.logger.log(`Synced ${agents.length} agents.`);
  }

  private async syncCollectibles(collectiblesData: Record<string, any>): Promise<void> {
    if (!collectiblesData) return;
    const collectibles: CatalogCollectible[] = [];
    for (const [defindexStr, item] of Object.entries(collectiblesData)) {
      const defindex = parseInt(defindexStr, 10);
      if (!Number.isFinite(defindex) || !item?.name) continue;
      collectibles.push(
        this.catalogCollectibleRepo.create({
          id: `collectible-${defindex}`,
          name: item.name,
          defindex,
          rarity: item.rarity?.name,
          image: item.image,
        }),
      );
    }
    await this.catalogCollectibleRepo.clear();
    await this.catalogCollectibleRepo.save(collectibles, { chunk: 500 });
    this.logger.log(`Synced ${collectibles.length} collectibles.`);
  }

  private async syncMusic(musicData: Record<string, any>): Promise<void> {
    if (!musicData) return;
    const music: CatalogMusic[] = [];
    for (const [defindexStr, item] of Object.entries(musicData)) {
      const defindex = parseInt(defindexStr, 10);
      if (!Number.isFinite(defindex) || !item?.name) continue;
      music.push(
        this.catalogMusicRepo.create({
          id: `music-${defindex}`,
          name: item.name,
          defindex,
          image: item.image,
        }),
      );
    }
    await this.catalogMusicRepo.clear();
    await this.catalogMusicRepo.save(music, { chunk: 500 });
    this.logger.log(`Synced ${music.length} music kits.`);
  }

  private async syncStickers(stickersData: Record<string, any>): Promise<void> {
    if (!stickersData) return;
    const stickers: CatalogSticker[] = [];
    for (const [defindexStr, item] of Object.entries(stickersData)) {
      const defindex = parseInt(defindexStr, 10);
      if (!Number.isFinite(defindex) || !item?.name) continue;
      stickers.push(
        this.catalogStickerRepo.create({
          id: `sticker-${defindex}`,
          name: item.name,
          defindex,
          rarity: item.rarity?.name,
          image: item.image,
        }),
      );
    }
    await this.catalogStickerRepo.clear();
    await this.catalogStickerRepo.save(stickers, { chunk: 500 });
    this.logger.log(`Synced ${stickers.length} stickers.`);
  }

  private async syncKeychains(keychainsData: Record<string, any>): Promise<void> {
    if (!keychainsData) return;
    const keychains: CatalogKeychain[] = [];
    for (const [defindexStr, item] of Object.entries(keychainsData)) {
      const defindex = parseInt(defindexStr, 10);
      if (!Number.isFinite(defindex) || !item?.name) continue;
      keychains.push(
        this.catalogKeychainRepo.create({
          id: `keychain-${defindex}`,
          name: item.name,
          defindex,
          rarity: item.rarity?.name,
          image: item.image,
        }),
      );
    }
    await this.catalogKeychainRepo.clear();
    await this.catalogKeychainRepo.save(keychains, { chunk: 500 });
    this.logger.log(`Synced ${keychains.length} keychains.`);
  }
}
