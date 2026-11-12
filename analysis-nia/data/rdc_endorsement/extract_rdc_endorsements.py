#!/usr/bin/env python3
"""Consolidate the RDC ENDORSEMENT drop into a structured provenance dataset.

Sources
-------
/media/.../RDC ENDORSEMENT/
  * 32 scanned resolution PDFs (OCR'd by rdc_ocr_batch.py -> ocr_text/*.txt,
    manifest rdc_ocr_manifest.json)
  * RDC XII structured lists: Annex C (Top 30 regional priorities) and
    Annex E (Top 3 feasibility-study proposals), both xlsx with native values.

Outputs (under analysis-nia/data/rdc_endorsement/)
  * rdc_endorsement_dataset.json - documents, resolutions, tier tables,
    project-level attachment rows (heuristic OCR parsing), xlsx lists
  * rdc_resolutions.csv          - one row per identified resolution
  * rdc_project_rows.csv         - attachment project rows (review candidates)

Determinism: all file hashing is sha1 of source bytes; OCR text is fixed.
Heuristic OCR parses are labelled with confidence and require review --
nothing here is treated as established fact until row-verified.
"""
import csv
import hashlib
import json
import os
import re
import sys
import warnings

warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = HERE  # analysis-nia/data/rdc_endorsement

RDC_BASE = ('/media/temp/3dbc81e7-b4e7-4209-a85b-3f0afb0a5253/Downloads/'
            'NIA- PBC_Data/PEOPLE_S BUDGET COALITION REQUIREMENTS/RDC ENDORSEMENT')

REGIONS = {
    '01 CAR': 'CAR', '02 REGION I': 'Region 1', '03 REGION II': 'Region 2',
    '04 MARIIS': 'MARIIS', '05 REGION III': 'Region 3', '06 UPRIIS': 'UPRIIS',
    '07 REGION IV-A': 'Region 4A', '08 REGION IV-B': 'Region 4B',
    '09 REGION V': 'Region 5', '10 REGION VI': 'Region 6',
    '11 REGION VII': 'Region 7', '12 REGION VIII': 'Region 8',
    '13 REGION IX': 'Region 9', '14 REGION X': 'Region 10',
    '15 REGION XI': 'Region 11', '16 REGION XII': 'Region 12',
}

