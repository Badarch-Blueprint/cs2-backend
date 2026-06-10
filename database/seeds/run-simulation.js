/**
 * Deterministic tournament simulation: zone round-robin → standings → playoffs.
 *
 * Standings (per group):
 *   - Match points: win = +1, loss = 0 (bye rounds: no match played → no change).
 *   - Round differential (tiebreaker): per finished map, winner +(their rounds − opponent rounds),
 *     loser −(same); does not change match points.
 *
 * Top two teams per group (A–D) advance to single-elim playoffs (8 teams).
 * Writes FINISHED rows to `matches` (Zone-* and Playoff-M*) and repopulates `playoff_brackets`.
 *
 * From backend/:
 *   npm run db:simulate
 *   SIM_SEED=123 npm run db:simulate
 *
 * Optional — round 2 playoff (semis) = Playoff-M5, Bo3 veto test:
 *   SIM_PLAYOFF_SF_MEET=<teamA-uuid>,<teamB-uuid> npm run db:simulate
 *   npm run db:simulate:bo3-veto   (same, with repo default test teams)
 * Reorders QF so those teams feed SF1, rigs QF1/QF2 winners, inserts Playoff-M5 as
 * VETO_PHASE (no scores). M6/M7 are skipped; playoff_brackets only gets filled slots.
 *
 * Requires: DATABASE_* in backend/.env, bracket_teams + teams populated (e.g. npm run db:seed).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env');

const GROUPS = ['A', 'B', 'C', 'D'];
const MATCH_STATUS_FINISHED = 'FINISHED';
const MATCH_STATUS_VETO_PHASE = 'VETO_PHASE';

/** Single-elim: 4 QF → 2 SF → 1 F (matches 1–7). */
const PLAYOFF_MATCH_COUNT = 7;

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

function connectClient() {
  let host = process.env.DATABASE_HOST;
  if (!host) {
    throw new Error('DATABASE_HOST missing (backend/.env)');
  }
  if (host === 'postgres' && !fs.existsSync('/.dockerenv')) {
    console.warn('DATABASE_HOST "postgres" → using localhost for host Node.');
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

/** @returns {() => number} uniform [0,1) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Round-robin (aligned with src/matches/round-robin.ts) ---------- */

const BYE = '__RR_BYE__';

function planEven(teamIds) {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error('planEven expects even n ≥ 2');
  }
  const arr = [...teamIds];
  const rounds = n - 1;
  const half = n / 2;
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const pairings = [];
    for (let i = 0; i < half; i++) {
      pairings.push({
        teamAId: arr[i],
        teamBId: arr[n - 1 - i],
      });
    }
    out.push({ roundNumber: r + 1, pairings, byeTeamId: null });
    const head = arr[0];
    const tail = arr.slice(1);
    const last = tail.pop();
    arr.length = 0;
    arr.push(head, last, ...tail);
  }
  return out;
}

function planOddGeneric(teamIds) {
  const working = [...teamIds, BYE];
  const n = working.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...working];
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const pairings = [];
    let byeTeamId = null;
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === BYE) {
        byeTeamId = b;
      } else if (b === BYE) {
        byeTeamId = a;
      } else {
        pairings.push({ teamAId: a, teamBId: b });
      }
    }
    out.push({ roundNumber: r + 1, pairings, byeTeamId });
    const head = arr[0];
    const tail = arr.slice(1);
    const last = tail.pop();
    arr.length = 0;
    arr.push(head, last, ...tail);
  }
  return out;
}

function buildZoneRoundRobin(teamIds) {
  const n = teamIds.length;
  if (n < 2) {
    return [];
  }
  if (n % 2 === 0) {
    return planEven(teamIds);
  }
  return planOddGeneric(teamIds);
}

/* ---------- CS-style scores ---------- */

function randomMapScore(rng) {
  const overtime = rng() < 0.22;
  if (!overtime) {
    const winnerRounds = 13;
    const maxLoser = 12;
    const loserRounds = Math.min(maxLoser, Math.floor(rng() * 13));
    return { winnerRounds, loserRounds };
  }
  const winnerRounds = 16 + Math.floor(rng() * 3);
  const margin = 1 + Math.floor(rng() * 3);
  const loserRounds = winnerRounds - margin;
  return { winnerRounds, loserRounds };
}

