"""WebP portraits for the #congress workspace cards.

The official roster ships 324 JPEGs totalling ~44 MB at 288x387. The card grid
renders at most 196 portraits, so packaging the originals would put ~27 MB of
photographs on the page for images displayed at 64x86 CSS pixels.

This builds a resized WebP per portrait the committed district index actually
references, into analysis/data/congress_portraits/. That directory is already
served under /analysis/ in dev (vite retainedFiles) and is packaged beside the
other analysis data, so no extra asset route is needed.

Determinism: output bytes depend only on the source JPEG and Pillow's encoder,
so a rebuild is byte-stable and the digest manifest proves it. A missing source
is an error, not a silent skip — a card must never quietly lose its portrait.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parents[1] / 'analysis')]
from paths import DATA, REPO  # noqa: E402

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guard
    raise SystemExit('Pillow is required: pip install Pillow')

INDEX = DATA / 'congress_district_index_2027.json'
PHOTOS = REPO / 'DEO2LEG/legislative_profiles/photos'
OUT = DATA / 'congress_portraits'
MANIFEST = OUT / 'manifest.json'

# Displayed at 64x86 CSS px (the source aspect is 288:387); encode at 2x so
# high-density screens get a sharp image without shipping the original.
DISPLAY_W = 64
DISPLAY_H = 86
TARGET_W = DISPLAY_W * 2
TARGET_H = DISPLAY_H * 2
QUALITY = 78
METHOD = 6


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def referenced_photo_paths() -> list[str]:
    """Every roster photoPath the committed index names, deduplicated."""
    index = json.loads(INDEX.read_text())
    paths: set[str] = set()
    for district in index['districts'].values():
        photo = (district.get('representative') or {}).get('photoPath')
        if photo:
            paths.add(photo)
    if not paths:
        raise SystemExit('Congress index references no portraits; is it built?')
    return sorted(paths)


def slug(photo_path: str) -> str:
    """Stable output name: the roster filename without its extension."""
    name = photo_path.split('/')[-1]
    if not name.lower().endswith('.jpg'):
        raise SystemExit(f'Unexpected roster image format: {photo_path}')
    return name[:-4]


def convert(source: Path, destination: Path) -> dict:
    with Image.open(source) as image:
        image = image.convert('RGB')
        original = image.size
        image.thumbnail((TARGET_W, TARGET_H), Image.LANCZOS)
        image.save(destination, 'WEBP', quality=QUALITY, method=METHOD)
    return {
        'source_bytes': source.stat().st_size,
        'source_size': list(original),
        'output_bytes': destination.stat().st_size,
        'output_size': list(Image.open(destination).size),
    }


def build() -> int:
    if not INDEX.is_file():
        raise SystemExit(
            f'{INDEX} is missing; run `node buildCongressIndex.mjs` in analysis/web first')

    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    saved = 0
    for photo_path in referenced_photo_paths():
        source = REPO / 'DEO2LEG' / photo_path
        if not source.is_file():
            raise SystemExit(f'Roster portrait missing on disk: {photo_path}')
        name = slug(photo_path)
        destination = OUT / f'{name}.webp'
        info = convert(source, destination)
        saved += info['source_bytes'] - info['output_bytes']
        entries.append({
            'slug': name,
            'photoPath': photo_path,
            'source_sha256': digest(source),
            'output_sha256': digest(destination),
            **info,
        })

    # Drop portraits no longer referenced, so the directory is exactly the set
    # the index names and packaging cannot ship stale faces.
    wanted = {f"{entry['slug']}.webp" for entry in entries}
    for existing in OUT.glob('*.webp'):
        if existing.name not in wanted:
            existing.unlink()

    total_source = sum(entry['source_bytes'] for entry in entries)
    total_output = sum(entry['output_bytes'] for entry in entries)
    MANIFEST.write_text(json.dumps({
        'schema_version': 1,
        'generator': 'scripts/build_congress_portraits.py',
        'target_size': [TARGET_W, TARGET_H],
        'display_size': [DISPLAY_W, DISPLAY_H],
        'quality': QUALITY,
        'method': METHOD,
        'count': len(entries),
        'source_bytes': total_source,
        'output_bytes': total_output,
        'portraits': entries,
    }, indent=1, sort_keys=True) + '\n')

    print(f'Congress portraits: {len(entries)} WebP images '
          f'({total_source / 1e6:.1f} MB JPEG -> {total_output / 1e6:.2f} MB WebP, '
          f'{saved / 1e6:.1f} MB saved)')
    print(f'  {OUT.relative_to(REPO)} + manifest.json')
    return 0


if __name__ == '__main__':
    raise SystemExit(build())
