# Music

`roundtrip.mp3` is "roundtrip (Remastered)", 64 s. The game starts it on PRESS START, loops
it, and slows it to a stop (tape-stop) whenever she roundtrips. Sound effects are
synthesised in the browser and need no files.

If the file is missing, the game still runs, just without music.

## Swapping the track

Replace `roundtrip.mp3` with the new file under the same name. nginx tells browsers to
cache audio for 7 days, so returning players may hear the old version for up to a week.
To force the update, give the new file a new name (e.g. `roundtrip-v2.mp3`) and change
`MUSIC_SRC` at the top of `public/js/audio.js` to match.
