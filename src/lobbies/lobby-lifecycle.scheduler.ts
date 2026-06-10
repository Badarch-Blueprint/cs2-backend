import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';

import { Match } from '../matches/match.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { Lobby } from './entities/lobby.entity';
import { LobbyMember } from './entities/lobby-member.entity';
import { RentalServer } from './entities/rental-server.entity';
import { LobbyBroadcastService } from './lobby-broadcast.service';
import { TERMINAL_LOBBY_STATUSES } from './lobby.types';

@Injectable()
export class LobbyLifecycleScheduler {
  private readonly logger = new Logger(LobbyLifecycleScheduler.name);

  constructor(
    @InjectRepository(Lobby)
    private readonly lobbiesRepo: Repository<Lobby>,
    @InjectRepository(LobbyMember)
    private readonly membersRepo: Repository<LobbyMember>,
    @InjectRepository(RentalServer)
    private readonly serversRepo: Repository<RentalServer>,
    @InjectRepository(Match)
    private readonly matchesRepo: Repository<Match>,
    private readonly config: ConfigService,
    private readonly broadcast: LobbyBroadcastService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    try {
      await this.expireAbandonedLobbies();
      await this.expireFinishedRentals();
      await this.softDeleteTerminal();
    } catch (err) {
      this.logger.error(
        `Lifecycle tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async expireAbandonedLobbies(now: Date = new Date()): Promise<number> {
    const candidates = await this.lobbiesRepo.find({
      where: {
        status: 'WAITING',
        deletedAt: IsNull(),
        expiresAt: LessThan(now),
      },
    });
    for (const lobby of candidates) {
      lobby.status = 'EXPIRED';
      await this.lobbiesRepo.save(lobby);
      const active = await this.membersRepo.find({
        where: { lobbyId: lobby.id, leftAt: IsNull() },
      });
      for (const m of active) {
        m.leftAt = now;
        m.isReady = false;
      }
      if (active.length) {
        await this.membersRepo.save(active);
      }
      this.broadcast.emit(lobby.id, 'lobby.status.changed', {
        from: 'WAITING',
        to: 'EXPIRED',
      });
      this.broadcast.emit(lobby.id, 'lobby.cancelled', { reason: 'expired' });
    }
    return candidates.length;
  }

  async expireFinishedRentals(now: Date = new Date()): Promise<number> {
    const candidates = await this.serversRepo.find({
      where: {
        status: In(['READY', 'ACTIVE']),
        deletedAt: IsNull(),
        endsAt: LessThan(now),
      },
    });
    for (const rental of candidates) {
      rental.status = 'EXPIRED';
      rental.connectString = null;
      rental.host = null;
      rental.port = null;
      rental.gotvPort = null;
      await this.serversRepo.save(rental);
      const lobby = await this.lobbiesRepo.findOne({
        where: { rentalServerId: rental.id },
      });
      if (lobby?.matchId) {
        const match = await this.matchesRepo.findOne({
          where: { id: lobby.matchId },
        });
        if (
          match &&
          match.status !== MatchStatus.FINISHED &&
          match.status !== MatchStatus.CANCELLED
        ) {
          match.status = MatchStatus.FINISHED;
          match.endAt = now;
          await this.matchesRepo.save(match);
          this.broadcast.emit(lobby.id, 'lobby.match.statusChanged', {
            matchId: match.id,
            status: MatchStatus.FINISHED,
          });
        }
      }
    }
    return candidates.length;
  }

  async softDeleteTerminal(now: Date = new Date()): Promise<number> {
    const ageDays = Number(
      this.config.get<number>('LOBBY_CLEANUP_AGE_DAYS') ?? 30,
    );
    const threshold = new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000);
    const old = await this.lobbiesRepo.find({
      where: {
        deletedAt: IsNull(),
        status: In([...TERMINAL_LOBBY_STATUSES]),
        updatedAt: LessThan(threshold),
      },
    });
    for (const lobby of old) {
      lobby.deletedAt = now;
      await this.lobbiesRepo.save(lobby);
      if (lobby.rentalServerId) {
        const rental = await this.serversRepo.findOne({
          where: { id: lobby.rentalServerId },
        });
        if (rental && !rental.deletedAt) {
          rental.deletedAt = now;
          await this.serversRepo.save(rental);
        }
      }
    }
    return old.length;
  }
}
