export const BRACKET_GROUP_CODES = ['A', 'B', 'C', 'D'] as const;
export type BracketGroupCode = (typeof BRACKET_GROUP_CODES)[number];

/** Number of team slots per group (A has 6, B–D have 5). */
export function bracketSlotCount(group: BracketGroupCode): number {
  return group === 'A' ? 6 : 5;
}
