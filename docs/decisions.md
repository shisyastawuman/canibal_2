# Decisions

## Game module: lobby through `reveal_bid` (US-0.4, Epic 1, Epic 2 rules)

`src/game` is framework-free TypeScript. A `Match` is one plain JSON object holding the `phase`, `round`, `prompt`, `promptOrder`, `players` (`PlayerInMatch`), `rosterSize` (`P`, fixed at the first reveal), `nominees`, the running `clock`, and the `bidSpends` published on reveal. Every action is a pure function `(match, input, now?) → Result`, which is either `{ ok: true, match }` with a new match or `{ ok: false, error }` with a `GameError`. Nothing is mutated, and randomness (`Rng`) and time (`now`) are passed in.

Data flow: `createMatch` returns the match code and a secret `facilitatorId`. `joinMatch` adds a player by email at a random rank (5 tokens); rejoining with a known email returns the same player, which is how a refresh or a second phone recovers. `revealFirstPrompt` needs 7–60 players and enough prompts, then locks the roster. `startBidClock` opens `immunity_bid` for 3:00. `setImmunityBid` replaces the player's selection. `extendBidClock` adds 30 s. `closeImmunityBid` (facilitator early, anyone after the deadline) spends the bids, picks the nominees from section 4.4 and enters `reveal_bid`. Phones should only get `viewForPlayer`, which drops other players' bids and the `facilitatorId`. The intended caller is the Cloud Run writer, which stores the result in Firestore.

Unbuilt at that point, and covered in the sections below: the spoken prompt, the endgame, the public view, the prompt catalog and the playable UI. Firestore and Cloud Run are still not wired; the browser session stands in for them.

## Spoken prompt (Epic 3)

`startPrepClock` opens a 30-second `prep` from `reveal_bid`, and only when this round already has nominees. `closePrep` enters `speeches`. Each nominee then gets a strict minute via `startSpeechClock` and `closeSpeech`, worst rank first and then toward #1. The last close opens `facilitator_bonus` with the bonus still unassigned. The facilitator can add 30 seconds or close any of these clocks early.

## Victory (Epic 6)

When the scheduled rounds are over, or two active players remain, `startNextRound` moves the match to `victory`. The two active players win, best rank first. Fired winners fill the rest of the podium: 1 seat for 7–24 players, 2 for 25–42, and 3 for 43–60. More permanent tokens come first, then a later firing, then a better rank at the moment of firing. Special tokens do not count. The history screen stores that podium; the report download is still only a placeholder.

## Public view

`viewForPublic` is the room screen. It always receives the roster: names, ranks and balances. During `immunity_bid` and `vote` it also receives the clock and the instructions for that phase, plus the prompt while bidding, and it does not receive nominees, spends or results. Outside those phases it receives nominees, published spends, results and winners. Ballots stay off that view. A player's phone, through `viewForPlayer`, sees only their own ballot after the reveal.

## Prompt catalog

`addPrompt`, `updatePrompt` and `deletePrompt` edit the facilitator's list. Creating a match copies the chosen order into `promptOrder`, so a later edit does not change a match that is already open.

## Playable app

The phone UI follows the player wireflow from registration through victory, including the star voter. The facilitator uses the same screens' language to reveal the prompt, run the clocks, assign or skip the public bonus, and advance the round. Every color and font lives in `src/ui.css`. `src/session.ts` keeps the one shared match in the browser and is the only writer: it applies the functions in `src/game`. Each role renders `viewForPlayer` or `viewForPublic`.


## Game module: vote and fired players (Epics 4 and 5)

New types: each `PlayerInMatch` now has `votes` (a list of `VoteAllocation`: nominee, influence `tokens`, `specialTokens`), plus `firedInRound` and `rankWhenFired`, kept for the section 4.8 endgame ordering. `Match` gains `facilitatorBonus` (a list of `BonusAllocation`, or null when skipped) and `results` (`VoteResults`: ordered `totals`, `survivors`, `fired`, and every `TokenAward` with its reason).

Data flow: the spoken prompt ends by opening `facilitator_bonus`. `assignFacilitatorBonus` is optional; an empty list means the facilitator skipped it, and null means it is not decided yet. `startVoteClock` opens `vote` for 3:00 and sets special tokens: 1 for active non-nominees, 3 for fired players, 0 for nominees. `setVote` replaces the voter's allocation. `closeVote` then works through section 4.6 in this order: spend the allocations and drop unused special tokens; fire everyone outside the top 2 and compact the ranks (`compactRanks`); move survivors up 2, highest ranked first (`moveUp`); then pay out (+3 per survivor, invested + 2 to each backer, +1 to each top backer). The locked ballots stay on `results` so each phone can be shown its own vote. `endRound` and `startNextRound` loop back to `reveal_prompt`, or to `victory` when the match is over. Fired players already cannot bid or be nominated, because the bid only looks at `active` players.

Readings of the PDR worth checking: (1) ranks are compacted *before* survivors move up, following the order of items 5 and 6; (2) "gets back the tokens they invested" refunds influence and special tokens alike as permanent tokens; (3) "highest voter" means the most tokens of both kinds put on that survivor.
