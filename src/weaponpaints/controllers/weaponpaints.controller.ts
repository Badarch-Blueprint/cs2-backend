import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { WeaponPaintsCatalogService } from '../services/weaponpaints-catalog.service';
import {
  EquipAgentInput,
  EquipGloveInput,
  EquipKnifeInput,
  EquipMusicInput,
  EquipPinInput,
  EquipSkinInput,
  WeaponPaintsPlayerService,
} from '../services/weaponpaints-player.service';

@Controller('weaponpaints')
export class WeaponPaintsController {
  constructor(
    private readonly catalogService: WeaponPaintsCatalogService,
    private readonly playerService: WeaponPaintsPlayerService,
  ) {}

  @Get('catalog/version')
  async getCatalogVersion() {
    const version = await this.catalogService.getVersion();
    return { version };
  }

  @Get('catalog/skins')
  async getSkins(
    @Query('weaponName') weaponName?: string,
    @Query('query') query?: string,
  ) {
    return this.catalogService.getSkins(weaponName, query);
  }

  @Get('catalog/agents')
  async getAgents(@Query('team') team?: string) {
    return this.catalogService.getAgents(team);
  }

  @Get('catalog/gloves')
  async getGloves() {
    return this.catalogService.getGloves();
  }

  @Get('catalog/knives')
  async getKnives() {
    return this.catalogService.getKnives();
  }

  @Get('catalog/music')
  async getMusicKits() {
    return this.catalogService.getMusicKits();
  }

  @Get('catalog/pins')
  async getPins() {
    return this.catalogService.getPins();
  }

  @Get('catalog/stickers')
  async getStickers(@Query('query') query?: string) {
    return this.catalogService.getStickers(query);
  }

  @Get('catalog/keychains')
  async getKeychains() {
    return this.catalogService.getKeychains();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('loadout')
  async getLoadout(@Req() req: { user: { steamId: string } }) {
    return this.playerService.getLoadout(req.user.steamId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/skin')
  async equipSkin(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipSkinInput,
  ) {
    return this.playerService.equipSkin(req.user.steamId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/knife')
  async equipKnife(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipKnifeInput,
  ) {
    return this.playerService.equipKnife(req.user.steamId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/glove')
  async equipGlove(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipGloveInput,
  ) {
    return this.playerService.equipGlove(req.user.steamId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/agent')
  async equipAgent(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipAgentInput,
  ) {
    return this.playerService.equipAgent(req.user.steamId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/music')
  async equipMusic(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipMusicInput,
  ) {
    return this.playerService.equipMusic(req.user.steamId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('loadout/pin')
  async equipPin(
    @Req() req: { user: { steamId: string } },
    @Body() body: EquipPinInput,
  ) {
    return this.playerService.equipPin(req.user.steamId, body);
  }
}