function pickSidesAndScore(teamAId, teamBId, rng) {
  const aWins = rng() < 0.5;
  const { winnerRounds, loserRounds } = randomMapScore(rng);
  if (aWins) {
    return {
      winnerId: teamAId,
      loserId: teamBId,
      scoreA: winnerRounds,
      scoreB: loserRounds,
    };
  }
  return {
    winnerId: teamBId,
    loserId: teamAId,
    scoreA: loserRounds,
    scoreB: winnerRounds,
  };
}

function makeStatsMap(roster) {
  const m = new Map();
  for (const t of roster) {
    m.set(t.id, { teamId: t.id, name: t.name, wins: 0, losses: 0, roundDiff: 0 });
  }
  return m;
}

function applyMatchResult(stats, teamAId, teamBId, scoreA, scoreB) {
  const a = stats.get(teamAId);
  const b = stats.get(teamBId);
  if (!a || !b) {
    return;
  }
  const diffA = scoreA - scoreB;
  const diffB = scoreB - scoreA;
  a.roundDiff += diffA;
  b.roundDiff += diffB;
  if (scoreA > scoreB) {
    a.wins += 1;
    b.losses += 1;
  } else if (scoreB > scoreA) {
    b.wins += 1;
    a.losses += 1;
  }
}

function rankGroup(statsMap) {
  return [...statsMap.values()].sort((x, y) => {
    if (y.wins !== x.wins) {
      return y.wins - x.wins;
    }
    if (y.roundDiff !== x.roundDiff) {
      return y.roundDiff - x.roundDiff;
    }
    return x.name.localeCompare(y.name);
  });
}

/** QF order: (C2 vs B1), (C1 vs B2), (A1 vs D2), (A2 vs D1). */
function buildQuarterFinalPairs(rankedByGroup) {
  const A1 = rankedByGroup.A[0];
  const A2 = rankedByGroup.A[1];
  const B1 = rankedByGroup.B[0];
  const B2 = rankedByGroup.B[1];
  const C1 = rankedByGroup.C[0];
  const C2 = rankedByGroup.C[1];
  const D1 = rankedByGroup.D[0];
  const D2 = rankedByGroup.D[1];
  const qf = [
    { a: C2, b: B1, label: 'QF1' },
    { a: C1, b: B2, label: 'QF2' },
    { a: A1, b: D2, label: 'QF3' },
    { a: A2, b: D1, label: 'QF4' },
  ];
  return { qf };
}

function simOneMatch(teamA, teamB, rng) {
  const r = pickSidesAndScore(teamA.id, teamB.id, rng);
  const scoreA = r.scoreA;
  const scoreB = r.scoreB;
  const winner = scoreA > scoreB ? teamA : teamB;
  const loser = scoreA > scoreB ? teamB : teamA;
  return { winner, loser, scoreA, scoreB };
}

function idEq(a, b) {
  return String(a) === String(b);
}

function pairHasTeam(pair, teamId) {
  return idEq(pair.a.id, teamId) || idEq(pair.b.id, teamId);
}

/** Semis (M5) = QF1 winner vs QF2 winner — put teamA in match 1 and teamB in match 2. */
function reorderQfForSemisMeet(qf, teamAId, teamBId) {
  const out = qf.slice();
  const iA = out.findIndex((p) => pairHasTeam(p, teamAId));
  const iB = out.findIndex((p) => pairHasTeam(p, teamBId));
  if (iA < 0 || iB < 0) {
    throw new Error(
      'SIM_PLAYOFF_SF_MEET: both teams must reach playoffs (top-2 in their Swiss group).',
    );
  }
  if (iA === iB) {
    throw new Error(
      'SIM_PLAYOFF_SF_MEET: the two teams cannot start in the same quarter-final.',
    );
  }
  if (iA !== 0) {
    const t = out[0];
    out[0] = out[iA];
    out[iA] = t;
  }
  const jB = out.findIndex((p) => pairHasTeam(p, teamBId));
  if (jB !== 1) {
    const t = out[1];
    out[1] = out[jB];
    out[jB] = t;
  }
  return out;
}

