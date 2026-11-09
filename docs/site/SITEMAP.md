# Break Thy Rule — public site map

The standard website is now the top layer at `/`. The 3D Garden of Eden showroom moved from `/` to
`/showroom` (`showroom.html`). It is unchanged apart from its title, and every page links to it.

```
/                     Products: hero garment spinning in 3D, the full collection as rotating 3D cards, chapter filter
├── /product?item=…   One garment: drag/turn/zoom 3D viewer, photos, story, buy link, discussion thread
├── /gallery          Real-life images: garments, models, worn by you, events, Instagram. Lightbox. "Share your fit" board
├── /archive          Topics (Symbols, Scripture, Hidden History…), Ask the Librarian, shelf, garments per topic, discussion per topic
├── /community        Forum boards (General, Fits, Readings, Drops & events), live garden, member wall, Broadcast Room, house rules
└── /showroom         The 3D world (garden, museum, library, night district, multiplayer)
    ├── /broadcast.html   back link now returns to /showroom
    └── /shirt-study.html back link now returns to /showroom
```

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `product.html`, `gallery.html`, `archive.html`, `community.html` | The pages |
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

## Next steps

- Real 3D spin captures: drop new GLBs into `models/` and `rack-models/` and add or update entries in `garment-catalog.js`.
  The site and the showroom both pick them up.
- Checkout: the Buy button links to `breakthyrule-co.netlify.app` for now. Swap it for per-product cart links.
- One sign-in for Circle and the showroom's multiplayer accounts (Circle SSO/headless API).
- Events/drops calendar on the Community page.
