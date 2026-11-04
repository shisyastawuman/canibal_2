import data from '../../rewards.json';

export interface FiredWinnerBand {
  rosterUpTo: number;
  seats: number;
}

/** Numbers that can differ from one match to the next. `rewards.json` is only the default. */
export interface Rules {
  startingInfluenceTokens: number;
  facilitatorBonusTokens: number;
  freeTokensForActiveVoters: number;
  freeTokensForFiredVoters: number;
  nomineesPerRound: number;
  rewardedSurvivors: number;
  survivorRankPlaces: number;
  survivorInfluenceTokens: number;
  extraTokensForVotingASurvivor: number;
  extraTokensForTopVoter: number;
  activePlayersWhoWin: number;
  firedWinnerBands: FiredWinnerBand[];
}

const defaultBands: FiredWinnerBand[] = data.firedWinnerBands.map((band) => ({
  rosterUpTo: band.rosterUpTo,
  seats: band.seats,
}));

/** Defaults from `rewards.json`. A match stores its own copy at creation. */
export const rewards: Rules = {
  startingInfluenceTokens: data.startingInfluenceTokens,
  facilitatorBonusTokens: data.facilitatorBonusTokens,
  freeTokensForActiveVoters: data.freeTokensForActiveVoters,
  freeTokensForFiredVoters: data.freeTokensForFiredVoters,
  nomineesPerRound: data.nomineesPerRound,
  rewardedSurvivors: data.rewardedSurvivors,
  survivorRankPlaces: data.survivorRankPlaces,
  survivorInfluenceTokens: data.survivorInfluenceTokens,
  extraTokensForVotingASurvivor: data.extraTokensForVotingASurvivor,
  extraTokensForTopVoter: data.extraTokensForTopVoter,
  activePlayersWhoWin: data.activePlayersWhoWin,
  firedWinnerBands: defaultBands,
};

export function copyRules(rules: Rules): Rules {
  return { ...rules, firedWinnerBands: rules.firedWinnerBands.map((band) => ({ ...band })) };
}

/** A match created before rules were stored keeps playing with the defaults. */
export function rulesOf(match: { rules?: Rules }): Rules {
  return match.rules ?? rewards;
}

const COUNT_KEYS = [
  'startingInfluenceTokens',
  'facilitatorBonusTokens',
  'freeTokensForActiveVoters',
  'freeTokensForFiredVoters',
  'nomineesPerRound',
  'rewardedSurvivors',
  'survivorRankPlaces',
  'survivorInfluenceTokens',
  'extraTokensForVotingASurvivor',
  'extraTokensForTopVoter',
  'activePlayersWhoWin',
] as const satisfies readonly (keyof Rules)[];

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Accepts a create-game payload. Nominees must outnumber the survivors, and the winner bands must rise. */
export function rulesFromUnknown(value: unknown): Rules | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const rules = copyRules(rewards);
  for (const key of COUNT_KEYS) {
    const count = whole(source[key]);
    if (count === null) return null;
    rules[key] = count;
  }
  if (!Array.isArray(source.firedWinnerBands) || source.firedWinnerBands.length === 0) return null;
  const bands: FiredWinnerBand[] = [];
  let previous = 0;
  for (const band of source.firedWinnerBands) {
    if (!band || typeof band !== 'object') return null;
    const row = band as Record<string, unknown>;
    const rosterUpTo = whole(row.rosterUpTo);
    const seats = whole(row.seats);
    if (rosterUpTo === null || seats === null || rosterUpTo <= previous) return null;
    bands.push({ rosterUpTo, seats });
    previous = rosterUpTo;
  }
  rules.firedWinnerBands = bands;
  if (rules.nomineesPerRound <= rules.rewardedSurvivors || rules.activePlayersWhoWin < 1) return null;
  return rules;
}

/** Fired winners added for a roster. The last band covers anything above it. */
export function firedWinnerSeats(rosterSize: number, rules: Rules = rewards): number {
  for (const band of rules.firedWinnerBands) {
    if (rosterSize <= band.rosterUpTo) return band.seats;
  }
  return rules.firedWinnerBands.at(-1)?.seats ?? 0;
}
