#!/usr/bin/env python3
"""Offline extraction of the supplied Daily Apple PDF; never modifies the PDF.

Requires locally installed PyMuPDF and Pillow. Run with python3 (system runtime).
All permanent outputs stay in assets/lost-eden/daily-apple; intermediates use
/private/tmp. URLs in the PDF are recorded as evidence and are never fetched.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import shutil
import tempfile

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/lost-eden/daily-apple"
BASE_URL = "assets/lost-eden/daily-apple/"
SOURCE = Path("The Daily Apple - American Worlds Fairs - Architecture and Landscapes.pdf")
SOURCE_HASH = "99386c03fb1767f5771cd5f57924a66b463be1cc1c7e11b53bd61bea6e272a14"
MAX_EDGE = 1600
RASTER_BUDGET = 10_000_000

# Reviewed rectangular extracts, in PDF points, top-left origin. The rectangles
# include the original photograph, THEN/LATER VIEW, caption, date and credit label.
# Nothing is repainted, reconstructed, recolored, sharpened or generated.
SELECTIONS = [
    (4, "memorial-hall", (32, 297, 353, 625), 1, "1876-philadelphia-H001",
     "Memorial Hall at the Centennial Exposition", "Dome, arched bays and a complete facade; paired comparison on the full page."),
    (13, "court-of-honor", (32, 311, 353, 630), 1, "1893-chicago-H001",
     "Court of Honor and its architectural ensemble", "Water axis, statuary and facing facades; wider park comparison on the full page."),
    (22, "japanese-garden", (367, 297, 688, 556), 2, "1901-buffalo-N002",
     "The same building and later Japanese Garden", "Garden, water reflection and building frontage; retains LATER VIEW and the 2022 date."),
    (26, "grand-basin", (32, 297, 353, 588), 1, "1904-st-louis-H014",
     "Grand Basin from North", "Basin, boat and axial landscape; full page retains the later-view comparison."),
    (33, "grand-stairway", (367, 594, 688, 859), 4, "1905-portland-H017",
     "Construction of the Grand Stairway in Centennial Park", "Terraced stairway, lawns and surrounding facades; retains the source's date uncertainty."),
    (40, "agriculture-european-buildings", (32, 311, 353, 566), 1, "1909-seattle-H014",
     "Agriculture and European Buildings", "Colonnaded buildings and basin edge; the full page preserves the later-campus comparison."),
    (42, "agriculture-building-porch", (32, 234, 600, 898), 1, "1909-seattle-H023",
     "Agriculture Building porch", "Large porch detail with columns, steps and planting. The embedded photograph is only 409 by 512 pixels."),
    (45, "palace-of-fine-arts", (367, 311, 688, 558), 2, "1915-san-francisco-N001",
     "Palace of Fine Arts: later daylight view", "Rotunda, colonnade and lagoon; retains LATER VIEW and the August 2003 date."),
]
SELECTED_PAGES = [s[0] for s in SELECTIONS]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean(text):
    # The PDF has missing glyphs. Mark them, never silently invent characters.
    return " ".join(text.replace("\x00", "\ufffd").split())


def excerpt(text):
    text = clean(text)
    return text if len(text) <= 300 else text[:297].rsplit(" ", 1)[0] + "..."


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_record(path):
    result = {"url": BASE_URL + path.relative_to(OUT).as_posix(),
              "bytes": path.stat().st_size, "sha256": sha(path)}
    if path.suffix in (".webp", ".jpg"):
        with Image.open(path) as im:
            result.update(width=im.width, height=im.height)
    return result


def render(page, target, clip=None):
    rect = fitz.Rect(clip) if clip else page.rect
    scale = MAX_EDGE / max(rect.width, rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect,
                          colorspace=fitz.csRGB, alpha=False, annots=True)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    # The renderer rounds the clipped device rectangle outwards by up to a pixel.
    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    im.save(target)


def contact(paths, target, cols, cell_width, cell_height, labels):
    canvas = Image.new("RGB", (cols * cell_width, math.ceil(len(paths) / cols) * cell_height), "#e3e0d9")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    for i, (path, label) in enumerate(zip(paths, labels)):
        x, y = (i % cols) * cell_width, (i // cols) * cell_height
        draw.text((x + 10, y + 5), label, font=font, fill="#242321")
        with Image.open(path) as original:
            thumb = original.copy()
        thumb.thumbnail((cell_width - 16, cell_height - 36), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (x + (cell_width - thumb.width) // 2, y + 29))
    canvas.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    canvas.save(target)


def page_inventory(page):
    blocks = page.get_text("dict")["blocks"]
    text_blocks = [{"bbox": list(b["bbox"]), "text": "\n".join(
        "".join(span["text"] for span in line["spans"]) for line in b["lines"])}
        for b in blocks if b["type"] == 0]
    images = [{"bbox": list(b["bbox"]), "width": b["width"], "height": b["height"],
               "format": b["ext"], "embedded_bytes_sha256": hashlib.sha256(b["image"]).hexdigest()}
              for b in blocks if b["type"] == 1]
    links = [{"bbox": list(link["from"]), "url_as_supplied": link["uri"]}
             for link in page.get_links() if link.get("uri")]
    return {"source_page": page.number + 1, "width_pt": page.rect.width,
            "height_pt": page.rect.height, "rotation": page.rotation,
            "raw_text": page.get_text(sort=False), "text_blocks": text_blocks,
            "images": images, "links": links}


def source_records(inventory):
    records = []
    for page in inventory:
        for block in page["text_blocks"]:
            match = re.match(r"(\d{4}-[\w-]+) / p\. ([\d, ]+)\n", block["text"])
            if not match:
                continue
            rect = fitz.Rect(block["bbox"])
            image_pages = [int(n.strip()) for n in match[2].split(",")]
            records.append({"id": match[1], "image_page": image_pages[0], "image_pages": image_pages,
                "source_record_page": page["source_page"], "text_as_supplied": block["text"],
                "urls_as_supplied": [l["url_as_supplied"] for l in page["links"] if rect.intersects(fitz.Rect(l["bbox"]))]})
    return records


def page_title(page):
    blocks = page["text_blocks"]
    # Comparison subheadings are already concise and specific in this PDF.
    candidates = [b for b in blocks if 230 < b["bbox"][1] < 240] if page["source_page"] in (4, 13, 16, 22, 26, 40, 45) else []
    if candidates:
        return clean(candidates[0]["text"])
    if page["source_page"] == 42:
        return "Agriculture Building porch"
    headings = [b for b in blocks if 110 < b["bbox"][1] < 160]
    if headings and page["source_page"] not in range(50, 56):
        return clean(headings[0]["text"])
    return clean(next(b["text"].split("\n")[0] for b in blocks if 90 < b["bbox"][1] < 100))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--reuse-rasters", action="store_true",
                        help="Refresh catalog/text only after validating existing raster hashes and crop coordinates.")
    parser.add_argument("--existing-quality", type=int, choices=range(1, 101),
                        help="Recover a completed raster pass whose catalog was interrupted; supply its recorded quality.")
    args = parser.parse_args()
    if sha(args.source) != SOURCE_HASH:
        raise SystemExit("Source hash changed; reviewed crop coordinates require the original supplied PDF.")
    previous = None
    if args.reuse_rasters:
        if (OUT / "catalog.json").exists():
            previous = json.loads((OUT / "catalog.json").read_text())
        elif args.existing_quality:
            raster_paths = sorted(OUT.rglob("*.webp")) + sorted(OUT.rglob("*.jpg"))
            assert len(raster_paths) == 71, "Recovery requires all 64 WebPs and 7 contact JPGs."
            for path in raster_paths:
                with Image.open(path) as im:
                    im.load()
                    assert max(im.size) <= MAX_EDGE
            previous = {"source": {"sha256": SOURCE_HASH},
                "encoding": {"max_long_edge_px": MAX_EDGE, "webp_quality": args.existing_quality,
                    "quality_attempts": [{"quality": args.existing_quality, "bytes": sum(p.stat().st_size for p in raster_paths)}]},
                "pages": [file_record(OUT / f"pages/page-{n:03d}.webp") for n in range(1, 57)],
                "highlights": [{**file_record(OUT / f"highlights/p{s[0]:03d}-{s[1]}.webp"), "crop_bbox_pt": list(s[2])} for s in SELECTIONS],
                "contact_sheets": [file_record(p) for p in sorted((OUT / "contact-sheets").glob("*.jpg"))],
                "preview": file_record(OUT / "preview-contact.jpg"),
                "highlight_preview": file_record(OUT / "preview-highlights.jpg")}
        else:
            raise SystemExit("No catalog to validate. Use a normal rebuild or supply --existing-quality for a completed raster pass.")
        assert previous["source"]["sha256"] == SOURCE_HASH
        assert previous["encoding"]["max_long_edge_px"] == MAX_EDGE
        assert [h["crop_bbox_pt"] for h in previous["highlights"]] == [list(s[2]) for s in SELECTIONS]
        for asset in previous["pages"] + previous["highlights"] + previous["contact_sheets"] + [previous["preview"], previous["highlight_preview"]]:
            path = ROOT / asset["url"]
            assert path.resolve().is_relative_to(OUT.resolve())
            assert sha(path) == asset["sha256"]
    OUT.mkdir(parents=True, exist_ok=True)
    for folder in ("pages", "highlights", "contact-sheets", "source"):
        (OUT / folder).mkdir(exist_ok=True)
    original = OUT / "source/the-daily-apple.pdf"
    shutil.copyfile(args.source, original)
    assert sha(original) == SOURCE_HASH

    with fitz.open(args.source) as doc, tempfile.TemporaryDirectory(prefix="daily-apple-build-", dir="/private/tmp") as tmp:
        temp = Path(tmp)
        assert len(doc) == 56
        inventory = [page_inventory(p) for p in doc]
        records = source_records(inventory)
        lookup = {r["id"]: r for r in records}
        assert len(records) == len(lookup) == 133
        missing_glyphs = sum(p["raw_text"].count("\x00") for p in inventory)
        inventory_path = OUT / "inventory.json"
        write_json(inventory_path, {"source_sha256": SOURCE_HASH, "metadata": doc.metadata,
                   "page_count": len(doc), "raw_text_missing_glyph_count": missing_glyphs,
                   "pages": inventory})
        text_path = OUT / "source-text.txt"
        text_path.write_text("\n\n".join(f"=== PDF PAGE {p['source_page']} ===\n" + "\n".join(
                                       b["text"] for b in sorted(p["text_blocks"], key=lambda b: (b["bbox"][1], b["bbox"][0]))).replace("\x00", "\ufffd")
                                       for p in inventory), encoding="utf-8")
        credits_path = OUT / "credits.txt"
        credits_path.write_text(doc.metadata["title"] + "\n" + doc.metadata["author"] +
            "\nSource: user-supplied PDF only. Transcribed credits and links were not independently verified or fetched.\n"
            "Crops retain printed captions; display each crop with its catalog source credit and source-page link.\n\n" +
            "\n\n".join(f"PDF source-record page {r['source_record_page']}\n{r['text_as_supplied']}\n" +
                         "\n".join(r["urls_as_supplied"]) for r in records), encoding="utf-8")
        webp_jobs = []
        page_pngs = []
        for i, page in enumerate(doc, 1):
            png = temp / f"page-{i:03d}.png"
            if not previous:
                render(page, png)
            page_pngs.append(png)
            webp_jobs.append((png, OUT / f"pages/page-{i:03d}.webp"))
            if not previous and i % 14 == 0:
                print(f"Rendered {i}/{len(doc)} pages", flush=True)
        crop_pngs = []
        for number, slug, rect, image_index, source_id, title, reason in SELECTIONS:
            assert title in clean(inventory[number - 1]["raw_text"])
            assert lookup[source_id]["image_page"] == number
            png = temp / f"p{number:03d}-{slug}.png"
            if not previous:
                render(doc[number - 1], png, rect)
            crop_pngs.append(png)
            webp_jobs.append((png, OUT / f"highlights/p{number:03d}-{slug}.webp"))
        jpg_jobs = []
        for start in range(0, len(doc), 12):
            stop = min(start + 12, len(doc))
            name = f"pages-{start + 1:03d}-{stop:03d}"
            png = temp / (name + ".png")
            if not previous:
                contact(page_pngs[start:stop], png, 4, 360, 480,
                        [f"PDF PAGE {n}" for n in range(start + 1, stop + 1)])
            jpg_jobs.append((png, OUT / f"contact-sheets/{name}.jpg"))
        overview = temp / "preview-contact.png"
        if not previous:
            contact(page_pngs, overview, 8, 180, 252, [f"P. {n}" for n in range(1, 57)])
        jpg_jobs.append((overview, OUT / "preview-contact.jpg"))
        highlight_preview = temp / "preview-highlights.png"
        if not previous:
            contact(crop_pngs, highlight_preview, 4, 400, 450, [f"PDF PAGE {n}" for n in SELECTED_PAGES])
        jpg_jobs.append((highlight_preview, OUT / "preview-highlights.jpg"))
        attempts = previous["encoding"]["quality_attempts"] if previous else []
        if previous:
            quality = previous["encoding"]["webp_quality"]
            raster_bytes = sum(dest.stat().st_size for _, dest in webp_jobs + jpg_jobs)
        for quality in (() if previous else (86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 46, 42, 38, 34, 30)):
            for png, dest in webp_jobs:
                with Image.open(png) as im:
                    im.save(dest, "WEBP", quality=quality, method=6)
            for png, dest in jpg_jobs:
                with Image.open(png) as im:
                    im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=0)
            raster_bytes = sum(dest.stat().st_size for _, dest in webp_jobs + jpg_jobs)
            attempts.append({"quality": quality, "bytes": raster_bytes})
            print(f"Raster quality {quality}: {raster_bytes:,} bytes", flush=True)
            if raster_bytes <= RASTER_BUDGET:
                break
        if raster_bytes > RASTER_BUDGET:
            raise RuntimeError("Raster budget not met by quality-only adjustment.")

        pages = []
        for p in inventory:
            n = p["source_page"]
            title = page_title(p)
            assert title in clean(p["raw_text"])
            body = "\n".join(b["text"] for b in p["text_blocks"] if 110 < b["bbox"][1] < 950)
            pages.append({"id": f"page-{n:03d}", "page": n, "source_page": n, "title": title,
                "file": BASE_URL + f"pages/page-{n:03d}.webp",
                "title_origin": "Verbatim source heading or caption; whitespace normalized.",
                "excerpt": excerpt(body), "source_page_width_pt": p["width_pt"],
                "source_page_height_pt": p["height_pt"], "text_characters": len(p["raw_text"]),
                "selected_highlight": n in SELECTED_PAGES,
                "reader_url": BASE_URL + f"source/{original.name}#page={n}",
                "source_record_ids": [r["id"] for r in records if n in r["image_pages"]],
                **file_record(OUT / f"pages/page-{n:03d}.webp")})
        highlights = []
        for number, slug, rect, image_index, source_id, title, reason in SELECTIONS:
            p = inventory[number - 1]
            crop_text = doc[number - 1].get_text(clip=fitz.Rect(rect), sort=True).strip()
            image_info = p["images"][image_index]
            assert fitz.Rect(rect).contains(fitz.Rect(image_info["bbox"]))
            assert title in clean(crop_text) and "Original record / credit & rights" in crop_text
            context = "\n".join(b["text"] for b in p["text_blocks"] if 180 <= b["bbox"][1] < 300)
            highlights.append({"id": f"p{number:03d}-{slug}", "source_page": number, "title": title,
                "excerpt": excerpt(crop_text), "caption_text_as_supplied": crop_text,
                "view_label_as_supplied": "LATER VIEW" if "LATER VIEW" in crop_text else "THEN",
                "page_context_as_supplied": context, "selection_reason": reason,
                "crop_bbox_pt": list(rect), "crop_coordinate_system": "PDF points, top-left origin",
                "embedded_image": image_info, "source_credit": doc.metadata["author"],
                "source_record": lookup[source_id], "source_page_url": pages[number - 1]["url"],
                "reader_url": pages[number - 1]["reader_url"],
                "treatment": "Unretouched rectangular PDF render including original caption, view label, date and credit label; scaled and WebP-encoded only.",
                **file_record(OUT / f"highlights/p{number:03d}-{slug}.webp")})
        catalog = {"schema_version": 1, "title": doc.metadata["title"],
            "pdf": BASE_URL + "source/the-daily-apple.pdf", "page_count": len(doc),
            "source": {**file_record(original), "original_filename": args.source.name,
                "source_path": str(args.source.resolve()), "metadata": doc.metadata,
                "page_count": len(doc), "load_policy": "on-demand", "preload": False},
            "url_base": "Paths are relative to the museum-statues site root, not to catalog.json.",
            "provenance": {"input_scope": "User-supplied PDF only; no network or external research.",
                "historical_verification": "None. Titles, dates, comparisons and attributions are transcribed source statements, not independently established facts.",
                "text_handling": "Raw extraction is in inventory.json. Excerpts normalize whitespace and replace missing NUL glyphs with U+FFFD; no inferred text repair.",
                "source_missing_glyph_count": missing_glyphs,
                "image_handling": "PDF rendering and rectangular clipping only, followed by resizing and lossy encoding. Existing source artifacts are retained.",
                "build_script": "tools/assets/build-daily-apple.py", "build_script_sha256": sha(Path(__file__)),
                "renderer": f"PyMuPDF {fitz.VersionBind}", "pillow_version": Image.__version__},
            "encoding": {"max_long_edge_px": MAX_EDGE, "webp_quality": quality, "webp_method": 6,
                "jpeg_quality": quality, "raster_budget_bytes": RASTER_BUDGET, "raster_bytes": raster_bytes,
                "raster_file_count": len(webp_jobs) + len(jpg_jobs), "quality_attempts": attempts,
                "original_pdf_excluded_from_raster_budget": True},
            "selected_pages": SELECTED_PAGES, "pages": pages, "highlights": highlights,
            "source_records": records,
            "inventory": file_record(inventory_path), "full_text": file_record(text_path),
            "credits": file_record(credits_path),
            "preview": file_record(OUT / "preview-contact.jpg"),
            "highlight_preview": file_record(OUT / "preview-highlights.jpg"),
            "contact_sheets": [file_record(dest) for _, dest in jpg_jobs if dest.parent.name == "contact-sheets"]}
        write_json(OUT / "catalog.json", catalog)
        report = ["Daily Apple extraction report", "", f"Asset directory: {OUT}",
            f"Build script: {Path(__file__).resolve()}", f"Input: {args.source.resolve()}",
            f"Input/copy SHA-256: {SOURCE_HASH}", "Pages: 56 (all 720 x 1008 PDF points)",
            f"Original PDF: {original.stat().st_size:,} bytes; separate, on-demand, byte-identical copy.",
            f"Raster total: {raster_bytes:,} bytes / {RASTER_BUDGET:,} byte target.",
            f"Raster files: {len(webp_jobs) + len(jpg_jobs)} (56 page WebPs, 8 captioned crop WebPs, 7 contact JPGs).",
            f"WebP/JPEG quality: {quality}; maximum raster long edge: {MAX_EDGE} pixels.",
            "Selected PDF pages: " + ", ".join(map(str, SELECTED_PAGES)), "",
            "Selected titles below are from the PDF; selection reasons describe visual content."]
        report.extend(f"p. {h['source_page']}: {h['title']}\n  {h['selection_reason']}\n  {OUT / h['url'].removeprefix(BASE_URL)}" for h in highlights)
        report.extend(["", "Evidence and limitations:",
            "All 56 source pages were visually inspected in five contact sheets; selected pages/crops were reviewed at larger size.",
            "The PDF is the only source. No historical verification or external URL access was performed.",
            "All 133 printed source records and their embedded URLs are retained in the catalog and credits.txt.",
            "Full-page raster captions and credits are unchanged. Crop rectangles retain the complete photograph and printed caption block.",
            "Display crops with their catalog source_credit, source_record and reader_url; bitmap credit labels cannot carry PDF hyperlinks.",
            "The source contains visible missing-glyph boxes (e.g. the exposition name on p. 13); these were preserved, not repaired.",
            f"Raw text contains {missing_glyphs} NUL missing-glyph markers. Readable text/excerpts use U+FFFD and inventory.json retains raw extraction.",
            "Some embedded photographs are small, especially p. 42 (409 x 512 px); exported dimensions do not imply additional image detail.",
            "Dense source-record pages are retained at 1600 px; the original PDF and full text provide on-demand reading detail.",
            "SHA256SUMS covers every other file in the asset directory; it excludes itself.", "", "Key paths:"])
        report.extend(str(OUT / name) for name in ("catalog.json", "preview-contact.jpg", "preview-highlights.jpg", "contact-sheets", "inventory.json", "source-text.txt", "credits.txt", "SHA256SUMS"))
        (OUT / "extraction-report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
        manifest = OUT / "SHA256SUMS"
        manifest.write_text("".join(f"{sha(p)}  {p.relative_to(OUT).as_posix()}\n" for p in sorted(OUT.rglob("*")) if p.is_file() and p != manifest), encoding="utf-8")
        print(json.dumps({"output": str(OUT), "page_count": len(pages), "highlight_count": len(highlights),
            "raster_bytes": raster_bytes, "quality": quality, "original_bytes": original.stat().st_size,
            "total_asset_bytes": sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()),
            "asset_file_count": sum(p.is_file() for p in OUT.rglob("*"))}, indent=2), flush=True)


if __name__ == "__main__":
    main()
