process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'e2e-jwt-secret-at-least-8-chars';
process.env.BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:4200';
process.env.GAME_SERVER_API_KEY =
  process.env.GAME_SERVER_API_KEY ?? 'e2e-game-server-key-16chars-min';
