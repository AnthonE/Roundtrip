# ROUNDTRIP: game design, v2

Built from @Brooklyn's pitch (Oct 7, 2026). Everything in the original pitch is in the
game. This doc covers what it plays like now, the questions the pitch left open and how
they were answered, and the few additions that make the metaphor play out literally.

## The pitch

A tiny pixel girl runs on a spinning globe, jumping for coins and trying not to roundtrip.
It's a quick, cute browser game based on the song "roundtrip" by bubblegum, about the rush
and crash of trading memecoins.

The globe is the market, the coins are pumps, and every jump is a trade. You leave the
ground, the world keeps turning, and you either land richer or get spun back to zero. The
way out isn't more coins. It's self-care (milk, gummies, sunshine), which makes her big
enough to leap off the globe to the moon.

## What changed from the pitch, and why

1. **Unrealized vs. banked.** Coins collected during a level are *unrealized* and shown in
   green as `+320 UNREALIZED`. Reaching the moon *takes profit* and moves them to `BANKED`.
   A roundtrip gives back everything unbanked, and the card says exactly how much: "YOU GAVE
   BACK +320". This is the song's story in one number. Only banked score reaches the
   leaderboard.
2. **Every jump is a trade, and greed costs ground.** On the ground she runs a little faster
   than the spin and works back to the top. In the air the spin drags her backward. One
   good jump is cheap; jumping at everything walks her down the globe's shoulder until she
   slips.
3. **"Lag" is tied to what the player does, never random.** (This answers the pitch's open
   question.) A jump that collects nothing is a bad trade: the screen tears, a neon
   "LAG!" pops, she gets shoved backward and her streak resets. Random lag would feel
   unfair, and a bad trade is exactly what lag should mean here.
4. **Self-care makes her resilient, not just big.** Each item scales her up a step (as
   pitched) and also cuts how far she drifts in the air by 11%. Five items fill the meter,
   the moon rises, and her next jump is the leap. Self-care is literally what keeps her
   on her feet.
5. **Streak multiplier.** Consecutive productive jumps raise coin value from x1 to x5.
   Overtrading still tempts you; lag resets it.
6. **Red candles** (level 2 and up) sit on the surface. Touching one knocks her back
   ("DUMP!"). Hopping one counts as a productive jump. They give jumping a purpose beyond
   greed and cost one tiny sprite.
7. **Endless levels.** The spin rises 15% per level (capped). She starts small each level.
   One run = one life, so the leaderboard means something.
8. **One button, two jumps.** Tap to hop, hold for a high jump, the same on phone and
   desktop.
9. **Glitches that are safe to look at.** Tears, neon stripes, RGB ghosts and static, but
   never a full-screen flash. `prefers-reduced-motion` cuts them to about a third, with no
   static.
10. **Small kindnesses.** The nickname is remembered. Share uses the phone's share sheet
    (or copies a link). The game pauses when the tab is hidden. The song does a tape-stop
    when you roundtrip. It can be added to the home screen and has a preview image for links.

## Core loop

1. The globe spins left at a constant speed for the level. She runs right, against it.
2. Coins and items ride on the globe and come over the right horizon toward her.
3. Time a jump (tap or hold) to meet them. Each jump drags her back a little.
4. Grab self-care items to grow. Avoid empty jumps and red candles.
5. Five items: the moon rises. Jump to it and bank the level.
6. Enter a nickname, see the board, and start the next level spinning faster.

## Mechanics

| Mechanic | How it works |
| --- | --- |
| Spin | Constant within a level. 0.45 rad/s at level 1 (about 36 px/s at the surface), ×1.15 per level, capped at 2.0. |
| Running | Automatic. On the ground she recovers toward the top at 0.32 rad/s (scaled with spin). |
| Jumping | Tap: about 21 px hop, 0.43 s in the air. Hold: about 42 px, 0.8 s. Heights scale with her size. |
| Air drag | 0.16 rad/s backward while airborne (scaled with spin), minus 11% per self-care item. |
| Gold coins | Patterns: ground row (free if you just run), hop row, high row, arcs, stairs. 10 × streak multiplier. |
| Lag | An empty jump knocks her back 0.15 rad and resets the streak, with a short glitch. |
| Red candles | From level 2. Knock back 0.25 rad, reset the streak, brief invulnerability. |
| Slipping | Past 0.7 rad behind the top: "SLIPPING!" warning, beeps, flicker. Past 1.05 rad: roundtrip. |
| Roundtrip | Heavy glitch (stutter, tears, ghosts, static); she falls flat, gets carried around the globe lying down, peels off into the void. Music tape-stops. |
| Self-care | Milk, gummy bear, sunshine. One spawns every 5.5–7.5 s at a random height. Each one: +50, ×1.25 size, −11% air drag. |
| Growth | Same sprite, scaled. Coins and items spawned afterwards scale with her. The globe never changes size. |
| Moon | Rises after the fifth item. The next jump leaps along an arc to land on it, with a sparkle trail. |
| Levels | Endless. The spin rises; red candles get more frequent. |
| Leaderboard | Best banked total per nickname. Your row is highlighted; your rank shows even outside the top 10. |

## The six screens

Same globe, same size, in every screen. Glitches only appear on the four gameplay screens;
the two posters are calm and static.

1. **Press start.** Static poster. The logo has the album art's neon green and purple
   stripes, "a game for the song by bubblegum", small her on the globe, a blinking PRESS
   START, and a two-line how-to.
2. **Grab the coin.** Gameplay with HUD: banked, unrealized, multiplier, self-care meter,
   level.
3. **Roundtrip.** The full glitch-and-fall sequence, then a card with what you gave back,
   your banked total, TRY AGAIN, SAVE SCORE (if not saved yet), SHARE and LEADERBOARD.
