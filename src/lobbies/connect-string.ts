/**
 * Canonical CS2 connect string exposed to members once the rental server is
 * ready. Kept in a single place so the Postman collection, the frontend's
 * "Lobby is live" screen, and any tests all agree.
 *
 * - With password: `password <password>; connect <host>:<port>`
 * - Without:       `connect <host>:<port>`
 */
export function buildConnectString(input: {
  readonly host: string;
  readonly port: number;
  readonly password?: string | null;
}): string {
  const base = `connect ${input.host}:${input.port}`;
  const pwd = input.password?.trim();
  return pwd ? `password ${pwd}; ${base}` : base;
}
