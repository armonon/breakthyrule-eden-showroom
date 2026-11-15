#!/usr/bin/env python3
"""Remove reviewed, exterior-connected neutral mattes without redrawing artwork.

Requires Pillow. Run after reimporting GRAPHICS to reproduce the transparent assets.
Only alpha changes: original RGB, canvas dimensions, enclosed detail and IDs remain.
The allowlist excludes photographs, intentional clouds, paper and dark linework.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def exterior_connected(mask):
    """Scanline flood fill from a one-pixel exterior border (four connectivity)."""
    width, height = mask.size
    padded = Image.new('L', (width + 2, height + 2), 255)
    padded.paste(mask, (1, 1))
    stride, rows = padded.size
    pixels = bytearray(padded.tobytes())
    stack = [0]
    while stack:
        pos = stack.pop()
        if pixels[pos] != 255:
            continue
        row = pos // stride
        left = pos
        start = row * stride
        end = start + stride
        while left > start and pixels[left - 1] == 255:
            left -= 1
        right = pos
        while right + 1 < end and pixels[right + 1] == 255:
            right += 1
        pixels[left:right + 1] = b'\x80' * (right - left + 1)
        for adjacent in (row - 1, row + 1):
            if not 0 <= adjacent < rows:
                continue
            offset = (adjacent - row) * stride
            inside = False
            for x in range(left + offset, right + offset + 1):
                eligible = pixels[x] == 255
                if eligible and not inside:
                    stack.append(x)
                inside = eligible
    filled = Image.frombytes('L', (stride, rows), bytes(pixels))
    return filled.point(lambda p: 255 if p == 128 else 0).crop((1, 1, width + 1, height + 1))


def clean(image, color, white_floor=245, black_ceiling=12, protected_polygons=(), protection_feather=0):
    rgba = image.convert('RGBA')
    r, g, b, alpha = rgba.split()
    low = ImageChops.darker(ImageChops.darker(r, g), b)
    high = ImageChops.lighter(ImageChops.lighter(r, g), b)
    neutral = ImageChops.subtract(high, low).point(lambda p: 255 if p <= 18 else 0)
    tone = (low.point(lambda p: 255 if p >= white_floor else 0) if color == 'white'
            else high.point(lambda p: 255 if p <= black_ceiling else 0))
    matte = ImageChops.multiply(tone, neutral)
    transparent = alpha.point(lambda p: 255 if p == 0 else 0)
    eligible = ImageChops.lighter(matte, transparent)
    protected = None
    if protected_polygons:
        protected = Image.new('L', rgba.size)
        draw = ImageDraw.Draw(protected)
        for polygon in protected_polygons:
            draw.polygon([(round(x * (rgba.width - 1)), round(y * (rgba.height - 1)))
                          for x, y in polygon], fill=255)
        if protection_feather:
            radius = max(1, round(min(rgba.size) * protection_feather))
            inner = protected.filter(ImageFilter.MinFilter(radius * 2 + 1))
            protected = ImageChops.multiply(protected, inner.filter(ImageFilter.GaussianBlur(radius / 2)))
        else:
            eligible = ImageChops.multiply(eligible, ImageChops.invert(protected))
    connected = exterior_connected(eligible)
    result = rgba.copy()
    cleaned_alpha = ImageChops.multiply(alpha, ImageChops.invert(connected))
    if protected is not None and protection_feather:
        cleaned_alpha = ImageChops.lighter(cleaned_alpha, ImageChops.multiply(alpha, protected))
    result.putalpha(cleaned_alpha)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--report', type=Path)
    parser.add_argument('--ids', nargs='+', help='Process only these reviewed IDs.')
    args = parser.parse_args()
    manifest_path = args.root / 'tools/assets/graphic-matte-cleanup.json'
    manifest = json.loads(manifest_path.read_text())
    report = []
    for entry in manifest['graphics']:
        if args.ids and entry['id'] not in args.ids:
            continue
        for variant in ('full', 'thumb'):
            path = args.root / 'images/breakthyrule/graphics' / variant / (entry['id'] + '.webp')
            before_bytes = path.read_bytes()
            before_hash = hashlib.sha256(before_bytes).hexdigest()
            version = entry.get('versions', {}).get(variant)
            if version and before_hash == version['cleaned_sha256']:
                report.append({'id': entry['id'], 'variant': variant, 'status': 'already_clean',
                               'sha256': before_hash})
                print(f"{variant}/{entry['id']}: already cleaned", flush=True)
                continue
            if version and before_hash != version['source_sha256']:
                raise ValueError(f'Artwork changed; review its background before updating the manifest: {path}')
            with Image.open(path) as source:
                before = source.convert('RGBA')
                after = clean(before, entry['matte'], entry.get('white_floor', 245), entry.get('black_ceiling', 12), entry.get('protected_polygons', ()), entry.get('protection_feather', 0))
            old_alpha, new_alpha = before.getchannel('A'), after.getchannel('A')
            removed = sum(1 for old, new in zip(old_alpha.tobytes(), new_alpha.tobytes()) if old != new)
            if removed:
                after.save(path, format='WEBP', lossless=True, exact=True, method=6)
            with Image.open(path) as saved:
                actual = saved.convert('RGBA')
            assert actual.size == before.size, f'Dimensions changed: {path}'
            assert actual.getchannel('A').tobytes() == new_alpha.tobytes(), f'Alpha mismatch: {path}'
            original_pixels = getattr(before, 'get_flattened_data', before.getdata)()
            saved_pixels = getattr(actual, 'get_flattened_data', actual.getdata)()
            for old, new in zip(original_pixels, saved_pixels):
                assert 0 <= new[3] <= old[3], f'Unexpected opacity added: {path}'
                if not entry.get('protection_feather'):
                    assert new[3] in (0, old[3]), f'Foreground alpha changed: {path}'
                assert not new[3] or old[:3] == new[:3], f'Visible RGB changed: {path}'
            assert actual.getchannel('A').getextrema()[1] > 0, f'Empty graphic: {path}'
            report.append({'id': entry['id'], 'variant': variant, 'matte': entry['matte'],
                           'size': list(before.size), 'removed_pixels': removed,
                           'before_sha256': before_hash,
                           'after_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                           'visible_rgb_preserved': True})
            print(f"{variant}/{entry['id']}: {removed} background pixels removed", flush=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'result': 'pass', 'assets': report}, indent=2) + '\n')


if __name__ == '__main__':
    main()
