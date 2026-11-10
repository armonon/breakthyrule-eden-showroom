# Break Thy Rule — public site map

The standard website is now the top layer at `/`. The 3D Garden of Eden showroom moved from `/` to
`/showroom` (`showroom.html`). It is unchanged apart from its title, and every page links to it.

```
/                     Products: hero garment spinning in 3D, the full collection as rotating 3D cards, chapter filter
├── /product?item=…   One garment: drag/turn/zoom 3D viewer, photos, story, buy link, discussion thread
├── /gallery          Real-life images: garments, models, worn by you, events, Instagram. Lightbox. "Share your fit" board
├── /archive          Topics (Symbols, Scripture, Hidden History…), Ask the Librarian, shelf, garments per topic, discussion per topic
├── /lab              The Garment Lab: build a garment, Relic Box, Trinity, cart and checkout (docs/lab/README.md)
├── /reliquary        Finished one-of-ones; /passport?id=… for each piece (QR)
├── /lab-admin        The studio dashboard (staff only)
└── /showroom         The 3D world (garden, museum, library, night district, multiplayer)
    ├── /broadcast.html   back link now returns to /showroom
    └── /shirt-study.html back link now returns to /showroom
```

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `product.html`, `gallery.html`, `archive.html` | The pages (the Community page was removed; `/community` redirects to `/`) |
| `site/site.css` | Shared styles. Same palette and type as the showroom (ink `#202020`, red `#753a36`, Barlow Condensed + DM Sans) |
| `site/site.js` | Header tabs, footer, discussion board (Circle embed or local preview) |
| `site/garment-stage.js` | 3D garments. One hidden WebGL renderer draws every visible card, so 39 spinning garments use one GPU context. Loads the same GLBs as the showroom (`rack-models/` for cards, `models/` for the product viewer) |
| `site/config.js` | Circle community URL and spaces, Instagram link, Librarian app URL |
| `site/data/gallery.json` | Gallery image list. Generated, do not edit by hand |
| `site/data/topics.json` | Archive topics: book tags, collection chapters, Librarian search seed, optional Circle space |
| `site/gallery/<category>/` | Drop folders for new photos: `garments`, `models`, `worn`, `events`, `instagram` |
| `tools/site/build-gallery.mjs` | Rebuilds `gallery.json` from the drop folders, an Instagram export, and `products/web/` |

Reused from the showroom: `garment-catalog.js` (39 garments, names, prices, chapters, models), `asset-loader.js`,
`assets/three.min.js` (Three.js r187 with the meshopt/KTX2 GLTF loader), `books.js`, `librarian-engine.js`,
`librarian-client.js`, `assets/broadcast/channels.json`, the logo, the hero art and the Librarian portrait.

## Adding gallery images

1. Put photos in `site/gallery/models/`, `site/gallery/worn/`, `site/gallery/events/` or `site/gallery/garments/`.
   Add a caption by creating a `.txt` file with the same name next to a photo.
2. Run `node tools/site/build-gallery.mjs`.

A category's filter chip shows up once it has photos. Until then the page lists it under "coming soon".

### Instagram

Instagram only shows a login wall to automated requests, so the images can't be pulled from
`instagram.com/breakthyrule` without signing in. As the account owner, use Instagram's own export:

1. Instagram → Settings → Accounts Center → Your information and permissions → Download your information →
   choose @breakthyrule, **JSON** format, media included.
2. Unzip it, then run `node tools/site/build-gallery.mjs --instagram-export /path/to/the/unzipped/folder`.

This copies every post photo into `site/gallery/instagram/`, keeping the caption and date. To keep the gallery updating
automatically later, the next step is the Instagram Graph API, which needs a Business/Creator account and a Meta app token.

## Circle (forum, comments, image sharing)

Every discussion area uses `siteDiscussion()`. With `site/config.js → circle.community` empty it shows a **preview board**:
posts and images are saved only in that visitor's browser, and a banner says so. To go live:

