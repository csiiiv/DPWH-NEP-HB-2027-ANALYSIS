#!/usr/bin/env python3
"""
Publish the final DEO2LEG artifacts into DEO2LEG/outputs/ as verified copies.

Why this exists
---------------
The two outputs are produced in two different places by build_mapping.py:

    DEO2LEG/deo_leg_crosswalk.json        (the mapping graph)
    DEO2LEG/evidence/source_amounts.json  (the allocation sidecar)

Consumers repeatedly had to reach into two directories. outputs/ collects both,
with a MANIFEST.json recording SHA-256 hashes so a copy can be proved identical
to the canonical build instead of merely assumed to be.

Design rules
------------
1. Copies are BYTE-IDENTICAL to the canonical files. Nothing is rewritten, not
   even a path. A manifest of hashes is only meaningful if the bytes match, and
   a consumer diffing outputs/ against the build root must see no difference.

   Consequence: `representative.profile.photoPath` stays relative to the
   DEO2LEG root (e.g. 'legislative_profiles/photos/foo.jpg') and does NOT
   resolve from outputs/. That base is recorded in the manifest rather than
   papered over by editing the JSON. See outputs/README.md.

2. Refuses to publish stale artifacts. If any build input is newer than the
   canonical output, the copy would silently misrepresent the current build.

3. Idempotent, with a --check mode that verifies without writing, for CI.

Usage:
    python DEO2LEG/publish_outputs.py            # publish + verify
    python DEO2LEG/publish_outputs.py --check    # verify only, exit non-zero on drift
"""

import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "outputs"


def manifest_path():
    """Manifest lives inside OUT; derived, never a separate constant.

    Keeping it derived means OUT is the single source of truth for where
    published files live, so a caller (or test) that redirects OUT redirects the
    manifest too rather than silently splitting the two.
    """
    return OUT / "MANIFEST.json"


# The two final artifacts: (canonical path, published filename, description)
ARTIFACTS = [
    (HERE / "deo_leg_crosswalk.json", "deo_leg_crosswalk.json",
     "Mapping graph: DEO offices <-> legislative districts <-> representatives. "
     "Structure only; contains no monetary amounts."),
    (HERE / "evidence" / "source_amounts.json", "source_amounts.json",
     "Evidence sidecar: all 264 allocation rows with transcribed amounts and "
     "page/row provenance. Kept separate so the reusable graph stays free of "
     "transient fiscal values."),
]

