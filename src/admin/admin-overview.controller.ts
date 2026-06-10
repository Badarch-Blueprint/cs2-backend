import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminGuard } from '../brackets/guards/admin.guard';
import { AdminOverviewService } from './admin-overview.service';

@Controller('admin/overview')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  /** Aggregate stats and in-progress matches for the admin home screen. */
  @Get()
  getOverview() {
    return this.overview.getOverview();
  }
}
