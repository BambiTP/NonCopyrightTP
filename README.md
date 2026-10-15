# NonCopyrightTP

A self-hosted TagPro-style game server (groups, joiner, ranked queue, replays, Box2D game engine)
with no Koalabeast-owned code or art.

Split from `tagpro-local`, which served the real TagPro client. Removed here: the Koalabeast
client bundles and page templates, their UI art, event art, help images, and the stock
"Classic" / "TagPro Next Classic" textures.

Kept: the server (`server/`), engine (`engine/`), tools, community-made texture packs
(`public/textures/`), Fortunate Maps maps, sounds, and openly licensed vendor files
(Bootstrap, Font Awesome, socket.io client).

**Status:** the server still expects a client at the old paths. A new, original client is
being written; until then the game pages won't load.
