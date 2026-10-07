# Music

Put the song here as `roundtrip.mp3`. The game starts it on PRESS START, loops it,
and slows it to a stop (tape-stop) whenever she roundtrips.

If the file is missing, the game still runs, just without music. Sound effects are
synthesised in the browser and need no files.

Audio files are git-ignored so the track isn't published with the code. Copy it to the
VM once (`scp roundtrip.mp3 you@vm:/opt/roundtrip/public/audio/`) and `git pull`
updates will leave it alone.
