# The Lost Eden Archive

The museum exhibition uses existing Break Thy Rule artwork, garment photographs,
library covers, and the supplied Daily Apple PDF. It imports no new stock or
generated imagery. The six principal installations are The Last Orchard, Saints
of Los Angeles, The Procession, Portrait of Nobody, The Forbidden Atlas, and
After the Garden. These are new arrangements of existing source material;
original files and source credits remain available through the reader.

The Daily Apple has 56 pages. The complete issue is available in the page reader,
with the byte-identical PDF downloaded only when explicitly opened. Eight
architectural extracts retain their printed captions. The catalog records page
numbers, hashes, and original source records; it does not imply all historical
photographs were created by Break Thy Rule.

`museum-exhibition.js` replaces the repeating wall slots, supplies nearby-only
image loading (three simultaneous requests, 23 m entry / 32 m eviction), and
disposes downloaded textures on departure. Image requests time out after 18
seconds and can retry after 12 seconds. Effects run only on up to three nearby
installations, stop while dialogs are open or the page is hidden, and respect
reduced motion and the visitor's motion toggle.

The Seed, Witness, and Horizon seals are saved locally in this browser. Finding
all three opens a painting into the walkable Reading Garden. Its return frame
leads back to the newspaper corridor. This is a local museum discovery, not an
account achievement or shared multiplayer quest.

Keyboard: E opens a nearby artwork, Escape closes the native dialog, and the
Exhibition guide offers Visit and Sources controls. Mouse and touch clicks work
as well. The reader supports page selection, fit width, actual size and links to
original sources.

Validated: all 56 newspaper pages; seven existing sculptures; legacy wall-art
replacement; three seals and both portal directions; room collision; source
reader and keyboard interaction in the full showroom; mobile reading; reduced
motion; and texture eviction when leaving the museum.
