"""Generate crawler-readable GitHub Pages share entrypoints for hash-routed stories."""
from html import escape
from pathlib import Path
import json

BASE = "https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/"
STORIES = {
    "funding-shift": ("Agency funding shift", "Explore how FY2027 DPWH agency allocations changed between budget stages."),
    "multi-purpose": ("Multi-purpose building allocations", "Review changes in multi-purpose building funding."),
    "caloocan": ("Third-reading additions", "Explore third-reading budget additions and their source records."),
    "flood-priorities": ("Flood-control priorities", "Examine changes in drainage and river basin allocations."),
    "house-only": ("House-only allocation candidates", "Review House allocations without a verified NEP counterpart."),
    "groupings": ("Possible project groupings", "Explore provisional groupings of allocations sharing corridors or locations."),
    "regional-gains": ("Regional budget gains", "Explore which regions account for the increase in DPWH allocations outside foreign-assisted projects."),
    "office-capacity": ("District engineering office allocations", "Review changes in allocations assigned to district engineering offices."),
    "shorter-works": ("Shorter listed works", "Explore projects where recorded lengths warrant engineering review."),
    "rainwater": ("Rainwater collector allocations", "Explore repeated allocations for rainwater collectors."),
}

def generate_share_pages(app_dir: Path):
    for slug, (title, description) in STORIES.items():
        destination = app_dir / "share" / slug / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        canonical = BASE + "share/" + slug + "/"
        target = BASE + "#highlights?story=" + slug
        relative_target = "../../#highlights?story=" + slug
        full_title = title + " | FY2027 Budget Workbench"
        # No HTTP redirect: bots must be able to read the original OG metadata.
        html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(full_title)}</title>
<meta name="description" content="{escape(description, quote=True)}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(full_title, quote=True)}">
<meta property="og:description" content="{escape(description, quote=True)}">
<meta property="og:url" content="{escape(canonical, quote=True)}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="{escape(canonical, quote=True)}">
</head><body>
<p>Opening <a href="{escape(target, quote=True)}">{escape(title)}</a> in the FY2027 Budget Workbench.</p>
<p><a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/README.md">Repository README</a> · <a href="https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/README.md">DPWH workbench README</a></p>
<script>window.location.replace({json.dumps(relative_target)});</script>
<noscript><p>JavaScript is required to open the interactive dashboard.</p></noscript>
</body></html>"""
        destination.write_text(html, encoding="utf-8")