# Hand-verified FY 2027 proposal totals read from the OCR text (page-anchored
# readings; each cites the resolution).  These are the RDC-endorsed regional
# asks that precede NIA Central Office consolidation into the corporate
# proposal seen by the Senate workbook and the PBC presentation.
VERIFIED_TOTALS = {
    'CAR': {
        'resolution': 'RDC-CAR Resolution No. 31, s. 2026',
        'total': 15_531_791_000, 'tier2_total': 13_220_971_000,
        'reading': 'NOW THEREFORE clause: "Fifteen Billion ... (Php 15,531,791,000.00)"; '
                   'Tier 2 programs "(P13,220,971,000.00)"',
    },
    'Region 1': {
        'resolution': 'RDC-1 Full Council Resolution No. 29, s. 2026',
        'total': 22_225_583_770, 'tier1_total': 9_217_125_000,
        'tier2_total': 13_008_458_770,
        'reading': 'resolving clause: "amounting PhP 22,225,583,770.00"; Tier 1/Tier 2 lines',
    },
    'Region 2': {
        'resolution': 'RDC2 Resolution No. 02-56, s. 2026',
        'total': 27_079_955_000, 'tier1_total': 20_883_855_000,
        'tier2_total': 6_196_100_000,
        'reading': 'tier table: Tier 1 total 20,883,855,000; Tier 2 6,196,100,000',
    },
    'MARIIS': {
        'resolution': 'RDC2 Resolution No. 02-57, s. 2026',
        'total': 10_633_228_082, 'tier1_total': 1_363_833_122,
        'tier2_total': 9_269_394_960,
        'reading': 'tier table: Tier 1 1,363,833,122 (PS 417,454,373 + MOOE '
                   '536,378,749 + CO 410,000,000); Tier 2 9,269,394,960 '
                   '(OCR shows 9,269,304,960 mid-row and 9,269,394,960 total; '
                   'column sum gives 9,679,394,960 - 410,000,000 = 9,269,394,960, '
                   'so the total-row reading is used)',
    },
    'Region 3': {
        'resolution': 'RDC III Resolution No. 03-39, s. 2026',
        'total': 26_560_481_000,
        'tier1_total': 4_235_740_000, 'tier2_total': 22_324_741_000,
        'reading': 'table in PHP\'000: Tier 1 4,235,740.00; Tier 2 22,324,741.00; '
                   'Total 26,560,481.00 (x1000); percent shares 15.95/84.05',
    },
    'UPRIIS': {
        'resolution': 'RDC II Resolution No. 03-40, s. 2026',
        'total': 5_341_860_310,
        'reading': 'attachment final row: "TOTAL UPRIIS 2027 5,341,860,310.00" '
                   '(sum of the 80 attachment project rows parsed here: verify)',
    },
    'Region 4A': {
        'resolution': 'RDC IV-A Resolution No. IV-A-05U-2026',
        'total': 5_802_245_838,
        'reading': 'TIER AMOUNT table: Tier (1) 5,802,245,838.00; Tier 2 0.00; '
                   'OCR misreads the tier-1 label glyph as "4"; total matches',
    },
    'Region 4B': {
        'resolution': 'RDC IV-B Resolution No. 2026-092',
        'tier1_total': 5_640_000_000, 'tier2_total': 1_080_000_000,
        'total': 6_720_000_000,
        'reading': 'narrative: 218 Tier 1 PAPs "Php5.64 billion" + 70 Tier 2 '
                   'projects "Php1.08 billion"; total derived (sum), not printed',
    },
    'Region 5': {
        'resolution': 'RDC V Resolution No. 1-06G, s. 2026',
        'total': 8_568_777_826,
        'reading': 'comparison table FY 2027 Budgetary Requirement total '
                   '8,568,777,826.00 (GASS 4,161,477,701 + STO 165,420,000 + '
                   'Operations 4,241,880,125)',
    },
    'Region 6': {
        'resolution': 'RDC VI Resolution No. 03-34, s. 2026',
        'total': 15_571_169_000,
        'reading': 'resolving clause: "PhP 15,571.169 million"',
    },
    'Region 7': {
        'resolution': 'RDC VII Resolution No. 38-A, s. 2026',
        'total': 9_365_028_450,
        'reading': 'Budgetary Requirements (in PHP million): 6,547.42045 + '
                   '2,817.608 = 9,365.02845 million',
    },
    'Region 8': {
        'resolution': 'RDC VIII Resolution No. 06-H, s. 2026',
        'total': 9_542_821_841,
        'reading': 'WHEREAS: 19 Tier 1+2 PPAs "amounting to PHP9,542,821,841.00"; '
                   'annex grand total 8,968,076,841.00 covers the 15 endorsed '
                   'Tier 1 PPAs (difference 574,745,000 = Tier 2 not endorsed)',
    },
    'Region 9': {
        'resolution': 'RDC IX Joint AdCom/ExCom Resolution No. 012, s. 2026',
        'total': 10_226_000_000,
        'reading': 'resolving clause: "in the amount of PHP10.226 billion"',
    },
    'Region 10': {
        'resolution': 'RDC X Resolution No. 14-09, s. 2026',
        'total': 5_114_425_000,
        'tier1_total': 1_999_965_000, 'tier2_total': 4_984_425_000,
        'lfp_total': 130_000_000,
        'reading': 'Table 1 (in thousand pesos): Total 5,114,425 = Tier1 1,999,965 '
                   '+ Tier2 4,984,425 - overlap + LFP 130,000; narrative '
                   '"PHP 5.11 billion"; Reso 36 s.2026 separately endorses '
                   'BARMM-Lanao del Sur PAPs',
    },
    'Region 11': {
        'resolution': 'RDC XI Resolution No. 26, s. 2026',
        'total': 7_700_874_330,
        'reading': 'email subject + resolution title: "PhP 7,700,874,330.00"; '
                   'variant .2 file shows Annex A.1/A.2 total 19,857,835,832.00 '
                   'including big-ticket SRIPs (Cogon Bacaca 350M, Asbang 500M, '
                   'MIDP Cateel IIS 300M, MIDP Kipaliku 360M, Caraga River-San '
                   'Pedro IP 300M, Padada RIS rehab 150M)',
    },
    'Region 12': {
        'resolution': 'RDC XII Resolution No. 187, s. 2026 (Top 30) / 188 (Top 3 FS)',
        'reading': 'no single budget total; Reso 130 s.2026 requests prioritization '
                   'of 4 big-ticket projects (MRISIP, LIRIP, Tulunan SRIP, K2MIPP); '
                   'see rdc_xii_lists for structured amounts',
    },
}

AMOUNT = r'(?P<num>[\d,]+(?:\.\d+)?)'


def parse_php_amount(s):
    """'10,633,228,082' or '10,633,228,082.06' -> float; None if unparsable."""
    if not s:
        return None
    s = s.replace(' ', '').replace('PhP', '').replace('PHP', '').replace('P', '')
    try:
        return float(s.replace(',', ''))
    except ValueError:
        return None


