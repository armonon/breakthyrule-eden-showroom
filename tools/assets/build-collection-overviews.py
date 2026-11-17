"""Regenerate the compact collection's small poster thumbnails from local catalogs."""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'site' / 'collection-overviews'

def js_catalog(path):
    return json.loads((ROOT / path).read_text().split('=', 1)[1].strip().rstrip(';'))

garments = js_catalog('garment-catalog.js')
belts = js_catalog('btr-belts/catalog.js')
necklaces = json.loads((ROOT / 'pendant-collection/catalog.json').read_text())
groups = {
    'products': [(item['slug'], item['images'][0]) for item in garments],
    'necklaces': [('pendant-' + item['slug'], item['media'] + item['slug'] + '-full-poster.png') for item in necklaces],
    'belts': [(item['id'], '/btr-belts/' + item['poster']) for item in belts]
}
report = {}
for group, items in groups.items():
    target = OUTPUT / group
    target.mkdir(parents=True, exist_ok=True)
    for slug, source in items:
        source = ROOT / source.lstrip('/').split('?', 1)[0]
        image = ImageOps.exif_transpose(Image.open(source)).convert('RGBA')
        image.thumbnail((128, 128), Image.Resampling.LANCZOS)
        image.save(target / (slug + '.webp'), 'WEBP', quality=74, method=6)
    report[group] = {'items': len(items), 'bytes': sum((target / (slug + '.webp')).stat().st_size for slug, _ in items)}
print(json.dumps(report, indent=2))
