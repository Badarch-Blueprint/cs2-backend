import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PlayerSkin } from '../entities/player/player-skin.entity';
import { PlayerAgent } from '../entities/player/player-agent.entity';
import { PlayerGlove } from '../entities/player/player-glove.entity';
import { PlayerKnife } from '../entities/player/player-knife.entity';
import { PlayerMusic } from '../entities/player/player-music.entity';
import { PlayerPin } from '../entities/player/player-pin.entity';

export const TEAM_BOTH = 0;
export const TEAM_T = 2;
export const TEAM_CT = 3;

export interface EquipSkinInput {
  weaponTeam?: number;
  weaponDefindex: number;
  weaponPaintId: number;
  weaponWear?: number;
  weaponSeed?: number;
  weaponNametag?: string | null;
  weaponStattrak?: number;
  weaponStattrakCount?: number;
  weaponSticker0?: string;
  weaponSticker1?: string;
  weaponSticker2?: string;
  weaponSticker3?: string;
  weaponSticker4?: string;
  weaponKeychain?: string;
}

export interface EquipKnifeInput {
  weaponTeam?: number;
  knife: string;
}

export interface EquipGloveInput {
  weaponTeam?: number;
  weaponDefindex: number;
}

export interface EquipAgentInput {
  agentCt?: string | null;
  agentT?: string | null;
}

export interface EquipMusicInput {
  weaponTeam?: number;
  musicId: number;
}

export interface EquipPinInput {
  weaponTeam?: number;
  pinId: number;
}

function normalizeTeam(team: number | undefined): number {
  if (team === undefined || team === null) return TEAM_BOTH;
  if (team !== TEAM_BOTH && team !== TEAM_T && team !== TEAM_CT) {
    throw new BadRequestException(
      `weaponTeam must be one of ${TEAM_BOTH} (both), ${TEAM_T} (T), ${TEAM_CT} (CT)`,
    );
  }
  return team;
}

@Injectable()
export class WeaponPaintsPlayerService {
  constructor(
    @InjectRepository(PlayerSkin, 'weaponpaintsConnection')
    private readonly skinRepo: Repository<PlayerSkin>,
    @InjectRepository(PlayerAgent, 'weaponpaintsConnection')
    private readonly agentRepo: Repository<PlayerAgent>,
    @InjectRepository(PlayerGlove, 'weaponpaintsConnection')
    private readonly gloveRepo: Repository<PlayerGlove>,
    @InjectRepository(PlayerKnife, 'weaponpaintsConnection')
    private readonly knifeRepo: Repository<PlayerKnife>,
    @InjectRepository(PlayerMusic, 'weaponpaintsConnection')
    private readonly musicRepo: Repository<PlayerMusic>,
    @InjectRepository(PlayerPin, 'weaponpaintsConnection')
    private readonly pinRepo: Repository<PlayerPin>,
  ) {}

  async getLoadout(steamid: string) {
    const [skins, agents, gloves, knives, music, pins] = await Promise.all([
      this.skinRepo.find({ where: { steamid } }),
      this.agentRepo.find({ where: { steamid } }),
      this.gloveRepo.find({ where: { steamid } }),
      this.knifeRepo.find({ where: { steamid } }),
      this.musicRepo.find({ where: { steamid } }),
      this.pinRepo.find({ where: { steamid } }),
    ]);

    return { skins, agents, gloves, knives, music, pins };
  }

  async equipSkin(steamid: string, input: EquipSkinInput): Promise<PlayerSkin> {
    if (!Number.isFinite(input.weaponDefindex) || !Number.isFinite(input.weaponPaintId)) {
      throw new BadRequestException('weaponDefindex and weaponPaintId are required');
    }
    const weaponTeam = normalizeTeam(input.weaponTeam);

    const row = this.skinRepo.create({
      steamid,
      weaponTeam,
      weaponDefindex: input.weaponDefindex,
      weaponPaintId: input.weaponPaintId,
      weaponWear: input.weaponWear ?? 0.000001,
      weaponSeed: input.weaponSeed ?? 0,
      weaponNametag: input.weaponNametag ?? null,
      weaponStattrak: input.weaponStattrak ?? 0,
      weaponStattrakCount: input.weaponStattrakCount ?? 0,
      weaponSticker0: input.weaponSticker0 ?? '0;0;0;0;0;0;0',
      weaponSticker1: input.weaponSticker1 ?? '0;0;0;0;0;0;0',
      weaponSticker2: input.weaponSticker2 ?? '0;0;0;0;0;0;0',
      weaponSticker3: input.weaponSticker3 ?? '0;0;0;0;0;0;0',
      weaponSticker4: input.weaponSticker4 ?? '0;0;0;0;0;0;0',
      weaponKeychain: input.weaponKeychain ?? '0;0;0;0;0',
    });

    // Upsert by (steamid, weapon_team, weapon_defindex) since that's the UNIQUE key.
    await this.skinRepo.upsert(row, ['steamid', 'weaponTeam', 'weaponDefindex']);
    return row;
  }

  async equipKnife(steamid: string, input: EquipKnifeInput): Promise<PlayerKnife> {
    if (!input.knife || typeof input.knife !== 'string') {
      throw new BadRequestException('knife entity name is required (e.g. "weapon_knife_butterfly")');
    }
    const weaponTeam = normalizeTeam(input.weaponTeam);

    const row = this.knifeRepo.create({
      steamid,
      weaponTeam,
      knife: input.knife,
    });

    await this.knifeRepo.upsert(row, ['steamid', 'weaponTeam']);
    return row;
  }

  async equipGlove(steamid: string, input: EquipGloveInput): Promise<PlayerGlove> {
    if (!Number.isFinite(input.weaponDefindex)) {
      throw new BadRequestException('weaponDefindex is required');
    }
    const weaponTeam = normalizeTeam(input.weaponTeam);

    const row = this.gloveRepo.create({
      steamid,
      weaponTeam,
      weaponDefindex: input.weaponDefindex,
    });

    await this.gloveRepo.upsert(row, ['steamid', 'weaponTeam']);
    return row;
  }

  async equipAgent(steamid: string, input: EquipAgentInput): Promise<PlayerAgent> {
    const row = this.agentRepo.create({
      steamid,
      agentCt: input.agentCt ?? null,
      agentT: input.agentT ?? null,
    });

    await this.agentRepo.upsert(row, ['steamid']);
    return row;
  }

  async equipMusic(steamid: string, input: EquipMusicInput): Promise<PlayerMusic> {
    if (!Number.isFinite(input.musicId)) {
      throw new BadRequestException('musicId is required');
    }
    const weaponTeam = normalizeTeam(input.weaponTeam);

    const row = this.musicRepo.create({
      steamid,
      weaponTeam,
      musicId: input.musicId,
    });

    await this.musicRepo.upsert(row, ['steamid', 'weaponTeam']);
    return row;
  }

  async equipPin(steamid: string, input: EquipPinInput): Promise<PlayerPin> {
    if (!Number.isFinite(input.pinId)) {
      throw new BadRequestException('pinId is required');
    }
    const weaponTeam = normalizeTeam(input.weaponTeam);

    const row = this.pinRepo.create({
      steamid,
      weaponTeam,
      pinId: input.pinId,
    });

    await this.pinRepo.upsert(row, ['steamid', 'weaponTeam']);
    return row;
  }
}
