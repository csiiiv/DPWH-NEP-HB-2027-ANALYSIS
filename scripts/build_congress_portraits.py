"""WebP portraits for the #congress workspace cards.

The official roster ships 324 JPEGs totalling ~44 MB at 288x387. The card grid
renders at most 196 portraits, so packaging the originals would put ~27 MB of
photographs on the page for images displayed at 96x129 CSS pixels.

This builds a resized WebP per portrait the committed district index actually
references, into analysis/data/congress_portraits/. That directory is already
served under /analysis/ in dev (vite retainedFiles) and is packaged beside the
other analysis data, so no extra asset route is needed.

The rendered WebP set is COMMITTED, not rebuilt on deploy: portraits change
only when the roster changes, and the manifest's source/output SHA-256 pairs
let `--check` verify staleness with no Pillow dependency. CI runs `--check`;
run the script with no arguments after a roster or display-size change to
re-render and commit the result.

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


INDEX = DATA / 'congress_district_index_2027.json'
PHOTOS = REPO / 'DEO2LEG' / 'legislative_profiles/photos'
OUT = DATA / 'congress_portraits'
MANIFEST = OUT / 'manifest.json'

# Displayed at 96x129 CSS px (the source aspect is 288:387); encode at 2x so
# high-density screens get a sharp image without shipping the original.
DISPLAY_W = 96
DISPLAY_H = 129
TARGET_W = DISPLAY_W * 2
TARGET_H = DISPLAY_H * 2
QUALITY = 78
METHOD = 6


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def referenced_photo_paths() -> list[str]:
    """Every roster photoPath the committed district index names, deduplicated."""
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


def require_index() -> None:
    if not INDEX.is_file():
        raise SystemExit(
            f'{INDEX} is missing; run `node buildCongressIndex.mjs` in analysis/web first')


def check() -> int:
    """Verify the committed WebP set matches the roster and the manifest.

    Pure hash comparison — deliberately importable without Pillow so CI can
    gate staleness without image tooling. Any mismatch is a hard error: the
    deploy would otherwise ship stale faces or a stale size.
    """
    require_index()
    if not MANIFEST.is_file():
        raise SystemExit('Portraits manifest missing; run scripts/build_congress_portraits.py')
    manifest = json.loads(MANIFEST.read_text())
    if manifest.get('target_size') != [TARGET_W, TARGET_H]:
        raise SystemExit(
            f"Portraits rendered at {manifest.get('target_size')} but the cards display "
            f'at {DISPLAY_W}x{DISPLAY_H} CSS px ({TARGET_W}x{TARGET_H} encode). '
            'Re-run scripts/build_congress_portraits.py and commit the result.')
    problems: list[str] = []
    wanted = set()
    for entry in manifest['portraits']:
        name = f"{entry['slug']}.webp"
        wanted.add(name)
        output = OUT / name
        source = REPO / 'DEO2LEG' / entry['photoPath']
        if not output.is_file():
            problems.append(f'missing {output.name}')
            continue
        if digest(output) != entry['output_sha256']:
            problems.append(f'{output.name} bytes differ from the manifest')
        if not source.is_file():
            problems.append(f'roster source missing: {entry["photoPath"]}')
        elif digest(source) != entry['source_sha256']:
            problems.append(f'{output.name}: roster JPEG changed since the last render')
    referenced = {f'{slug(path)}.webp' for path in referenced_photo_paths()}
    stale = {p.name for p in OUT.glob('*.webp')} - wanted
    missing = referenced - wanted
    for name in sorted(stale):
        problems.append(f'{name} is no longer referenced; re-run the builder')
    for name in sorted(missing):
        problems.append(f'{name} is referenced by the index but not rendered')
    if problems:
        raise SystemExit('Stale congress portraits:\n  ' + '\n  '.join(problems))
    print(f'Congress portraits verified: {len(manifest["portraits"])} WebP images match '
          f'the roster sources and the committed manifest')
    return 0


def build() -> int:
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - environment guard
        raise SystemExit('Pillow is required to re-render: pip install Pillow')

    require_index()
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    saved = 0
    for photo_path in referenced_photo_paths():
        source = REPO / 'DEO2LEG' / photo_path
        if not source.is_file():
            raise SystemExit(f'Roster portrait missing on disk: {photo_path}')
        name = slug(photo_path)
        destination = OUT / f'{name}.webp'
        info = convert(source, destination, Image)
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
    print('  Commit the result; CI verifies staleness with --check.')
    return 0


def convert(source: Path, destination: Path, Image) -> dict:
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


if __name__ == '__main__':
    raise SystemExit(check() if '--check' in sys.argv else build())