4. **Self-care power-up.** Hit-stop, classic grow-flicker between sizes, sparkles, a chiptune
   arpeggio, "MILK!" / "GUMMIES!" / "SUNSHINE!".
5. **Leap to the moon.** She arcs up to the moon, lands, and the gains count into BANKED:
   "LEVEL COMPLETE · YOU TOOK PROFIT".
6. **Write your nickname.** Static poster with a real text field (so phone keyboards work)
   and the top 10. Once named, later level-ups skip the typing and just show your rank.

## Feel: feedback for every moment

| Moment | Sound | Visual | Phone buzz* |
| --- | --- | --- | --- |
| Jump | hop blip; a second whoosh once you're holding for a high jump | dust puff, stretch, sparkles on high jumps | |
| Land | soft thud | dust, squash | |
| Coin | blip that climbs with the multiplier and again with every coin in one jump | "+10", sparkle, coin flies into the score, which flashes | |
| Streak up | two-note ding | "x3" pop; "MAX x5!" in rainbow with confetti at x5 | short |
| Self-care | arpeggio | hit-stop, grow flicker, shockwave rings, meter pip pops | short |
| Lag (empty jump) | glitch noise, and the song itself stumbles | tear, RGB ghost on her, shake, "LAG!" | short |
| Red candle hit | crunch, song stumbles | hit-stop, glitch, ghost, shake, "DUMP!" | medium |
| Candle dodged | swish | "DODGED", sparkles | |
| Slipping | heartbeat beeps that speed up; the song goes muffled | red pulsing edge, "SLIPPING!", flicker | |
| Moon ready | chime | moon rises with a halo and twinkles, "JUMP TO THE MOON!" | short |
| Leap / land on moon | rising sweep, fanfare | sparkle trail, dust, ring, shake | double |
| Banking | ticks while counting, "ka-ching" at the end | count-up, number flash, coin burst | |
| Roundtrip | crash, tape-stop, a falling whistle into the void, sad jingle on the card | heavy glitch, fall, carried, dissolve into static | long |
| Leaderboard rank | jingle (#1 gets a fanfare) | confetti, ring for the top 3 | |
| Level start / screen change | ready jingle | banner drops in; pixel dither dissolve between screens | |

\* Android only (iPhones have no vibration API). Haptics follow the mute switch.

## Character and look

As pitched: her blonde hair full of colourful clips, big brown eye, pointy ear with a
dangly earring, grey-blue overalls with a red badge, white sneakers, and the pink and purple
toy mic. Big head, small body, side profile. One sprite in every screen; only the size
changes.

All art is drawn in code as pixel grids (`public/js/sprites.js`), so there are no image
files to manage, and changing a clip colour is a one-character edit. The globe is a real
orthographic Earth (Atlantic, Europe, Africa facing you), with dithered lighting from the
top-left, tiny cities on the face, and trees, houses and skylines around the rim. The sky
has the album art's starry navy, faint grid, pixel butterfly nebula and pastel rainbow clouds.

## Scoring

| | Points |
| --- | --- |
| Coin | 10 × multiplier (x1–x5) |
| Self-care item | 50 |
| Level bonus (on banking) | 100 × level |

Unrealized = coins + items this level. Banked = everything you've taken to the moon.

## Leaderboard and fair play

The server can't watch you play, so it checks that each banked level was *possible*:

- Levels arrive in order, once each (also enforced by a unique index in Mongo).
- All five items are reported.
- At least 90% of the fastest possible level time has passed on the server's clock since
  the previous level. Items spawn on a timer, so a level can't be faster than about 26 s.
- Coins don't exceed what the spawner could have produced in that time, and the score
  doesn't exceed coins × 10 × 5 + items × 50 + level bonus.
- Rate limits per IP (in Node, and again in nginx). JSON-only bodies with an origin check,
  so other sites can't post scores.

This stops casual cheating, not a determined one: someone can still script a plausible
fake run in real time. A future version could record jump timestamps with a seeded level
and replay them on the server. Nicknames are not accounts; the board keeps the best
score per nickname.

## Answers to the pitch's open questions

- **How should lag trigger a roundtrip?** Tied to the player: empty jumps cause lag, lag
  pushes you back, and enough of it (plus greedy jumping and red candles) slides you off.
  Never random.
- **Timeline and cost?** v1 is built: playable on phone and desktop, all six screens, endless
  levels, score and leaderboard, the song, and a deploy kit for your own VM. What's
  left is content, not code: a final pass on the sprite against the concept art, and
  the subdomain.

## Tuning table

All in `public/js/config.js` and `public/js/rules.js`.

| Knob | Value | Effect |
| --- | --- | --- |
| `BASE_SPIN` / `SPIN_GROWTH` | 0.45 / 1.15 | Pace of level 1, and how fast it ramps |
| `ITEMS_PER_LEVEL` | 5 | Level length (about 35–45 s) |
| `ITEM_INTERVAL_*` | 5.5–7.5 s | How often self-care appears |
| `PLAYER.recover` | 0.32 | How forgiving the ground is |
| `PLAYER.airDrift` | 0.16 | The cost of each jump |
| `PLAYER.lagKnock` | 0.15 | The cost of an empty jump |
| `PLAYER.edge` | 1.05 | How far down the shoulder before she slips |
| `PLAYER.resiliencePerItem` | 0.11 | How much self-care steadies her |
| `SPAWN.candleLevel` | 2 | First level with red candles |

## Ideas for later

- Daily seed: the same globe for everyone each day, with its own board.
- Weekly seasons (the board is already one Redis key; Mongo keeps history).
- Server-side replay verification (see fair play above).
- A "diamond hands" achievement for banking with zero lag in a level.
- Alternate outfits unlocked by level (same sprite, palette swaps).
