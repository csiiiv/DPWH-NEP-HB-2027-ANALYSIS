#!/usr/bin/env python3
"""Render retained NEP source snippets for the static review queue.

One-time local extraction; packaging uses committed images and hashes and does
not require the external PDF or PyMuPDF. Row highlights show the extraction
area, which may itself be misaligned. No source amount is changed.
"""
import hashlib
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis/data'
OUT = DATA / 'source_review_evidence'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    tree_path = DATA / 'nep_2027_tree.json'
    queue_path = DATA / 'nep_2027_native_amount_review.json'
    tree = json.loads(tree_path.read_text()); queue = json.loads(queue_path.read_text())['records']
    source = Path(tree['provenance']['inputs']['pdf'])
    if sha(source) != tree['provenance']['sha256']['pdf']:
        raise ValueError('Retained source PDF does not match the NEP tree provenance')
    OUT.mkdir(exist_ok=True)
    records = {}
    with pymupdf.open(source) as doc:
        summary_pages = set()
        for r in queue:
            page = doc[r['pdf_page'] - 1]
            bbox = pymupdf.Rect(r['source_bbox'])
            clip = pymupdf.Rect(0, max(0, bbox.y0 - 65), page.rect.width,
                                min(page.rect.height, bbox.y1 + 65))
            name = r['id'].replace(':', '-') + '.webp'
            target = OUT / name
            page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), clip=clip).pil_save(str(target), format='WEBP', quality=88)
            records[r['id']] = {'path': 'source_review_evidence/' + name, 'sha256': sha(target),
                                'pdf_page': r['pdf_page'], 'clip_bbox': list(clip),
                                'marker_pct': [100 * (bbox.x0 - clip.x0) / clip.width,
                                               100 * (bbox.y0 - clip.y0) / clip.height,
                                               100 * bbox.width / clip.width, 100 * bbox.height / clip.height]}
        # These controls are absent from the row-level text audit; show the
        # summary page without inventing a bounding box or amount candidate.
        for n in tree['nodes']:
            if n.get('native_amount_status') or n['printed_amount_php'] is None:
                continue
            pn = n['source'].get('pdf_page')
            if not pn: continue
            target = OUT / f'summary-page-{pn}.webp'
            if pn not in summary_pages:
                doc[pn - 1].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).pil_save(str(target), format='WEBP', quality=88)
                summary_pages.add(pn)
            records[n['id']] = {'path': 'source_review_evidence/' + target.name, 'sha256': sha(target),
                                'pdf_page': pn, 'clip_bbox': list(doc[pn - 1].rect), 'marker_pct': None}
    payload = {'schema_version': 1, 'pdf_sha256': sha(source), 'queue_sha256': sha(queue_path),
               'tree_sha256': sha(tree_path), 'builder_sha256': sha(Path(__file__)),
               'highlight_policy': 'Extraction row area; approximate and possibly misaligned. Source snippets are visual evidence, not automatic corrections.',
               'records': records}
    (DATA / 'source_review_evidence.json').write_text(json.dumps(payload, indent=2) + '\n')
    print(f'Rendered source evidence for {len(records)} review nodes.')


if __name__ == '__main__': build()
