import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminGuard } from '../brackets/guards/admin.guard';
import { AdminListLobbiesQueryDto } from './dto/admin-list-lobbies.dto';
import { AdminUpdateLobbyDto } from './dto/admin-update-lobby.dto';
import { AdminUpdateRentalServerDto } from './dto/admin-update-rental-server.dto';
import { LobbiesService } from './lobbies.service';
import { LobbyProvisioningService } from './lobby-provisioning.service';

const PIPE = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
@UsePipes(PIPE)
export class AdminLobbiesController {
  constructor(
    private readonly lobbies: LobbiesService,
    private readonly provisioning: LobbyProvisioningService,
  ) {}

  @Get('lobbies')
  listLobbies(@Query() query: AdminListLobbiesQueryDto) {
    return this.lobbies.adminList(query);
  }

  @Patch('lobbies/:id')
  async patchLobby(
    @Param('id') id: string,
    @Body() dto: AdminUpdateLobbyDto,
  ) {
    if (!dto.status) {
      return this.lobbies.buildView(
        await this.lobbies.findById(id),
        { userId: '__admin__', isAdmin: true },
      );
    }
    return this.lobbies.adminForceStatus(id, dto.status, dto.reason ?? null);
  }

  @Get('rental-servers')
  async listRentalServers() {
    const rows = await this.provisioning.listAll();
    return rows.map((r) => ({
      id: r.id,
      lobbyId: r.lobbyId,
      matchId: r.matchId,
      status: r.status,
      host: r.host,
      port: r.port,
      gotvPort: r.gotvPort,
      connectString: r.connectString,
      startedAt: r.startedAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  @Patch('rental-servers/:id')
  async patchRentalServer(
    @Param('id') id: string,
    @Body() dto: AdminUpdateRentalServerDto,
  ) {
    const { view } = await this.provisioning.applyAdminUpdate(id, dto);
    return view;
  }

  /**
   * Called by the external provisioner backend when the map currently running
   * on the rental server ends. Advances to the next map in the series (BO3/BO5)
   * or finishes the lobby.
   */
  @Post('rental-servers/:id/map-finished')
  async rentalServerMapFinished(
    @Param('id') id: string,
    @Body() body: { reason?: string | null } = {},
  ) {
    return this.provisioning.mapFinished(id, { reason: body?.reason ?? null });
  }
}
