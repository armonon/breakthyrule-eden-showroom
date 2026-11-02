#!/usr/bin/env python3
"""Shrink a Radiance .hdr sky for image-based lighting.

Reads a (run-length encoded) RGBE file, box-downsamples it, clamps the sun's hottest pixels (they only cause
sparkle in a pre-filtered environment map) and writes a flat, uncompressed RGBE file that eden-lighting.js can
decode in a few lines. Also prints the direction of the brightest region (the sun) so the sky can be turned to
match the scene's sun.

Usage: python3 tools/asset-pipeline/shrink-hdr.py in.hdr out.hdr [width=512]
Source of assets/eden-sky.hdr: Poly Haven "kloofendal_48d_partly_cloudy_puresky" (CC0), 1k.
"""
import math
import sys

import numpy as np


def read_rgbe(path):
    data = open(path, 'rb').read()
    head_end = data.index(b'\n\n') + 2
    size_line_end = data.index(b'\n', head_end)
    parts = data[head_end:size_line_end].split()
    height, width = int(parts[1]), int(parts[3])
    pos = size_line_end + 1
    img = np.zeros((height, width, 4), np.uint8)
    for y in range(height):
        if data[pos] == 2 and data[pos + 1] == 2:  # new-style RLE scanline
            pos += 4
            for c in range(4):
                x = 0
                while x < width:
                    count = data[pos]; pos += 1
                    if count > 128:
                        count -= 128; img[y, x:x + count, c] = data[pos]; pos += 1
                    else:
                        img[y, x:x + count, c] = np.frombuffer(data[pos:pos + count], np.uint8); pos += count
                    x += count
        else:
            img[y] = np.frombuffer(data[pos:pos + width * 4], np.uint8).reshape(width, 4); pos += width * 4
    e = img[..., 3].astype(np.float64)
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(int)), 0)
    return img[..., :3].astype(np.float64) * scale[..., None]


def write_rgbe(path, rgb):
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    mant, exp = np.frexp(m)
    scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, exp + 128, 0).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n' % (h, w))
        f.write(out.tobytes())  # flat scanlines, no RLE


def main(src, dst, width=512):
    rgb = read_rgbe(src)
    h, w, _ = rgb.shape
    f = w // width
    small = rgb[: h - h % f, : w - w % f].reshape(h // f, f, w // f, f, 3).mean(axis=(1, 3))
    lum = small @ [0.2126, 0.7152, 0.0722]
    y, x = np.unravel_index(np.argmax(lum), lum.shape)
    elevation = math.pi / 2 - (y + .5) / small.shape[0] * math.pi
    azimuth = ((x + .5) / small.shape[1]) * 2 * math.pi
    small = np.minimum(small, 24.0)
    write_rgbe(dst, small)
    print(f'{w}x{h} -> {small.shape[1]}x{small.shape[0]}; sun at u={(x + .5) / small.shape[1]:.4f} '
          f'v={(y + .5) / small.shape[0]:.4f} (elevation {math.degrees(elevation):.1f} deg, azimuth {math.degrees(azimuth):.1f} deg)')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], *(int(a) for a in sys.argv[3:4]))