def find_resolutions(text):
    """Locate resolution headers and their endorsing clauses with amounts."""
    resolutions = []
    # Resolution title pattern: RDC2 Resolution No. 02-57 / RDC-1 Full Council
    # Resolution No. 29 / RDC XII RESO NO 130 etc, near an ENDORSING clause.
    for m in re.finditer(
            r'(?:(?:RDC[- ]?(?:I|1|II|2|III|3|IV|4|V|5|VI|6|VII|7|VIII|8|IX|9|X|10|'
            r'XI|11|XII|12|XIII|13|CAR|IV-?A|IV-?B)\s*)?'
            r'Resolution\s+No\.?\s*(?P<resno>[A-Z0-9][\w\-\.\/ ]{0,30}?)\s*[, ]+'
            r'[sS]\.?\s*(?P<year>20\d{2})'
            r'|RDC\s+\w+\s+RESO\s+NO\.?\s*(?P<resno2>[\w\-\.\/ ]{1,20}?)\s*[, ]+'
            r'[sS]\.?\s*(?P<year2>20\d{2}))',
            text):
        resno = (m.group('resno') or m.group('resno2') or '').strip(' .,-')
        year = m.group('year') or m.group('year2')
        resolutions.append({
            'resolution_no': resno,
            'series_year': year,
            'char_offset': m.start(),
        })
    return resolutions


def find_endorsing_clauses(text):
    """Title-quote clauses: ENDORSING ... AMOUNTING TO PHP <amt>."""
    clauses = []
    pat = re.compile(
        r'["\u201c]((?:ENDORSING|ADOPTING|APPROVING|REQUESTING|URGING)[^"\u201d]{20,400}?)'
        r'["\u201d]', re.S)
    for m in pat.finditer(text):
        body = re.sub(r'\s+', ' ', m.group(1)).strip()
        clauses.append({'title': body[:400], 'char_offset': m.start()})
    return clauses


def find_tier_tables(text):
    """Tier tables, tolerant of OCR pipes/noise.

    Formats seen:
      [Tier 1 | 417,454,373 | 536,378,749 410,000,000 1,363,833,122
      ‘Tier 2 | to | 9,269,304,960 9,269,394,960
      Tier 1 PhP — 9,217,125,000.00      (RDC-1 narrative style)
      Tier 2 13,008,458,770.00
    Strategy: per line, find tier-label lines and harvest comma-grouped
    numbers of >= 7 digits; the tier total is the last harvestable amount
    on the line (or the only one).  Pair a Tier-1 line with the closest
    following Tier-2 line within 3 lines.
    """
    lines = text.split('\n')
    hits = []  # (line_index, tier, total)
    for i, line in enumerate(lines):
        lm = re.match(r"\s*[\[\('\"\u2018\u201c`~]*\s*Tier\s*([12lI?])\b", line)
        if not lm:
            continue
        tier_digit = lm.group(1)
        tier = '1' if tier_digit in ('1', 'l', 'I') else '2'
        nums = re.findall(r'\d{1,3}(?:,\d{3})+(?:\.\d+)?', line)
        big = [parse_php_amount(n) for n in nums]
        big = [v for v in big if v and v >= 1e6]
        if not big:
            continue
        hits.append((i, tier, max(big), ' '.join(line.split())[:160]))
    tables = []
    used2 = set()
    for i, tier, total, raw in hits:
        if tier != '1':
            continue
        # nearest following tier-2 line
        best = None
        for j, (i2, tier2, total2, raw2) in enumerate(hits):
            if tier2 == '2' and j not in used2 and 0 < i2 - i <= 3:
                best = (j, total2)
                break
        if best:
            used2.add(best[0])
            # char offset of the tier-1 line start (for proximity pairing)
            char_off = sum(len(l) + 1 for l in lines[:i])
            tables.append({
                'tier1_total': total,
                'tier2_total': best[1],
                'raw': raw + ' || ' + hits[best[0]][3],
                'line_index': i,
                'char_offset': char_off,
            })
    return tables


