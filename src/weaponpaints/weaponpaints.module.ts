import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { CatalogSkin } from './entities/catalog/catalog-skin.entity';
import { CatalogAgent } from './entities/catalog/catalog-agent.entity';
import { CatalogCollectible } from './entities/catalog/catalog-collectible.entity';
import { CatalogGlove } from './entities/catalog/catalog-glove.entity';
import { CatalogKeychain } from './entities/catalog/catalog-keychain.entity';
import { CatalogKnife } from './entities/catalog/catalog-knife.entity';
import { CatalogMusic } from './entities/catalog/catalog-music.entity';
import { CatalogSticker } from './entities/catalog/catalog-sticker.entity';
import { CatalogVersion } from './entities/catalog/catalog-version.entity';

import { PlayerSkin } from './entities/player/player-skin.entity';
import { PlayerAgent } from './entities/player/player-agent.entity';
import { PlayerGlove } from './entities/player/player-glove.entity';
import { PlayerKnife } from './entities/player/player-knife.entity';
import { PlayerMusic } from './entities/player/player-music.entity';
import { PlayerPin } from './entities/player/player-pin.entity';

import { WeaponPaintsSyncService } from './services/weaponpaints-sync.service';
import { WeaponPaintsCatalogService } from './services/weaponpaints-catalog.service';
import { WeaponPaintsPlayerService } from './services/weaponpaints-player.service';
import { WeaponPaintsSchemaService } from './services/weaponpaints-schema.service';

import { WeaponPaintsController } from './controllers/weaponpaints.controller';
import { AdminWeaponPaintsController } from './controllers/admin-weaponpaints.controller';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      CatalogSkin,
      CatalogAgent,
      CatalogCollectible,
      CatalogGlove,
      CatalogKeychain,
      CatalogKnife,
      CatalogMusic,
      CatalogSticker,
      CatalogVersion,
    ]),
    TypeOrmModule.forFeature(
      [
        PlayerSkin,
        PlayerAgent,
        PlayerGlove,
        PlayerKnife,
        PlayerMusic,
        PlayerPin,
      ],
      'weaponpaintsConnection',
    ),
  ],
  providers: [
    WeaponPaintsSyncService,
    WeaponPaintsCatalogService,
    WeaponPaintsPlayerService,
    WeaponPaintsSchemaService,
    Logger,
  ],
  controllers: [WeaponPaintsController, AdminWeaponPaintsController],
  exports: [
    WeaponPaintsSyncService,
    WeaponPaintsCatalogService,
    WeaponPaintsPlayerService,
  ],
})
export class WeaponPaintsModule {}