/** Winner is always slot `a` with a fixed 13–8 score for DB inserts. */
function simQuarterFinalRigged(pair, winnerTeamId) {
  let a = pair.a;
  let b = pair.b;
  if (idEq(b.id, winnerTeamId)) {
    const t = a;
    a = b;
    b = t;
  } else if (!idEq(a.id, winnerTeamId)) {
    throw new Error(`Rigged QF: winner team ${winnerTeamId} not in pair ${pair.label}`);
  }
  const scoreA = 13;
  const scoreB = 8;
  return { winner: a, loser: b, scoreA, scoreB };
}

function parseSfMeetEnv() {
  const raw = process.env.SIM_PLAYOFF_SF_MEET?.trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('SIM_PLAYOFF_SF_MEET must be exactly two comma-separated team UUIDs');
  }
  return { teamA: parts[0], teamB: parts[1] };
}

async function main() {
  mergeEnvFromFile();
  const seedNum = Number(process.env.SIM_SEED ?? '1') >>> 0;
  const rng = mulberry32(seedNum);

  const client = connectClient();
  await client.connect();
  const t0 = Date.now();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM matches WHERE code LIKE 'Zone-%' OR code LIKE 'Playoff-%'`,
    );
    await client.query('DELETE FROM playoff_brackets');

    const rosterByGroup = {};
    for (const g of GROUPS) {
      const { rows } = await client.query(
        `SELECT bt.team_id AS id, t.name AS name
         FROM bracket_teams bt
         INNER JOIN teams t ON t.id = bt.team_id
         WHERE bt.group_code = $1
         ORDER BY bt.slot_index ASC`,
        [g],
      );
      rosterByGroup[g] = rows.map((r) => ({ id: r.id, name: r.name }));
      if (rows.length < 2) {
        console.warn(`Group ${g}: fewer than 2 teams — skipping zone sim.`);
      }
    }

    const rankedByGroup = {};
    let matchSeq = 0;

    for (const g of GROUPS) {
      const roster = rosterByGroup[g];
      if (roster.length < 2) {
        rankedByGroup[g] = roster;
        continue;
      }

      const plan = buildZoneRoundRobin(roster.map((t) => t.id));
      const stats = makeStatsMap(roster);

      for (const step of plan) {
        let matchInRound = 0;
        for (const p of step.pairings) {
          const ta = roster.find((x) => x.id === p.teamAId);
          const tb = roster.find((x) => x.id === p.teamBId);
          if (!ta || !tb) {
            continue;
          }
          const { scoreA, scoreB } = pickSidesAndScore(p.teamAId, p.teamBId, rng);
          applyMatchResult(stats, p.teamAId, p.teamBId, scoreA, scoreB);

          matchInRound += 1;
          matchSeq += 1;
          const code = `Zone-${g}-R${step.roundNumber}-M${matchInRound}`;
          const roundDiff = Math.abs(scoreA - scoreB);
          const startAt = new Date(t0 + matchSeq * 60_000);
          const endAt = new Date(t0 + matchSeq * 60_000 + 45 * 60_000);

          await client.query(
            `INSERT INTO matches (
               id, code, status, team_a_id, team_b_id, score_a, score_b, round_diff, start_at, end_at, created_at, updated_at
             ) VALUES (
               gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
             )`,
            [
              code,
              MATCH_STATUS_FINISHED,
              p.teamAId,
              p.teamBId,
              scoreA,
              scoreB,
              roundDiff,
              startAt.toISOString(),
              endAt.toISOString(),
            ],
          );
        }
      }

      const expectedMatchesPerTeam = roster.length - 1;
      for (const row of stats.values()) {
        const played = row.wins + row.losses;
        if (played !== expectedMatchesPerTeam) {
          throw new Error(
            `Group ${g}: ${row.name} played ${played} maps, expected ${expectedMatchesPerTeam} (round-robin schedule bug?)`,
          );
        }
      }

      const ranked = rankGroup(stats);
      rankedByGroup[g] = ranked;
      console.log(`\nGroup ${g} (seed=${seedNum}) — sorted by wins, then round diff:`);
      for (const row of ranked) {
        console.log(
          `  ${row.name.padEnd(22)}  W ${row.wins}  L ${row.losses}  RD ${row.roundDiff >= 0 ? '+' : ''}${row.roundDiff}`,
        );
      }
    }

    for (const g of GROUPS) {
      if (!rankedByGroup[g] || rankedByGroup[g].length < 2) {
        throw new Error(`Group ${g} needs at least 2 teams for playoff simulation.`);
      }
    }

    const sfMeet = parseSfMeetEnv();
    /** Set when {@link sfMeet}: reused for M5 insert (avoids second DB round-trip). */
    let sfMeetTeams = null;
    if (sfMeet) {
      const { rows: injRows } = await client.query(
        `SELECT id, name FROM teams WHERE id = ANY($1::uuid[])`,
        [[sfMeet.teamA, sfMeet.teamB]],
      );
      const injA = injRows.find((r) => idEq(r.id, sfMeet.teamA));
      const injB = injRows.find((r) => idEq(r.id, sfMeet.teamB));
      if (!injA || !injB) {
        throw new Error('SIM_PLAYOFF_SF_MEET: both UUIDs must exist in teams table');
      }
      sfMeetTeams = { first: injA, second: injB };
      /**
       * QF1 = C2 vs B1, QF2 = C1 vs B2 (see buildQuarterFinalPairs). Force the two
       * teams into different QFs so they can both win and meet on Playoff-M5.
       */
      rankedByGroup.C[1] = { id: injA.id, name: injA.name };
      rankedByGroup.B[1] = { id: injB.id, name: injB.name };
      console.log(
        `\n[SIM_PLAYOFF_SF_MEET] Playoff seed override for semis fixture: C2=${injA.name}, B2=${injB.name}`,
      );
    }

    const adv = {};
    for (const g of GROUPS) {
      adv[g] = rankedByGroup[g].slice(0, 2);
    }

    const { qf } = buildQuarterFinalPairs(adv);
    const qfOrdered = sfMeet ? reorderQfForSemisMeet(qf, sfMeet.teamA, sfMeet.teamB) : qf;

    const qfResults = [];
    for (let i = 0; i < 4; i++) {
      const pair = qfOrdered[i];
      let res;
      let rowA;
      let rowB;
      if (sfMeet && i < 2) {
        res = simQuarterFinalRigged(pair, i === 0 ? sfMeet.teamA : sfMeet.teamB);
        rowA = res.winner;
        rowB = res.loser;
      } else {
        res = simOneMatch(pair.a, pair.b, rng);
        rowA = pair.a;
        rowB = pair.b;
      }
      qfResults.push(res);
      matchSeq += 1;
      const code = `Playoff-M${i + 1}`;
      const roundDiff = Math.abs(res.scoreA - res.scoreB);
      const startAt = new Date(t0 + matchSeq * 60_000);
      const endAt = new Date(t0 + matchSeq * 60_000 + 50 * 60_000);
      await client.query(
        `INSERT INTO matches (
           id, code, status, team_a_id, team_b_id, score_a, score_b, round_diff, start_at, end_at, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
         )`,
        [
          code,
          MATCH_STATUS_FINISHED,
          rowA.id,
          rowB.id,
          res.scoreA,
          res.scoreB,
          roundDiff,
          startAt.toISOString(),
          endAt.toISOString(),
        ],
      );
    }

    /** Row-major roster: match 1..7 × 2 slots (names only, matches replacePlayoffs API). */
    const roster14 = new Array(PLAYOFF_MATCH_COUNT * 2).fill('');
    const setSlot = (matchNumber, slotIndex, name) => {
      roster14[(matchNumber - 1) * 2 + slotIndex] = name;
    };

    for (let i = 0; i < 4; i++) {
      const pair = qfOrdered[i];
      setSlot(i + 1, 0, pair.a.name);
      setSlot(i + 1, 1, pair.b.name);
    }

    let sf1;
    let sf2 = null;
    let finalRes = null;

    if (sfMeet) {
      const na = sfMeetTeams.first;
      const nb = sfMeetTeams.second;

      matchSeq += 1;
      const m5Start = new Date(t0 + matchSeq * 60_000);
      const m5End = new Date(t0 + matchSeq * 60_000 + 50 * 60_000);
      await client.query(
        `INSERT INTO matches (
           id, code, status, team_a_id, team_b_id, score_a, score_b, round_diff,
           map_name, veto_bans, start_at, end_at, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
         )`,
        [
          'Playoff-M5',
          MATCH_STATUS_VETO_PHASE,
          sfMeet.teamA,
          sfMeet.teamB,
          null,
          null,
          null,
          null,
          null,
          m5Start.toISOString(),
          m5End.toISOString(),
        ],
      );

      setSlot(5, 0, na.name);
      setSlot(5, 1, nb.name);

      sf1 = { winner: na, loser: nb };

      console.log('\n--- Playoff (partial; Bo3 veto test) ---');
      console.log(
        `Playoff-M5 is VETO_PHASE (semis): ${na.name} vs ${nb.name}  [SIM_PLAYOFF_SF_MEET]`,
      );
      console.log('QF M1–M4 FINISHED; M6/M7 not inserted.');
    } else {
      sf1 = simOneMatch(qfResults[0].winner, qfResults[1].winner, rng);
      sf2 = simOneMatch(qfResults[2].winner, qfResults[3].winner, rng);

      for (let m = 5; m <= 6; m++) {
        const res = m === 5 ? sf1 : sf2;
        const pair =
          m === 5
            ? { a: qfResults[0].winner, b: qfResults[1].winner }
            : { a: qfResults[2].winner, b: qfResults[3].winner };
        matchSeq += 1;
        const startAt = new Date(t0 + matchSeq * 60_000);
        const endAt = new Date(t0 + matchSeq * 60_000 + 50 * 60_000);
        await client.query(
          `INSERT INTO matches (
             id, code, status, team_a_id, team_b_id, score_a, score_b, round_diff, start_at, end_at, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
           )`,
          [
            `Playoff-M${m}`,
            MATCH_STATUS_FINISHED,
            pair.a.id,
            pair.b.id,
            res.scoreA,
            res.scoreB,
            Math.abs(res.scoreA - res.scoreB),
            startAt.toISOString(),
            endAt.toISOString(),
          ],
        );
      }

      finalRes = simOneMatch(sf1.winner, sf2.winner, rng);
      matchSeq += 1;
      await client.query(
        `INSERT INTO matches (
           id, code, status, team_a_id, team_b_id, score_a, score_b, round_diff, start_at, end_at, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
         )`,
        [
          'Playoff-M7',
          MATCH_STATUS_FINISHED,
          sf1.winner.id,
          sf2.winner.id,
          finalRes.scoreA,
          finalRes.scoreB,
          Math.abs(finalRes.scoreA - finalRes.scoreB),
          new Date(t0 + matchSeq * 60_000).toISOString(),
          new Date(t0 + matchSeq * 60_000 + 55 * 60_000).toISOString(),
        ],
      );

      setSlot(5, 0, sf1.winner.name);
      setSlot(5, 1, sf1.loser.name);
      setSlot(6, 0, sf2.winner.name);
      setSlot(6, 1, sf2.loser.name);
      setSlot(7, 0, finalRes.winner.name);
      setSlot(7, 1, finalRes.loser.name);

      console.log('\n--- Playoff ---');
      console.log(
        `Champion: ${finalRes.winner.name}  (runner-up ${finalRes.loser.name})  [SIM_SEED=${seedNum}]`,
      );
    }

    for (let i = 0; i < roster14.length; i++) {
      const name = roster14[i]?.trim();
      if (!name) {
        continue;
      }
      const matchNumber = Math.floor(i / 2) + 1;
      const slotIndex = i % 2;
      await client.query(
        `INSERT INTO playoff_brackets (id, match_number, slot_index, team_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())`,
        [matchNumber, slotIndex, name],
      );
    }

    await client.query('COMMIT');

    console.log('playoff_brackets + matches (Zone-*, Playoff-M*) updated.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