def find_project_rows(text):
    """Attachment project rows: '2027 <REGION> ... <MUNICIPALITY> <AMOUNT>' pattern.

    The UPRIIS attachment rows look like:
      2027 UPRIIS NvEc 1st District National REPAIR-NIS PRIS ... Cuyapo 25,000,000.00 ...
    We capture year + region token + fund-source token + municipality-ish token
    + first amount >= 1,000,000 on the row.  These are HEURISTIC and flagged
    for review; OCR noise on system names is expected.
    """
    rows = []
    pat = re.compile(
        r'^\s*(?P<year>20\d\d)\s+(?P<region>UPRIIS|MARIIS|CAR|R\d+\w*)\s+'
        r'(?P<rest>.{20,400}?)\s+(?P<muni>[A-Z][A-Za-z\.\- ]{2,25}?)\s+'
        r'(?P<amount>\d{1,3}(?:,\d{3})+(?:\.\d\d)?)\s',
        re.M)
    for m in pat.finditer(text):
        rest = m.group('rest')
        fund = None
        fm = re.search(r'(REPAIR-NIS|RESTO-NIS|REPAIR-CIS|RESTO-CIS|REPAIR-PIS|'
                       r'ISR-NIS|ISR-CIS|EGPIP|SPIP|Climate-?Change[\w\-]*|'
                       r' Climate\w*)', rest)
        if fm:
            fund = fm.group(1)
        rows.append({
            'year': m.group('year'),
            'region': m.group('region'),
            'fund_source': fund,
            'detail': re.sub(r'\s+', ' ', rest)[:220],
            'municipality_ocr': m.group('muni'),
            'amount': parse_php_amount(m.group('amount')),
            'raw': re.sub(r'\s+', ' ', m.group(0))[:260],
        })
    # dedupe on raw
    seen = set()
    out = []
    for r in rows:
        k = r['raw'][:150]
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def parse_pdf_document(rel, txt_path, pages, sha1):
    """Parse one OCR'd PDF into documents/resolutions/tier tables/project rows."""
    text = open(txt_path, encoding='utf-8', errors='replace').read()
    folder = rel.split('/')[0]
    region = REGIONS.get(folder, folder)
    doc = {
        'source_file': rel,
        'region': region,
        'pages': pages,
        'sha1': sha1,
        'resolutions': find_resolutions(text),
        'endorsing_titles': find_endorsing_clauses(text),
        'tier_tables': find_tier_tables(text),
        'project_rows': find_project_rows(text),
    }
    # headline amount: "amounting PhP X" / "AMOUNTING TO PHP X"
    doc['headline_amounts'] = []
    for m in re.finditer(
            r'[Aa]mounting\s+(?:to\s+)?(?:PhP|PHP|P)\s*' + AMOUNT, text):
        v = parse_php_amount(m.group('num'))
        if v and v > 1e8:  # only 100M+ headline totals
            doc['headline_amounts'].append(v)
    doc['headline_amounts'] = sorted(set(doc['headline_amounts']), reverse=True)[:6]
    return doc


def parse_rdc_xii_lists():
    """Parse the two RDC XII xlsx lists into structured records."""
    import openpyxl
    base = os.path.join(RDC_BASE, '16 REGION XII')

    # ---- Annex C: Top 30 regional priority projects --------------------
    f1 = os.path.join(base, 'Annex C_RNIP Dialogue ACO-RDC List of Regional '
                            'Priority Projects_Top 30_RDC XII.xlsx')
    wb = openpyxl.load_workbook(f1, read_only=True, data_only=True)
    ws = wb['SUMMARY OF REGIONAL PROJECTS']
    rows = list(ws.iter_rows(values_only=True))
    top30 = []
    for i, row in enumerate(rows[5:], start=6):
        title, agency = row[2], row[3]
        if title is None and agency is None:
            continue
        if agency and 'NIA' in str(agency):
            top30.append({
                'excel_row': i,
                'rank': row[1],
                'title': ' '.join(str(title).split()),
                'agency': str(agency).strip(),
                'status_of_proposal': (str(row[21]).split('\n')[0]
                                       if row[21] else None),
                'implementation_period': row[10],
                'readiness_level': row[8],
                'total_investment': row[20],
                'y2027': row[16], 'y2028': row[17], 'y2029': row[18],
                'dro_remarks': (' '.join(str(row[22]).split())[:300]
                                if row[22] else None),
                'aco_decision': (str(row[23]).split('\n')[0]
                                 if row[23] else None),
            })
    wb.close()

    # ---- Annex E: Top 3 FS proposals ------------------------------------
    f2 = os.path.join(base, 'Annex E_ Top 3 FS Proposals_RDC XII.xlsx')
    wb = openpyxl.load_workbook(f2, read_only=True, data_only=True)
    ws = wb['Top 3 FS']
    rows = list(ws.iter_rows(values_only=True))
    fs3 = []
    for i, row in enumerate(rows[4:9], start=5):
        title, agency = row[0], row[1]
        if title is None or not agency or 'NIA' not in str(agency):
            continue
        fs3.append({
            'excel_row': i,
            'title': ' '.join(str(title).split()),
            'agency': str(agency).strip() if agency else None,
            'fs_cost_2028': row[5],
            'fs_cost_2029': row[6],
            'fs_cost_2030': row[7],
            'fs_total': row[9],
            'justification': (' '.join(str(row[19]).split())[:400]
                              if row[19] else None),
        })
    wb.close()
    return top30, fs3


