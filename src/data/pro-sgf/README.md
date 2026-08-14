# Public-domain pro-game corpus

SGF records browsed by the **Pro Game Database** (`ProGamesModal`).

## Provenance & licensing

These are classic historical game records — Edo-period and 19th-century
Japanese games (the **Shusaku** and **Dosaku** collections) — sourced from
Andries Brouwer's public Go game archive
(<https://homepages.cwi.nl/~aeb/go/games/>). The games themselves are
centuries old and in the **public domain**; a game record (the sequence of
moves) is a factual record, not a copyrightable work.

## Adding more games

Drop additional `.sgf` files anywhere under this folder. They are discovered
automatically via `import.meta.glob` in `../proGameCorpus.ts` — no code
changes needed. Player, event, date, and result are read from the SGF headers
(`PB`, `PW`, `EV`, `DT`, `RE`), which drive the player-profile and
opening-explorer views.

Unlike the curated games in `../sgf/`, files here are **not** auto-seeded into
the user's library; they only populate the read-only database browser.
