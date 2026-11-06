# Caníbal 2.0 — PDR v1.0

Open questions are marked like this: <span style="color:#e85d04;font-weight:700">[FILL IN: decision still missing]</span>. Anything without that mark comes from the ruleset.

## 1. Product definition

- **About this project:** Gamified PWA for in-person corporate training sessions. App is to be run on player's smartphones (iPhone and Android) as well as the facilitator's computer and a public's view screen.

The training session requires a minimum of 7 players and a maximum of 60 players. Round length and the number of winners scale with that roster, as defined in sections 4.4 and 4.8: 5 to 7 rounds, and 3 to 5 winners.

- **Technical stack:** Vite, React, TypeScript, Vitest, and vite-plugin-pwa. The match has one shared live state. Other players' bids and votes stay hidden until that phase is revealed. The backend runs on Google Cloud and stays at idle cost when no match is open:
  - Firebase Hosting serves the PWA.
  - Cloud Firestore stores prompts, match history, and live match state.
  - Cloud Run (minimum instances 0) is the only writer of match results: nominations, firings, rank, and token changes. Phones do not calculate those outcomes.
  - A facilitator action starts, extends, or closes a clock. The server stores the deadline and rejects an early close that the facilitator did not request. No always-on scheduler.
  - There is no Cloud SQL, no VM, and no always-on database. A session of up to 60 phones stays inside the Firestore and Cloud Run free tiers.

## 2. Roles and cardinality

1. `Active player`: a player who has not been eliminated. Bids for immunity, can be nominated, answers the prompt if nominated, and votes.
2. `Fired player`: a player that was eliminated and stays in the match only as a voter. Each round they receive 3 special voting tokens. At the end, the fired players with the most permanent tokens may be declared winners. They do not return for another prompt.
3. `Facilitator`: runs the match. May publicly and optionally assign 5 tokens among the nominees at the start of voting. Is not a player, cannot bid, be nominated nor vote.
4. `Public view`: outside a secret phase, shows the ranking and state of each player, the round number, the current prompt, and the voting results. During `immunity_bid` and `vote`, it shows only the clock and the prompt or instructions for that phase.

## 3. Identity and session

- Each player opens the app and registers with a **name** and an **email address** [stored with no verification].
- During match creation they receive a **random rank** and **5 influence tokens** for this match only. Each player holds a unique spot in the ranking, no two ranks can be duplicated.
- Anyone who knows a player's email can act as that player, including from a second phone. The match keeps one selection per player. The latest submission from that email replaces the previous one.
- While a secret phase is open, the player's current selection lives on the match and reappears if they reopen the app.
- No one can join after the first prompt is revealed. The join link rejects new players from that moment. The roster is the set of players already in, and it must be from 7 to 60 or the reveal is refused.
- Upon disconnection, the facilitator can rejoin the room with a unique id.

## 4. Rules engine

### 4.1 Objects

`PlayerInMatch`

- `name`, `email`
- `status`: `active` or `fired`
- `rank`: unique place in the match order.
- `tokens`: ordinary tokens. Starting balance: 5.
- `specialTokens`: can only be spent on votes. Starting balance: 0.
- `immunityBid`: influence tokens chosen in phase 1. Hidden from the others until the reveal.
- `votes`: allocation of influence tokens and special tokens across the nominees. Hidden from the others until the reveal.

`Match`

- `round`
- `phase` (section 5)
- the round's `prompt`
- `nominees`: the active players nominated this round. The count is set in section 4.4.
- `promptOrder`: the ordered list of prompts fixed on the match creation screen.
- `facilitatorBonus`: absent, or a public allocation of tokens across the nominees
- the round's `results`, after the reveal

`Prompt`: a content item with a text that is revealed. Its other fields are in section 7.

### 4.2 What a token is

- **Influence.** The game's currency. It is used to protect yourself (immunity bid) and to decide other people's futures (the vote). A player cannot spend more influence than they hold.
- **Special token.** It can only be spent on a vote and if not used is discarded. It cannot be used in the immunity bid.

### 4.3 Rank

