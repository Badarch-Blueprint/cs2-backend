import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Ensures the `wp_player_*` tables exist in the WeaponPaints MySQL database.
 *
 * The cs2-WeaponPaints plugin creates these tables itself on first startup,
 * but our platform may need to write player loadouts before the plugin ever
 * runs (e.g. a player customises their knife on the website before joining a
 * server). We mirror the exact DDL the plugin uses so that once the plugin
 * starts, it sees a compatible schema and proceeds normally.
 *
 * Reference: Utility.CheckDatabaseTables in Nereziel/cs2-WeaponPaints.
 */
@Injectable()
export class WeaponPaintsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(WeaponPaintsSchemaService.name);

  constructor(
    @InjectDataSource('weaponpaintsConnection')
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTables();
  }

  async ensureTables(): Promise<void> {
    const queries = [
      `CREATE TABLE IF NOT EXISTS \`wp_player_skins\` (
        \`steamid\` varchar(18) NOT NULL,
        \`weapon_team\` int(1) NOT NULL,
        \`weapon_defindex\` int(6) NOT NULL,
        \`weapon_paint_id\` int(6) NOT NULL,
        \`weapon_wear\` float NOT NULL DEFAULT 0.000001,
        \`weapon_seed\` int(16) NOT NULL DEFAULT 0,
        \`weapon_nametag\` VARCHAR(128) DEFAULT NULL,
        \`weapon_stattrak\` tinyint(1) NOT NULL DEFAULT 0,
        \`weapon_stattrak_count\` int(10) NOT NULL DEFAULT 0,
        \`weapon_sticker_0\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
        \`weapon_sticker_1\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
        \`weapon_sticker_2\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
        \`weapon_sticker_3\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
        \`weapon_sticker_4\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
        \`weapon_keychain\` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0' COMMENT 'id;x;y;z;seed',
        UNIQUE (\`steamid\`, \`weapon_team\`, \`weapon_defindex\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

      `CREATE TABLE IF NOT EXISTS \`wp_player_knife\` (
        \`steamid\` varchar(18) NOT NULL,
        \`weapon_team\` int(1) NOT NULL,
        \`knife\` varchar(64) NOT NULL,
        UNIQUE (\`steamid\`, \`weapon_team\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

      `CREATE TABLE IF NOT EXISTS \`wp_player_gloves\` (
        \`steamid\` varchar(18) NOT NULL,
        \`weapon_team\` int(1) NOT NULL,
        \`weapon_defindex\` int(11) NOT NULL,
        UNIQUE (\`steamid\`, \`weapon_team\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

      `CREATE TABLE IF NOT EXISTS \`wp_player_agents\` (
        \`steamid\` varchar(18) NOT NULL,
        \`agent_ct\` varchar(64) DEFAULT NULL,
        \`agent_t\` varchar(64) DEFAULT NULL,
        UNIQUE (\`steamid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

      `CREATE TABLE IF NOT EXISTS \`wp_player_music\` (
        \`steamid\` varchar(64) NOT NULL,
        \`weapon_team\` int(1) NOT NULL,
        \`music_id\` int(11) NOT NULL,
        UNIQUE (\`steamid\`, \`weapon_team\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

      `CREATE TABLE IF NOT EXISTS \`wp_player_pins\` (
        \`steamid\` varchar(64) NOT NULL,
        \`weapon_team\` int(1) NOT NULL,
        \`id\` int(11) NOT NULL,
        UNIQUE (\`steamid\`, \`weapon_team\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    ];

    try {
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        for (const sql of queries) {
          await runner.query(sql);
        }
        this.logger.log('WeaponPaints MySQL tables verified/created.');
      } finally {
        await runner.release();
      }
    } catch (err) {
      this.logger.error(
        'Failed to ensure WeaponPaints MySQL tables. ' +
          'Equip endpoints will fail until the WeaponPaints plugin creates them.',
        err as Error,
      );
    }
  }
}