# Anything newer than an output makes that output stale.
INPUTS = [
    HERE / "DPWH_per_district_extracted.csv",
    HERE / "DPWH_per_district_extracted.json",
    HERE / "sources" / "official_house_roster_2026-10-22.json",
    HERE / "sources" / "dpwh-project-code-mapping@38fe1cf2.json",
    HERE / "sources" / "deoLegRows@26b3f3f2.json",
    HERE / "legislative_profiles" / "profiles.json",
    HERE / "build_mapping.py",
    HERE / "build_official_roster.py",
    HERE / "join_districts.py",
    HERE / "leg_profiles.py",
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_stale(canonical):
    """Build inputs modified after the canonical output -> output is stale."""
    if not canonical.exists():
        return None
    cutoff = canonical.stat().st_mtime
    return [p.name for p in INPUTS if p.exists() and p.stat().st_mtime > cutoff]


def check():
    """
    Verify published copies match canonical. Returns a list of ALL problems.

    A missing manifest does not short-circuit the rest: existence, drift and
    staleness are still reported, so one run surfaces every issue rather than
    making the caller fix them one at a time.
    """
    problems = []
    manifest_file = manifest_path()
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        by_name = {f["file"]: f for f in manifest["files"]}
    else:
        by_name = {}
        problems.append("MANIFEST.json absent -- run publish_outputs.py")

    for canonical, published_name, _ in ARTIFACTS:
        published = OUT / published_name
        if not canonical.exists():
            problems.append(f"canonical missing: {canonical.name}")
            continue
        # Staleness is about the canonical build itself, so it is reported even
        # when the published copy is absent.
        stale = find_stale(canonical)
        if stale:
            problems.append(
                f"{published_name} is STALE -- inputs newer than the build: {stale}")
        if not published.exists():
            problems.append(f"published copy missing: {published_name}")
            continue
        want = sha256(canonical)
        got = sha256(published)
        if want != got:
            problems.append(
                f"{published_name} DRIFTED from canonical "
                f"(published {got[:12]} != canonical {want[:12]})")
        rec = by_name.get(published_name)
        if not rec:
            problems.append(f"{published_name} absent from MANIFEST.json")
        elif rec.get("sha256") != got:
            problems.append(
                f"{published_name} does not match its MANIFEST sha256 "
                f"(manifest {rec['sha256'][:12]} != actual {got[:12]})")
    return problems


def publish():
    problems = []
    for canonical, _, _ in ARTIFACTS:
        if not canonical.exists():
            problems.append(f"canonical artifact missing: {canonical}")
            continue
        stale = find_stale(canonical)
        if stale:
            problems.append(
                f"{canonical.name} is stale (inputs newer: {stale}). "
                f"Re-run build_mapping.py before publishing.")
    if problems:
        for p in problems:
            print(f"REFUSED: {p}")
        return 1

    OUT.mkdir(exist_ok=True)
    files = []
    for canonical, published_name, description in ARTIFACTS:
        published = OUT / published_name
        shutil.copyfile(canonical, published)
        src_hash, dst_hash = sha256(canonical), sha256(published)
        if src_hash != dst_hash:
            print(f"REFUSED: copy of {published_name} did not verify")
            return 1
        data = json.loads(published.read_text(encoding="utf-8"))
        files.append({
            "file": published_name,
            "canonicalPath": str(canonical.relative_to(HERE)),
            "description": description,
            "sha256": dst_hash,
            "bytes": published.stat().st_size,
            "schemaVersion": data.get("schemaVersion"),
            "buildDate": data.get("buildDate"),
            "summary": data.get("summary"),
            "byteIdenticalToCanonical": True,
        })
        print(f"published {published_name:<26} {dst_hash[:16]}  "
              f"{published.stat().st_size:>9,} bytes  schema {data.get('schemaVersion')}")

    crosswalk = json.loads((OUT / "deo_leg_crosswalk.json").read_text(encoding="utf-8"))
    sidecar = json.loads((OUT / "source_amounts.json").read_text(encoding="utf-8"))

    manifest = {
        "publishedOn": date.today().isoformat(),
        "publisher": "DEO2LEG/publish_outputs.py",
        "policy": (
            "Byte-identical copies of the final DEO2LEG artifacts, published so "
            "consumers need only read outputs/. Never edit these files: regenerate "
            "with build_mapping.py then republish. MANIFEST sha256 values are the "
            "integrity check; 'publish_outputs.py --check' verifies copies against "
            "both the canonical build and this manifest."),
        "canonicalBuild": {
            "regenerate": "python DEO2LEG/build_mapping.py",
            "inputs": [str(p.relative_to(HERE)) for p in INPUTS if p.exists()],
            "schemaVersion": crosswalk["schemaVersion"],
            "buildDate": crosswalk.get("buildDate"),
        },
        # Path resolution is the one real trap in consuming the copy.
        "pathResolution": {
            "base": "DEO2LEG/ (the repository directory containing this outputs/ folder)",
            "note": (
                "Files are copied byte-for-byte, so every relative path inside them is "
                "still resolved from the DEO2LEG root, NOT from outputs/. The only such "
                "field is representative.profile.photoPath, e.g. "
                "'legislative_profiles/photos/foo.jpg' -> "
                'DEO2LEG/legislative_profiles/photos/foo.jpg. Portraits are NOT '
                "copied into outputs/ (44MB of scraped assets; they are inputs, not "
                "outputs). Do not rewrite the JSON to make paths outputs-relative: that "
                "would break byte-identity and invalidate these hashes."),
        },
        "crossChecks": {
            "relationshipCount": crosswalk["summary"]["totalRelationships"],
            "sidecarRowCount": sidecar["summary"]["totalRows"],
            "rowsMatch": crosswalk["summary"]["totalRelationships"]
                         == sidecar["summary"]["totalRows"],
            "districtCount": crosswalk["summary"]["totalLegislativeDistricts"],
            "amountsAbsentFromGraph": not any(
                "amount" in k.lower()
                for r in crosswalk["relationships"] for k in r),
        },
        "files": files,
        "notPublished": [
            {"path": "legislative_profiles/photos/",
             "reason": "Scraped portrait assets (44MB); inputs, not outputs. "
                       "Referenced by photoPath."},
            {"path": "deo_leg_crosswalk_draft(1).json",
             "reason": "Superseded schema 0.1.0 draft (108-row partial crosswalk). "
                       "Retained as a historical artifact, deliberately not published."},
        ],
    }
    manifest_path().write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("published MANIFEST.json")

    cc = manifest["crossChecks"]
    if not cc["rowsMatch"]:
        print(f"REFUSED: crosswalk has {cc['relationshipCount']} relationships but "
              f"sidecar has {cc['sidecarRowCount']} rows")
        return 1
    if not cc["amountsAbsentFromGraph"]:
        print("REFUSED: monetary amounts leaked into the mapping graph")
        return 1
    print(f"cross-checks      : {cc['relationshipCount']} relationships == "
          f"{cc['sidecarRowCount']} sidecar rows, no amounts in graph")
    return 0


def main():
    if "--check" in sys.argv:
        problems = check()
        if problems:
            print("outputs/ verification FAILED:")
            for p in problems:
                print(f"  - {p}")
            return 1
        print(f"outputs/ verified: {len(ARTIFACTS)} artifacts byte-identical to "
              f"canonical build and matching MANIFEST.json")
        return 0
    return publish()


if __name__ == "__main__":
    sys.exit(main())
