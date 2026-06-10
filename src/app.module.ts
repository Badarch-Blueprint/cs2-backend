import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BracketsModule } from './brackets/brackets.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions, buildWeaponPaintsTypeOrmOptions } from './config/typeorm-options.factory';
import { LobbiesModule } from './lobbies/lobbies.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { WeaponPaintsModule } from './weaponpaints/weaponpaints.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      // Global default bucket; tighter limits are applied via @Throttle on specific routes.
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) =>
        buildTypeOrmOptions(config),
    }),
    TypeOrmModule.forRootAsync({
      name: 'weaponpaintsConnection',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) =>
        buildWeaponPaintsTypeOrmOptions(config),
    }),
    UsersModule,
    AuthModule,
    TeamsModule,
    BracketsModule,
    IntegrationsModule,
    LobbiesModule,
    AdminModule,
    DashboardModule,
    WeaponPaintsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
