import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SetZoneScheduleDto } from '../matches/dto/set-zone-schedule.dto';
import { ZoneMatchesService } from '../matches/zone-matches.service';
import { BracketsService } from './brackets.service';
import { CreateBracketTeamDto } from './dto/create-bracket-team.dto';
import { ReplaceGroupRosterDto } from './dto/replace-group-roster.dto';
import { ReplacePlayoffsDto } from './dto/replace-playoffs.dto';
import { UpdateBracketTeamDto } from './dto/update-bracket-team.dto';
import { AdminGuard } from './guards/admin.guard';

@Controller('admin/brackets')
@UseGuards(AuthGuard('jwt'), AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminBracketsController {
  constructor(
    private readonly brackets: BracketsService,
    private readonly zoneMatches: ZoneMatchesService,
  ) {}

  @Get()
  getBracket() {
    return this.brackets.getFullBracket();
  }

  @Get('groups/:code')
  getGroup(@Param('code') code: string) {
    return this.brackets.getGroup(this.brackets.assertGroup(code));
  }

  /** Zone (Swiss group) pairings only — not playoffs. */
  @Get('zone-matches')
  listZoneMatches() {
    return this.zoneMatches.listAllZoneMatches();
  }

  /**
   * Full round-robin from roster slot order (each team plays every other team once).
   * Odd groups: one bye per round; even groups: no bye. Match codes `Zone-{G}-R{r}-M{m}`.
   */
  @Post('groups/:code/zone-matches/from-roster')
  generateZoneRoundRobin(@Param('code') code: string) {
    return this.zoneMatches.generateRoundRobinFromRoster(
      this.brackets.assertGroup(code),
    );
  }

  @Delete('groups/:code/zone-matches')
  clearZoneMatches(@Param('code') code: string) {
    return this.zoneMatches.clearZoneMatches(this.brackets.assertGroup(code));
  }

  /** Full manual zone schedule (rounds with pairings + optional bye per round). */
  @Put('groups/:code/zone-matches')
  setZoneSchedule(
    @Param('code') code: string,
    @Body() dto: SetZoneScheduleDto,
  ) {
    return this.zoneMatches.replaceScheduleManual(
      this.brackets.assertGroup(code),
      dto,
    );
  }

  @Post('groups/:code/teams')
  addTeam(@Param('code') code: string, @Body() dto: CreateBracketTeamDto) {
    return this.brackets.addTeam(this.brackets.assertGroup(code), dto);
  }

  @Patch('groups/:code/teams/:slotIndex')
  updateTeam(
    @Param('code') code: string,
    @Param('slotIndex', ParseIntPipe) slotIndex: number,
    @Body() dto: UpdateBracketTeamDto,
  ) {
    return this.brackets.updateTeam(
      this.brackets.assertGroup(code),
      slotIndex,
      dto.teamId,
    );
  }

  @Delete('groups/:code/teams/:slotIndex')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTeam(
    @Param('code') code: string,
    @Param('slotIndex', ParseIntPipe) slotIndex: number,
  ): Promise<void> {
    await this.brackets.removeTeam(this.brackets.assertGroup(code), slotIndex);
  }

  @Put('groups/:code/roster')
  replaceRoster(
    @Param('code') code: string,
    @Body() dto: ReplaceGroupRosterDto,
  ) {
    return this.brackets.replaceGroupRoster(
      this.brackets.assertGroup(code),
      dto.teamIds,
    );
  }

  /** Row-major roster: 14 entries (match 1 top, match 1 bottom, … match 7 bottom). Empty string = TBD. */
  @Put('playoffs')
  replacePlayoffs(@Body() dto: ReplacePlayoffsDto) {
    return this.brackets.replacePlayoffs(dto.roster);
  }
}
