import re


def hb_program(leaf):
    """Map an HB leaf (pap/program/sub_program/project text) to one of the
    6 official locally-funded programs, or None.

    Order mirrors the official taxonomy's own precedence:
    1. canonical PAP/heading labels carried in `pap`
    2. flood-title keywords (most specific family)
    3. BIP/local-road titles the NEP itself files under Convergence
    4. asset-preservation work verbs (apply even to bridge-named segments)
    5. bridge/viaduct structures
    6. named roads/highways -> Network Development
    """
    hl = re.compile(r"<headingless @\d+>\s*")
    pap = hl.sub("", (leaf.get("pap") or "").replace("\n", " ")).strip()
    proj = hl.sub("", (leaf.get("project") or "").replace("\n", " "))

    # for headingless rows the 'project' field carries the canonical PAP text
    ptext = proj.lower()
    n = (pap or ptext).lower()

    # 1. canonical PAP / heading labels
    if n.startswith(("asset preservation program",
                     "preventive maintenance", "off-carriageway",
                     "paving of unpaved",
                     "rehabilitation/reconstruction of roads with slips",
                     "rehabilitation/ reconstruction of roads with slips",
                     "rehabilitation/reconstruction/upgrading of damaged",
                     "rehabilitation/ reconstruction/ upgrading of damaged",
                     "construction/ upgrading/ rehabilitation of drainage",
                     "rehabilitation/reconstruction/upgrading",
                     "rehabilitation/ reconstruction/ upgrading")):
        return "Asset Preservation Program"
    if n.startswith(("bridge program", "replacement of",
                     "construction of new bridges",
                     "rehabilitation/ major repair of permanent",
                     "retrofitting")):
        return "Bridge Program"
    if re.match(r"buildings? and other structures|multipurpose /? ?facilities",
                n):
        return "Local Program"
    if n.startswith(("construction of by-pass",
                     "construction of missing links", "road widening")):
        return "Network Development Program"
    # canonical Convergence families (BIP, water, social facilities, PPP)
    if n.startswith(("bip -", "water supply", "rainwater", "septage",
                     "construction of water", "gender-responsive",
                     "facilities for", "construction of by-")) or \
            (n.startswith("facilit") and ("elderl" in n or "person" in n or
                                          "gender" in n)) or \
            "public-private partnership" in n:
        return "Convergence and Special Support Program"
    if n.startswith(("construction/ maintenance of flood mitigation",
                     "construction/rehabilitation of flood",
                     "construction/ rehabilitation of flood",
                     "rehabilitation of disaster-related")):
        return "Flood Management Program"

    text = f"{pap} {proj}".lower()

    # 2. flood-title keywords (most specific family)
    if re.search(r"groundsill|retarding basin|pumping station|flood|"
                 r"slope protection|river|lakewall|seawall|levy|levee|"
                 r"shore protection|dike|estero|creek|gabion|"
                 r"detention basin", text):
        return "Flood Management Program"

    # 3. BIP/local-road titles the NEP itself files under Convergence
    if re.search(r"upgrading of road|construction of concrete road|"
                 r"concrete road|rehabilitation of road along|access road|"
                 r"multi-?purpose building|covered court|public market|"
                 r"barangay hall|health center|school building|evacuation|"
                 r"water supply|rainwater|septage|sewerage|tourism|"
                 r"farm-?to-?market|boat landing|local port", text):
        return "Convergence and Special Support Program"

    # 4. asset-preservation work verbs (even on bridge-named segments)
    if re.search(r"preventive maintenance|regravell|asphalt overlay|"
                 r"resurfac|off-?carriageway|paving of unpaved|"
                 r"micro-surfacing|reblocking|rehabilitat|reconstruc|"
                 r"upgrad|drainage", text):
        return "Asset Preservation Program"

    # 5. bridge / viaduct structures
    if re.search(r"\bbr\.|viaduct|\bbridges?\b|steel bridge|bailey", text):
        return "Bridge Program"

    # 6. named roads / highways / grade-separated junctions -> Network
    if re.search(r"\brd\b|road|highway|h-way|hwy|bypass|diversion|junction|"
                 r"intersection|roundabout|rotunda|circumferential|"
                 r"avenue|boulevard|\bflyover\b|\bunderpass\b|"
                 r"\binterchange\b|\boverpass\b", text):
        return "Network Development Program"
    return None


def fap_program(leaf):
    """Program mapping for foreign-assisted (FAP zone) leaves."""
    pap = (leaf.get("pap") or "").replace("\n", " ").strip().lower()
    if "laguna lakeshore" in pap:
        return "Network Development Program"
    if pap.startswith("1. construction of by-passes/diversion") or \
            pap.startswith("1. construction of by-pass"):
        return "Network Development Program"
    if pap.startswith("1. construction/ rehabilitation of flood") or \
            pap.startswith("1. construction/rehabilitation of flood"):
        return "Flood Management Program"
    if pap.startswith("1. preventive maintenance") or \
            pap.startswith("2. rehabilitation/ reconstruction/ upgrading"):
        return "Asset Preservation Program"
    if pap.startswith("multipurpose / facilities") or \
            pap.startswith("multipurpose/ facilities"):
        return "Local Program"
    if pap.startswith("buildings and other structures"):
        return "Local Program"
    return hb_program(leaf)