- Every active player holds a unique rank.
- Moving up or down the rank means having your number decrease or increase, being #1 the top.
- Players whose rank gets taken by another player are demoted or promoted accordingly.
- A move up is capped at #1. The player’s number decreases by up to 2, and each player they pass increases by 1.
- When several rewarded survivors move up in the same reveal, the highest ranked (lowest number) is promoted first, then the next, and so on toward the lowest rank.
- The ranking is compacted upon player elimination. Fired players lose their rank.

### 4.4 Phase 1 — who gets nominated

1. The prompt is revealed.
2. Each active player chooses how many influence tokens to put in the bid. At 3 minutes, the selected amount is spent and influence drops by that amount. The selection can be changed until the timer runs out.
3. The minimum automatic bid is 0, which is what is selected if the player does nothing.
4. How much each player spent is revealed.
5. Nomination count and how many of them are fired are fixed from the roster size `P` (the players in the match when the first prompt is revealed):
   - Rounds: `R = min(7, P − 2)`. A match of 7 players runs 5 rounds, 8 players run 6, and 9 or more run 7.
   - Eliminations across the whole match: `P − 2`, so the match ends with 2 active players.
   - Those eliminations are spread across the rounds as evenly as possible. The earlier rounds take the extra eliminations. In a round that fires `F` players, the nominee count is `F + 2`.
   - The `F + 2` active players who spent the least are nominated. In a tie, lower ranks (higher numbers) are selected.
   - On the last round the nominee count equals the number of active players, so the bid cannot grant immunity. On earlier rounds at least one active player is left off the nomination.
6. Every nominee is either fired or survives and is rewarded. There is no middle group. The top 2 by vote survive and are rewarded. The other nominees are fired. Section 4.6 has the tie-breaks.

