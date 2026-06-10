import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import type { JwtAuthUser } from '../auth/jwt.strategy';
import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyQueryDto } from './dto/join-lobby.dto';
import { KickMemberDto } from './dto/kick-member.dto';
import { MoveMemberDto } from './dto/move-member.dto';
import { ReadyDto } from './dto/ready.dto';
import { TournamentInquiryDto } from './dto/tournament-inquiry.dto';
import { LobbiesService } from './lobbies.service';
import { TournamentInquiryService } from './tournament-inquiry.service';

type AuthedRequest = Request & { user: JwtAuthUser };

const PIPE = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Controller('lobbies')
@UseGuards(AuthGuard('jwt'))
@UsePipes(PIPE)
export class LobbiesController {
  constructor(
    private readonly lobbies: LobbiesService,
    private readonly inquiry: TournamentInquiryService,
  ) {}

  // --------------------------------------------------- static / read routes

  @Get('options')
  options() {
    return this.lobbies.options();
  }

  @Get('mine')
  async mine(@Req() req: AuthedRequest) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.listMine(user.id);
  }

  @Get('by-code/:inviteCode')
  async byCode(
    @Req() req: AuthedRequest,
    @Param('inviteCode') inviteCode: string,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    const lobby = await this.lobbies.findByInviteCode(inviteCode);
    return this.lobbies.buildView(lobby, { userId: user.id, isAdmin: req.user.isAdmin });
  }

  @Get(':id')
  async getOne(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    const lobby = await this.lobbies.findById(id);
    if (!req.user.isAdmin) {
      await this.lobbies.assertMember(id, user.id);
    }
    return this.lobbies.buildView(lobby, { userId: user.id, isAdmin: req.user.isAdmin });
  }

  // ---------------------------------------------------------------- create

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    hour: { limit: Number(process.env.LOBBY_CREATE_LIMIT_PER_HOUR ?? 5), ttl: 3_600_000 },
    day: { limit: Number(process.env.LOBBY_CREATE_LIMIT_PER_DAY ?? 20), ttl: 86_400_000 },
  })
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateLobbyDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.create(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      dto,
    );
  }

  // ------------------------------------------------------- member mutations

  @Post(':id/join')
  async join(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query() query: JoinLobbyQueryDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.join(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
      query.team,
    );
  }

  @Post(':id/leave')
  async leave(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.leave(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
    );
  }

  @Post(':id/kick')
  async kick(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: KickMemberDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.kick(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
      dto.userId,
    );
  }

  @Post(':id/move')
  async move(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: MoveMemberDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.move(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
      dto,
    );
  }

  @Post(':id/ready')
  async ready(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ReadyDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.toggleReady(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
      dto.ready,
    );
  }

  @Post(':id/start')
  async start(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    const result = await this.lobbies.start(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
    );
    return this.lobbies.buildView(result.lobby, {
      userId: user.id,
      isAdmin: req.user.isAdmin,
    });
  }

  @Post(':id/cancel')
  async cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.cancel(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
    );
  }

  @Post(':id/invites')
  async rotateInvite(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = await this.lobbies.resolveUser(req.user.steamId);
    return this.lobbies.rotateInvite(
      { userId: user.id, steamId: req.user.steamId, isAdmin: req.user.isAdmin },
      id,
    );
  }

  // ---------------------------------------------------------- tournament inquiry

  @Post('tournament-inquiry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    hour: { limit: Number(process.env.LOBBY_INQUIRY_LIMIT_PER_HOUR ?? 3), ttl: 3_600_000 },
  })
  async tournamentInquiry(
    @Req() req: AuthedRequest,
    @Body() dto: TournamentInquiryDto,
  ) {
    const user = await this.lobbies.resolveUser(req.user.steamId).catch(() => null);
    return this.inquiry.submit(dto, user?.id ?? null);
  }
}
