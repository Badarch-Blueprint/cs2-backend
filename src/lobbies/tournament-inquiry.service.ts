import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { TournamentInquiryDto } from './dto/tournament-inquiry.dto';
import { TournamentInquiry } from './entities/tournament-inquiry.entity';

@Injectable()
export class TournamentInquiryService {
  private readonly logger = new Logger(TournamentInquiryService.name);

  constructor(
    @InjectRepository(TournamentInquiry)
    private readonly repo: Repository<TournamentInquiry>,
  ) {}

  async submit(
    dto: TournamentInquiryDto,
    userId: string | null,
  ): Promise<{ id: string; receivedAt: string }> {
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        organization: dto.organization?.trim() || null,
        contactEmail: dto.contactEmail,
        contactName: dto.contactName,
        bracketSize: dto.bracketSize,
        format: dto.format,
        notes: dto.notes?.trim() || null,
      }),
    );
    this.logger.log(
      `Tournament inquiry ${saved.id} recorded from ${userId ?? 'anon'} (${dto.contactEmail}, bracket=${dto.bracketSize}, format=${dto.format})`,
    );
    return { id: saved.id, receivedAt: saved.receivedAt.toISOString() };
  }

  async list(limit = 100): Promise<TournamentInquiry[]> {
    return this.repo.find({
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
