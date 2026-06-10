/**
 * Run database/seeds/001-demo-users-teams-bracket.sql using the `pg` driver (no psql CLI).
 *
 * Loads backend/.env when variables are missing. From repo root with Docker Postgres:
 *   SEED_VIA_DOCKER=1 npm run db:seed --prefix backend
 *
 * From backend/:
 *   npm run db:seed
 *   npm run db:seed:docker
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const SQL_FILE = path.join(ROOT, 'database', 'seeds', '001-demo-users-teams-bracket.sql');
const ENV_FILE = path.join(ROOT, '.env');
const COMPOSE_FILE = path.join(ROOT, '..', 'docker-compose.yml');

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

async function seedViaDocker() {
  if (!fs.existsSync(COMPOSE_FILE)) {
    throw new Error(`SEED_VIA_DOCKER=1 but missing ${COMPOSE_FILE}`);
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const db = process.env.DATABASE_NAME;
  const user = process.env.DATABASE_USER;
  const pass = process.env.DATABASE_PASSWORD ?? '';
  const r = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `PGPASSWORD=${pass}`,
      'postgres',
      'psql',
      '-U',
      user,
      '-d',
      db,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    {
      cwd: path.dirname(COMPOSE_FILE),
      input: sql,
      encoding: 'utf-8',
    },
  );
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(r.stderr || `docker compose exec failed (${r.status})`);
  }
  if (r.stdout) {
    process.stdout.write(r.stdout);
  }
  if (r.stderr) {
    process.stderr.write(r.stderr);
  }
  console.log('Seed applied (via docker compose exec postgres).');
}

async function seedViaPg() {
  let host = process.env.DATABASE_HOST;
  if (!host) {
    throw new Error('Set DATABASE_HOST in backend/.env (use localhost when Postgres maps port 5432 to the host).');
  }
  if (host === 'postgres' && !fs.existsSync('/.dockerenv')) {
    console.warn(
      'DATABASE_HOST is "postgres" (Docker DNS). Using localhost for host connections.',
    );
    console.warn('If that fails, run: npm run db:seed:docker');
    host = 'localhost';
  }
  const port = Number(process.env.DATABASE_PORT ?? '5432');
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME;
  if (!user || !database) {
    throw new Error('Set DATABASE_USER and DATABASE_NAME in backend/.env');
  }

  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log('Seed applied.');
}

async function main() {
  mergeEnvFromFile();
  if (process.env.SEED_VIA_DOCKER === '1') {
    if (!process.env.DATABASE_NAME || !process.env.DATABASE_USER) {
      throw new Error('DATABASE_NAME and DATABASE_USER must be set (e.g. in backend/.env)');
    }
    await seedViaDocker();
    return;
  }
  await seedViaPg();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