Example of the bid tie-break when a round nominates 4: spends of 0 [#1], 0 [#40], 1 [#18], 2 [#5], 2 [#7], and 5 [#13]. Nominees: the players who spent 0, 0, 1, and 2 ranked #7.

A 7-player match nominates 3 and fires 1 on each of 5 rounds. A 60-player match runs 7 rounds, firing 9, 9, 8, 8, 8, 8, and 8, and nominating 11, 11, 10, 10, 10, 10, and 10.

### 4.5 Phase 2 — the prompt

1. The nominees see the prompt again.
2. They have **30 seconds** together to prepare.
3. The nominee of lower rank (higher number) speaks first. Each nominee has a **strict 1 minute**. Players continue in rank order toward #1.
4. The answer is spoken, in the room. The app shows the prompt, whose turn it is, and the running second. At 60 seconds it marks the cutoff. It does not record the answer.

### 4.6 Phase 3 — the vote and its rewards

1. **Optional, and first:** the facilitator assigns **5 tokens** publicly among the nominees. Those tokens do not come out of a player's pocket. They join each nominee's total before the players vote. Facilitator may assign fewer than 5 (including 0) and split the tokens between different players.
2. Each active player (except nominees) receives **1 special token** for that vote. Each fired player receives 3. If they are not used, they are lost.
3. Every player (even fired, but not the nominees) has **3 minutes** to spend tokens voting for the nominees. They may put more than one token on the same nominee. During those 3 minutes the allocation can be changed. At 3 minutes, the selected amount is spent on the corresponding nominees.
4. The totals are revealed. Those totals decide who leaves and who is saved. Each nominee's total adds, at equal value, the influence tokens voted, the special tokens voted, and the facilitator bonus.
5. The **top 2 nominees** survive and are rewarded. **Every other nominee is fired.** Ties for a reward place are broken in favor of the highest ranks (lower numbers). Ties for a firing place are broken against the lowest ranks (higher numbers). Fired players retain their permanent tokens and lose their rank.
6. Each rewarded survivor moves up 2 rank places and gains 3 influence tokens. The highest ranked survivor (#1 before #2) is promoted first, then the other.
7. Anyone who voted for a survivor **gets back the tokens they invested in that survivor and gains 2 extra**, all as permanent tokens. This is for each survivor they voted.
8. The **highest voter for each surviving nominee** gains **1 extra token**. If several players tie for that place, each of them gains 1 token.

### 4.7 Fired players

- They stay in the match as star voters.
- Each round they receive **3 special tokens** (instead of the usual 1) that can only be spent on votes and are lost if not used.
- They vote under the same rules as everyone else.
- A fired player who voted for a survivor collects the same refund and the same extra tokens.
- Fired player do not bid and cannot be nominated.

### 4.8 Endgame and victory

- **Victory:** the match ends when 2 active players remain. They are winners. Fired winners are added from the fired players with the most permanent tokens (special tokens do not count). Those fired winners do not return to play.
- How many fired winners are added, so the total stays between 3 and 5:
  - 7 to 24 players: 1 fired winner, 3 winners in total.
  - 25 to 42 players: 2 fired winners, 4 winners in total.
  - 43 to 60 players: 3 fired winners, 5 winners in total.
- Ordering for those seats: more permanent tokens first. If tokens are equal, the player fired in the later round comes first. If they were fired in the same round, the better rank at the moment of firing (lower number) comes first. Take only as many as the band allows.

## 5. Phase machine

A round walks these phases, in this order. Once the clock has started, its duration is fixed.

| Order | Phase | Who acts | Clock | Secret until the phase closes |
| --- | --- | --- | --- | --- |
| 1 | `reveal_prompt` | The round's prompt is shown | None | No |
| 2 | `immunity_bid` | Each active player chooses their bid | 3:00 | Other players' bids |
| 3 | `reveal_bid` | The spends and the nominees are shown | None | No |
| 4 | `prep` | The nominees prepare | 0:30 | No |
| 5 | `speeches` | One nominee at a time, starting from the one of lower rank | 1:00 per nominee | No |
| 6 | `facilitator_bonus` | The facilitator assigns 5 tokens or skips the phase | None | No; the allocation is public |
| 7 | `vote` | Active and fired players allocate tokens | 3:00 | Other players' votes |
| 8 | `reveal_vote` | Firings, rank, and rewards are applied | None | No |
| 9 | `round_end` | Next round or endgame | None | No |

Before the first round the match is in `lobby`. After whichever closing applies, it moves to `victory`.

The 3:00, 0:30, and 1:00 clocks are started by the facilitator. The facilitator may close the clocks early or add increments of 30 seconds.

During `immunity_bid` and `vote`, the public view receives only the clock and the prompt or instructions for that phase. It does not receive bids, votes, or token balances.

Transitions the ruleset does not allow:

- Spending more influence than the balance.
- Spending special tokens on the bid.
- Seeing another player's bid or vote before that round's reveal phase.
- Nominating anyone who is not chosen by section 4.4.
- Firing a nominee who finished in the rewarded top 2, or firing someone who was not nominated.
- Rewarding a nominee who did not finish in the top 2.
- Entering `prep` or `speeches` without this round's nominees.
- Using a special token already lost because it was not spent.
- Joining after the first prompt has been revealed.
- Showing someone else's phone. The app has no screen for revealing another player's private selection.

## 6. Source of truth

There is a single shared match. Every phone reads that state.

- During `immunity_bid` and `vote`, a player client receives the prompt, the clock, their balance, and their own selection. It does not receive the other players' selections. The public view receives only the clock and the prompt or instructions for that phase.
- On `reveal_bid` and `reveal_vote`, the same result appears for everyone.
- Nominees, firings, rank, and tokens are calculated by the Cloud Run service, not by each phone on its own. Clients listen to the Firestore match state.

## 7. Content

- Each round uses one prompt: the text revealed in phase 1 and shown again to the nominees in phase 2.
- Prompts are stored in a modifiable database. On the match creation screen the facilitator fixes the ordered list for the whole match. Round 1 uses the first prompt, round 2 the second, and so on. Extra prompts are unused.
- The facilitator cannot reveal the first prompt unless that list has at least as many prompts as the round count for the players who have joined.

## 8. Language and names

- Code in English. UI in Spanish.
- Domain terms, in this order: ruleset concept, code name, Spanish ruleset term.

| Concept | Code | Spanish ruleset |
| --- | --- | --- |
| Influence token | `tokens` | Ficha de influencia |
| Special token | `specialToken` | Ficha especial |
| Rank | `rank` | Ranking |
| Prompt | `prompt` | Consigna |
| Immunity bid | `immunityBid` | Puja por inmunidad |
| Nominee | `nominee` | Nominado |
| Fired / star voter | `fired` | Despedido / Despedido |
| Facilitator | `facilitator` | Facilitador |
| Public bonus of 5 tokens | `facilitatorBonus` | Bono público de 5 fichas |

## 9. User stories

Format: As a [role], I want [action] so that [outcome].

### Epic 0: Match creation

- **US-0.1:** As a `Facilitator`, I want to access the home screen to view the prompt database, match history and create a new match.
- **US-0.2:** As a `Facilitator`, I want to modify, create and eliminate prompts from the prompt database.
- **US-0.3:** As a `Facilitator`, I want to see the history of previous matches and a download action for the match report. The download is a placeholder for now.
- **US-0.4:** As a `Facilitator`, I want to create a match and get a shareable unique link through which player can register and join and another link through which to see the Public view.

### Epic 1: Entry

- **US-1.1:** As a `Player`, I want to register with my name and email so that I am identified in the match.
- **US-1.2:** As a `Player`, I want to receive a random rank and 5 influence tokens so that I start with the same base resources.
- **US-1.3:** As a `Facilitator`, I want to open a match and see who is already in so that I can reveal the first prompt. Revealing it locks the roster: no one else can join.
- **US-1.4:** As a `Public view`, I want to see who has joined the match.

### Epic 2: Immunity bid

- **US-2.1:** As an `Active player`, I want to see the revealed prompt so that I can choose how many influence tokens to bid when the clock starts.
- **US-2.2:** As an `Facilitator`, I want to start the bidding clock and add 30 seconds or close it early if I want to.
- **US-2.3:** As an `Active player`, I want the tokens I left selected to be spent when the 3 minutes close so that the bid closes on its own.
- **US-2.4:** As a `Player`, I want to see how much each person spent and who the nominees are so that I know who answers.
- **US-2.5:** As a `Public view`, after the bids are revealed, I want to see the current prompt, how much each person spent and who the nominees are so that I know who answers. During the bid itself I only see the clock and the phase instructions.

### Epic 3: Spoken prompt

- **US-3.1:** As a `Nominee`, I want to see the prompt again and a 30-second prep so that I can organize my answer.
- **US-3.2:** As a `Player`, I want to see whose turn it is, starting with the nominee of lower rank, and a strict minute per person so that the time is respected.
- **US-3.3:** As a `Public view`, I want to see whose turn it is, starting with the nominee of lower rank, and a strict minute per person so that the time is respected.

### Epic 4: Vote

- **US-4.1:** As a `Facilitator`, I want to assign 5 tokens publicly among the nominees, or skip that step, so that I can tilt the vote before the players vote.
- **US-4.2:** As an `Facilitator`, I want to start the voting clock and add 30 seconds or close it early if I want to.
- **US-4.3:** As a `Player`, I want to receive my special token for that round and allocate influence and special tokens among the nominees over 3 minutes, without seeing other people's votes, so that I can decide who leaves.
- **US-4.4:** As a `Player`, I want to put more than one token on the same nominee so that I can concentrate my vote and to be able to change my allocation before the clock finishes.
- **US-4.5:** As a `Player`, I want an unused special token to be lost at the close so that it does not pile up outside the vote.
- **US-4.6:** As a `Player`, I want to see the totals, who was fired, who survived, where the rank landed, and which tokens were returned or awarded so that I can read the round's result.
- **US-4.7:** As a `Public view`, after the vote is revealed, I want to see the totals, who was fired, who survived, where the rank landed, and which tokens were returned or awarded so that I can read the round's result. During the vote itself I only see the clock and the phase instructions.

### Epic 5: Fired players

- **US-5.1:** As a `Fired player`, I want to keep all of my tokens but lose my rank (adjusting the rank accordingly).
- **US-5.2:** As a `Fired player`, I want to keep entering the vote so that I can vote as a star voter.
- **US-5.3:** As a `Fired player`, I want to receive 3 special tokens per round, usable only for voting (and lost if not allocated this round), so that I can keep influencing without returning to the bid.

### Epic 6: Endgame

- **US-6.1:** As a `Facilitator`, when 2 active players remain, I want them declared winners alongside the fired players with the most permanent tokens, using the winner count in section 4.8. The fired winners do not play another prompt.
- **US-6.2:** As a `Player` I want to see the winners of the game, highlighting if I'm one of them.
- **US-6.3:** As a `Public view` I want to see the winners of the game.

## 10. Out of scope for v1
- A finished match report. History is in scope. The report download is a placeholder.
- Social login (OAuth).
