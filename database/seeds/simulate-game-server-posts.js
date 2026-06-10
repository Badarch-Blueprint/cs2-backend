/**
 * Simulate the CS2 server backend calling the platform API for each Swiss zone map.
 * Uses `curl` (must be on PATH) with `X-Game-Server-Token: $GAME_SERVER_API_KEY`.
 *
 * Prereqs:
 *   - API running (`npm run start:dev` in backend)
 *   - backend/.env: DATABASE_*, BACKEND_URL (default http://localhost:3000), GAME_SERVER_API_KEY (≥16 chars)
 *   - Zone rows in `matches` (e.g. `npm run db:simulate` once, then use --reset-zone here)
 *
 * From backend/:
 *   npm run simulate:game-server -- --reset-zone          # reopen Swiss + clear playoffs, then POST all maps
 *   npm run simulate:game-server -- --dry-run             # print curl commands only
 *   SIM_SEED=7 npm run simulate:game-server -- --reset-zone
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env');

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) {
    return out;
  }
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      continue;
    }
    const noExport = t.replace(/^\s*export\s+/, '');
    const eq = noExport.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = noExport.slice(0, eq).trim();
    let val = noExport.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function mergeEnvFromFile() {
  const fileEnv = loadEnvFile(ENV_FILE);
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

function connectPg() {
  let host = process.env.DATABASE_HOST;
  if (!host) {
    throw new Error('DATABASE_HOST missing in backend/.env');
  }
  if (host === 'postgres' && !fs.existsSync('/.dockerenv')) {
    host = 'localhost';
  }
  return new Client({
    host,
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
}

/** @returns {() => number} */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMapScore(rng) {
  const overtime = rng() < 0.22;
  if (!overtime) {
    const winnerRounds = 13;
    const loserRounds = Math.min(12, Math.floor(rng() * 13));
    return { winnerRounds, loserRounds };
  }
  const winnerRounds = 16 + Math.floor(rng() * 3);
  const margin = 1 + Math.floor(rng() * 3);
  return { winnerRounds, loserRounds: winnerRounds - margin };
}

/**
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {{ matchId: string; scoreA: number; scoreB: number }} body
 * @param {{ dryRun: boolean }} opts
 */
function postMatchResultCurl(baseUrl, apiKey, body, opts) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/integrations/game-server/match-results`;
  const json = JSON.stringify(body);
  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      command: `curl -sS -f -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Game-Server-Token: ***' \\\n  -d '${json}'`,
    };
  }
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-f',
      '-X',
      'POST',
      url,
      '-H',
      'Content-Type: application/json',
      '-H',
      `X-Game-Server-Token: ${apiKey}`,
      '-d',
      json,
    ],
    { encoding: 'utf-8' },
  );
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(
      `curl failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim() || 'no output'}`,
    );
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`Non-JSON curl stdout: ${r.stdout?.slice(0, 500)}`);
  }
}

async function main() {
  mergeEnvFromFile();
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const resetZone = args.has('--reset-zone');

  const baseUrl = (process.env.BACKEND_URL ?? 'http://localhost:3000').trim();
  const apiKey = (process.env.GAME_SERVER_API_KEY ?? '').trim();
  if (apiKey.length < 16) {
    throw new Error(
      'Set GAME_SERVER_API_KEY in backend/.env (at least 16 characters). Same value the API validates.',
    );
  }

  const seedNum = Number(process.env.SIM_SEED ?? '1') >>> 0;
  const rng = mulberry32(seedNum);

  const client = connectPg();
  await client.connect();

  try {
    if (resetZone) {
      if (dryRun) {
        console.log('[dry-run] Would reset: Zone-* → SCHEDULED, clear scores; delete playoff_brackets; delete Playoff-* matches.');
      } else {
        await client.query('BEGIN');
        await client.query(
          `UPDATE matches
           SET status = 'SCHEDULED', score_a = NULL, score_b = NULL, round_diff = NULL, end_at = NULL, updated_at = NOW()
           WHERE code LIKE 'Zone-%'`,
        );
        await client.query('DELETE FROM playoff_brackets');
        await client.query(`DELETE FROM matches WHERE code LIKE 'Playoff-%'`);
        await client.query('COMMIT');
        console.log('Reset: Swiss zone maps reopened; playoffs cleared.');
      }
    }

    const { rows } = await client.query(
      `SELECT id, code, team_a_id, team_b_id
       FROM matches
       WHERE code LIKE 'Zone-%'
       ORDER BY code ASC`,
    );

    if (rows.length === 0) {
      throw new Error(
        'No Zone-* matches in DB. Generate a schedule (admin) or run: npm run db:simulate',
      );
    }

    console.log(`Posting ${rows.length} Swiss zone results to ${baseUrl} (SIM_SEED=${seedNum})…\n`);

    let lastResponse = null;
    for (const row of rows) {
      const aWins = rng() < 0.5;
      const { winnerRounds, loserRounds } = randomMapScore(rng);
      const scoreA = aWins ? winnerRounds : loserRounds;
      const scoreB = aWins ? loserRounds : winnerRounds;
      const payload = { matchId: row.id, scoreA, scoreB };

      if (dryRun) {
        const pr = postMatchResultCurl(baseUrl, apiKey, payload, { dryRun: true });
        console.log(`${row.code}  →  ${scoreA}–${scoreB}`);
        console.log(pr.command.replace('***', apiKey));
        console.log('');
        continue;
      }

      const res = postMatchResultCurl(baseUrl, apiKey, payload, { dryRun: false });
      lastResponse = res;
      console.log(
        `${row.code}  ${scoreA}–${scoreB}  →  playoffsSeeded=${res.playoffsSeeded}  (${res.playoffSeedReason ?? 'n/a'})`,
      );
    }

    if (!dryRun && lastResponse) {
      console.log('\nLast API response:', JSON.stringify(lastResponse, null, 2));
      const { rows: pb } = await client.query(
        `SELECT match_number, slot_index, team_name FROM playoff_brackets ORDER BY match_number, slot_index`,
      );
      if (pb.length > 0) {
        console.log('\nplayoff_brackets rows:');
        for (const r of pb) {
          console.log(`  M${r.match_number} slot${r.slot_index}: ${r.team_name}`);
        }
      } else {
        console.log('\nplayoff_brackets: (empty)');
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