1. In Circle, create spaces, e.g. `forum`, `fits`, `archive`, plus one per archive topic if you want them.
2. In Circle settings, allow embedding on the site's domain.
3. Fill in `site/config.js`:
   ```js
   circle:{community:'https://breakthyrule.circle.so',spaces:{forum:'c/forum',gallery:'c/fits',archive:'c/archive',topics:{symbols:'c/symbols'}}}
   ```
   Each area then embeds `community/space?iframe=true`. Circle handles accounts, comments, DMs and image uploads.

## Merged from the codex cover (Break Thy Rule assets)

- **Logo**: `assets/brand/logo.webp` (BreakThyRule / anonymous archive) replaces the text wordmark in the site header,
  the footer, the Archive page head and the showroom header. On the night pages (Archive, Community) it sits on a paper
  label. Rebuild it with `swift tools/assets/build-logo.swift assets/brand/logo-source-photo.jpg assets/brand`.
- **Cover** (`breakthyrule-cover.js/.css`): the sticker-bombed cover of all graphics. It greets a visitor on `/` once per
  visit (sessionStorage); the yellow CODEX button in the header reopens it on any page; `/?cover` forces it, `?nocover`
  skips it. Its buttons: Enter, Shop (scrolls to the collection), Gallery, Archive, About (an About panel).
- **Home**: a running rubric of graphic names under the hero, "The codex, pasted up" (a draggable sticker board with the
  advert strips as rails) and a strip of worn photos as polaroids (`site/stickers.js`).
- **Archive**: information and discussion only — titled "The anonymous archive", with the logo plaque, the topics, the
  Librarian (its picture is the house apple, `images/breakthyrule/graphics/full/app.webp`), the shelf and the discussion.
  No garments, graphics index or stickers on this page.
- **Gallery**: real-life photography only — garment photos and people wearing them (Worn: 15 of the favourite photos;
  artwork and collages are listed in `NOT_PHOTOS` in `tools/site/build-gallery.mjs`). Graphics and adverts are not in the
  gallery; they live on the home page and in the codex cover. Link to a set with `/gallery?filter=worn`.
- **Home background** (`site/backdrop.js`): cut-out graphics printed faintly into the paper, drifting upward, leaning with
  the pointer and scroll; every few seconds one blooms into full colour. Still for reduced-motion visitors.
- **Product pages**: the discussion was replaced by a "From the gallery" strip — the piece's own photos first, then worn
  photos, then other garments; click to open full size.
- **Codex polish** (`site/folios.css`): folio heads and drop caps on Gallery/Archive, numbered plates with
  corner rules in the gallery, a reading-stand lightbox, the Archive table of contents with roman numerals and leader
  dots, the Librarian's desk, numbered shelf plates, posts as marginal notes.

### Adding to the Break Thy Rule assets

The source folder is `~/Downloads/breakthyrule` (`GRAPHICS/`, `favs gallery/`, `ADVERTS/`). After adding files:

1. `node tools/assets/import-breakthyrule.mjs` (add `--redo favs` to re-encode a set). Phone photos are turned upright.
2. `node tools/site/build-gallery.mjs`

## Garment Lab and showroom changes (branch claude/garment-lab)

- Commerce: see docs/lab/README.md for pages, prices, code, environment variables and the activation checklist.
- Home hero: the colour collage (assets/colour-collage-0524.jpg) drifts behind the hero as a living wall; the copy
  sits on a taped paper card.
- The graphic strip runs under the header on every site page and inside the 3D showroom header (site/graphic-strip.js).
- 3D showroom: the Gilded Sentinel and the Azure Oracle statues were removed (eden-secrets.js); the arena door has a
  lit "THE ARENA" sign, a glowing frame and arrows on the ground (eden-skybox.js); a GARMENT LAB link in the header.
- Drafts: tools/deploy-netlify-draft.sh publishes a draft preview with the redirects, headers and the Lab function.

## Next steps

- Real 3D spin captures: drop new GLBs into `models/` and `rack-models/` and add or update entries in `garment-catalog.js`.
  The site and the showroom both pick them up.
- Checkout: the Buy button links to `breakthyrule-co.netlify.app` for now. Swap it for per-product cart links.
- One sign-in for Circle and the showroom's multiplayer accounts (Circle SSO/headless API).
- Events/drops calendar on the Community page.
