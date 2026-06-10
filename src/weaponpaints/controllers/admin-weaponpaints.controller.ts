import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WeaponPaintsSyncService } from '../services/weaponpaints-sync.service';
import { AdminGuard } from '../../brackets/guards/admin.guard';

@Controller('admin/weaponpaints')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminWeaponPaintsController {
  constructor(private readonly syncService: WeaponPaintsSyncService) {}

  @Post('sync')
  async syncCatalog() {
    await this.syncService.syncAll();
    return { success: true, message: 'WeaponPaints catalog sync initiated and completed successfully' };
  }
}