def main():
    # --- OCR manifest ---
    manifest = json.load(open(os.path.join(OUT, 'rdc_ocr_manifest.json')))
    docs = []
    for m in manifest:
        docs.append(parse_pdf_document(
            m['file'], os.path.join(OUT, m['txt']), m['pages'], m['sha1']))

    # --- xlsx lists ---
    top30, fs3 = parse_rdc_xii_lists()

    dataset = {
        'schema_version': 1,
        'generated_by': 'extract_rdc_endorsements.py',
        'source_root': RDC_BASE,
        'notes': [
            'All 32 resolution PDFs are scanned images without a text layer; '
            'text was recovered by tesseract 4.1.0 OCR at 200 DPI (psm 4).',
            'Resolution numbers, titles, tier totals and attachment project '
            'rows are heuristic OCR parses flagged for review, not '
            'row-verified readings.',
            '03 REGION II and 04 MARIIS are byte-identical files (same sha1); '
            'region attribution covers both NIA RO2 and NIA-MARIIS proposals.',
            'RDC XII xlsx lists carry native values (no OCR).',
            'verified_totals are page-anchored manual readings from the OCR '
            'text; each entry cites its resolution and reading basis.',
        ],
        'verified_totals': VERIFIED_TOTALS,
        'documents': docs,
        'rdc_xii_lists': {
            'top30_nia_projects': top30,
            'top3_fs_nia_proposals': fs3,
        },
    }

    # --- write JSON ---
    jpath = os.path.join(OUT, 'rdc_endorsement_dataset.json')
    with open(jpath, 'w') as fh:
        json.dump(dataset, fh, indent=1, ensure_ascii=False)
    print(f'wrote {jpath}')

    # --- CSV: resolutions ---
    rpath = os.path.join(OUT, 'rdc_resolutions.csv')
    with open(rpath, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['region', 'source_file', 'resolution_no', 'series_year',
                    'title_excerpt', 'tier1_total', 'tier2_total',
                    'headline_amounts'])
        for d in docs:
            res_by_off = {r['char_offset']: r for r in d['resolutions']}
            # pair each tier table with nearest preceding resolution header
            for t in d['tier_tables']:
                prior = [o for o in res_by_off if o < t['char_offset']]
                near = res_by_off[max(prior)] if prior else {}
                # find endorsing title near the table
                titles = [c['title'] for c in d['endorsing_titles']
                          if abs(c['char_offset'] - t['char_offset']) < 3000]
                w.writerow([d['region'], d['source_file'],
                            near.get('resolution_no', ''),
                            near.get('series_year', ''),
                            (titles[-1][:180] if titles else ''),
                            f"{t['tier1_total']:.0f}",
                            f"{t['tier2_total']:.0f}",
                            ';'.join(f'{a:,.0f}' for a in d['headline_amounts'])])
            if not d['tier_tables'] and d['resolutions']:
                for r in d['resolutions'][:4]:
                    w.writerow([d['region'], d['source_file'],
                                r['resolution_no'], r['series_year'], '', '', '',
                                ';'.join(f'{a:,.0f}' for a in d['headline_amounts'])])
    print(f'wrote {rpath}')

    # --- CSV: project rows ---
    ppath = os.path.join(OUT, 'rdc_project_rows.csv')
    with open(ppath, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['region', 'source_file', 'year', 'fund_source',
                    'municipality_ocr', 'amount', 'detail'])
        n = 0
        for d in docs:
            for r in d['project_rows']:
                w.writerow([d['region'], d['source_file'], r['year'],
                            r['fund_source'] or '', r['municipality_ocr'],
                            f"{r['amount']:.0f}" if r['amount'] else '',
                            r['detail']])
                n += 1
    print(f'wrote {ppath} ({n} rows)')

    # --- summary ---
    n_res = sum(len(d['resolutions']) for d in docs)
    n_tier = sum(len(d['tier_tables']) for d in docs)
    n_proj = sum(len(d['project_rows']) for d in docs)
    print(f'\ndocuments: {len(docs)}, resolution refs: {n_res}, '
          f'tier tables: {n_tier}, attachment project rows: {n_proj}, '
          f'xlsx NIA rows: {len(top30)} top30 + {len(fs3)} fs')


if __name__ == '__main__':
    main()
