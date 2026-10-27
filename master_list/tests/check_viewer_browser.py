#!/usr/bin/env python3
"""Exercise the standalone viewer on file:// and HTTP, desktop and mobile."""
from functools import partial
import gzip
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from serve_pages import RangeHandler


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    errors = []
    applied_count = json.loads((ROOT / "master_list/data/applied_suggestions_audit.json").read_text())["applied"]
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            # No fetch/server is needed to open the list itself.
            page.goto((ROOT / 'master_list/index.html').as_uri())
            expect(page.locator('#search')).to_be_enabled(timeout=60000)
            expect(page.locator('#summary')).to_contain_text('20,321 comparison groups')
            expect(page.locator('#rows > tr[data-group-id]')).to_have_count(50)
            expect(page.locator('button[data-sort=score]')).to_be_disabled()
            expect(page.locator('button[data-sort=support]')).to_be_disabled()
            expect(page.locator('button[data-sort=value]')).to_be_disabled()
            for partition, count in [('matched','11,635'),('house_only','6,942'),('nep_only','1,744')]:
                page.locator('#partition').select_option(partition)
                expect(page.locator('#summary')).to_contain_text(count)
            page.locator('#reset').click()
            page.locator('#rows .expand').first.click()
            expect(page.locator('#rows .expand').first).to_have_attribute('aria-expanded','true')
            nested = page.locator('.expanded:visible .source-observations')
            expect(nested.locator('tbody > tr')).to_have_count(3)
            assert all(re.fullmatch(r'-?\d+', s) for s in nested.locator('.score:not(.applied)').all_text_contents())
            expect(nested).to_contain_text('DPWH · NEP PDF')
            expect(nested).to_contain_text('DPWH · House second reading')
            expect(nested).to_contain_text('DPWH · House third reading')
            page.locator('.expanded:visible .comparison-details summary').click()
            expect(page.locator('.expanded:visible .comparison-details pre')).to_contain_text('chainages')
            page.screenshot(path='/tmp/master-list-groups.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Unexpected mobile group overflow'
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.locator('#view').select_option('outside')
            expect(page.locator('#summary')).to_contain_text('5,044')
            expect(page.locator('#rows')).to_contain_text('Outside comparison')
            page.locator('#dataset').select_option('dpwh_house_second')
            expect(page.locator('#summary')).to_contain_text('2,522')
            expect(page.locator('#total')).to_contain_text('₱52,238,057,000')
            page.locator('#reset').click()
            page.locator('#view').select_option('groups')
            page.locator('#dataset').select_option('dpwh_house_second')
            expect(page.locator('#total')).to_contain_text('comparison scope')
            expect(page.locator('#total')).to_contain_text('₱586,941,661,000')
            # Continue exercising the original source-ledger browsing contract.
            page.locator('#reset').click()
            page.locator('#view').select_option('observations')
            # Location interpretations expose separate readings and contexts.
            interpretation_audit=json.loads((ROOT / 'master_list/data/location_interpretations_audit.json').read_text())
            page.locator('#interpretation-filter').select_option('trial_ready')
            ready = interpretation_audit['context_scoring']['coverage_and_trial_states']['ready_for_trial']
            expect(page.locator('#summary')).to_contain_text(f'{ready:,} records')
            expect(page.locator('#rows .trial-proposal').first).to_contain_text('not applied')
            page.locator('#reset').click()
            # A GPS candidate earns support without rewriting the master score.
            page.locator('#search').fill('dpwh_house_second:c12744')
            row = page.locator('#rows > tr[data-record-id]')
            expect(row).to_have_count(1)
            expect(row.locator('.score:not(.applied)')).to_have_text('0')
            expect(row.locator('.candidate-support strong')).to_have_text('7')
            expect(row.locator('.candidate-support')).to_contain_text('Text 0 · Spatial 6 · Context 1 · Registry —')
            proposal = row.locator('.trial-proposal')
            for label in ('Santa Elena', '1380700009', 'not applied', 'observed coordinate points'):
                expect(proposal).to_contain_text(label)
            proposal.locator('.candidate-score-details > summary').click()
            expect(proposal).to_contain_text('spatial complete barangay')
            expect(proposal).to_contain_text('source region agreement')
            expect(row.locator('.support-candidate')).to_contain_text('Santa Elena · 1380700009')
            quality = proposal.locator('.qualitative-details')
            quality.locator('> summary').click()
            for label in ('Coordinate extraction: parsed', 'Scope fit: supported',
                          'Whole-project extent: not assessed', 'reference freshness: not assessed',
                          'positional accuracy', 'City / municipality: City of Marikina',
                          'barangay: Santa Elena'):
                expect(quality).to_contain_text(label, ignore_case=True)
            office = quality.locator('.office-context-details')
            office.locator('> summary').click()
            expect(office).to_contain_text('broad region only')
            expect(office).to_contain_text('Metro Manila 1st District Engineering Office')
            expect(office).to_contain_text('broad regional labels add no office points')
            page.screenshot(path='/tmp/master-list-candidate-scoring.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Quality assessment causes mobile overflow'
            page.screenshot(path='/tmp/master-list-quality-scope-mobile.png', full_page=True)
            page.set_viewport_size({'width': 1440, 'height': 1000})
            row.locator('button.record-button').click()
            dialog = page.locator('#record-dialog')
            expect(dialog).to_be_visible()
            with page.expect_download() as download_info:
                dialog.locator('#record-json-download').click()
            bundle = json.loads(Path(download_info.value.path()).read_text())
            assert bundle['record']['location']['score'] == 0
            assert bundle['location_interpretation']['context_scoring']['best_support_score'] == 7
            assert bundle['location_interpretation']['context_scoring']['proposed_code'] == '1380700009'
            scored = next(c for c in bundle['location_interpretation']['candidates'] if c['code']=='1380700009')
            assert scored['score_assessment']['application']['automatic_application'] is False
            assert scored['score_assessment']['scope_fit']['whole_project_extent'] == 'not_assessed'
            assert scored['score_assessment']['evidence_quality']['coordinates']['state'] == 'parsed'
            assert len(scored['score_assessment']['resolution']) == 5
            assert bundle['location_interpretation']['context']['office']['resolution'] == 'broad_region_only'
            assert bundle['location_interpretation']['context']['office']['named_locations'] == []
            page.keyboard.press('Escape')
            page.locator('#reset').click()
            for value, flag in [('quality_review','has_quality_review'),
                                ('partial_scope','has_partial_scope'),
                                ('competing','has_competing_candidates'),
                                ('office_review','has_office_review')]:
                page.locator('#interpretation-filter').select_option(value)
                count = interpretation_audit['context_scoring']['assessment_counts'][flag]
                if count:
                    expect(page.locator('#summary')).to_contain_text(f'{count:,} records')
                else:
                    expect(page.locator('#summary')).to_have_text('0 matching records')
            page.locator('#reset').click()
            # Candidate support sorting is numeric and unavailable scores sort last.
            for descending in (False, True):
                page.locator('button[data-sort=support]').click()
                values = page.locator('#rows > tr[data-record-id] .candidate-support strong').all_text_contents()
                scores = [float(s.replace(',', '')) for s in values]
                assert scores and scores == sorted(scores, reverse=descending), 'Candidate support sort is not numeric'
                assert page.evaluate('filtered.every((r,i)=>i===0||filtered[i-1].support!=null||r.support==null)'), 'Unassessed support must sort last'
            page.locator('#reset').click()
            page.locator('#interpretation-filter').select_option('conflict')
            expect(page.locator('#summary')).to_contain_text(f"{interpretation_audit['states']['with_context_conflict']:,} records")
            page.locator('#rows .location-interpretations > summary').first.click()
            expect(page.locator('#rows .location-interpretations').first).to_contain_text('Master assignment:')
            expect(page.locator('#rows .location-interpretations').first).to_contain_text('Title-only reading:')
            expect(page.locator('#rows .location-interpretations').first).to_contain_text('Printed province:')
            expect(page.locator('#rows .location-interpretations').first).to_contain_text('Office context (administrative)')
            assert page.locator('#rows .location-interpretations').first.locator('.interpretation-candidate').count()<=8
            page.screenshot(path='/tmp/master-list-interpretations.png',full_page=True)
            page.locator('#reset').click()
            expect(page.locator('#interpretation-filter')).to_have_value('')
            # Numbered bridge endpoints retain Manila's submunicipalities.
            page.locator('#search').fill('dpwh_house_second:c7473')
            expect(page.locator('#rows > tr[data-record-id]')).to_have_count(1)
            row = page.locator('#rows > tr[data-record-id]')
            for label in ('Barangay 898', 'Barangay 839', '1380614091', '1380612007', 'Santa Ana', 'Pandacan'):
                expect(row).to_contain_text(label)
            expect(row.locator('.score:not(.applied)')).to_have_text('6')
            page.locator('#reset').click()
            # Missing-comma locality chains use catalog parents directly.
            page.locator('#search').fill('dpwh_house_third:c11857')
            row = page.locator('#rows > tr[data-record-id]')
            expect(row).to_have_count(1)
            for label in ('Mabini', '1004202005', 'Baliangao', 'Misamis Occidental'):
                expect(row).to_contain_text(label)
            expect(row.locator('.location .code')).to_have_text('1004202005 · barangay')
            expect(row.locator('.status')).to_have_text('Provisional name match')
            expect(row).not_to_contain_text('title or heading province conflict')
            page.locator('#reset').click()
            # Province/office evidence supports Bagacay without forcing a town alias.
            page.locator('#search').fill('dpwh_house_second:c10725')
            row = page.locator('#rows > tr[data-record-id]')
            expect(row).to_have_count(1)
            expect(row.locator('.location .code')).to_have_text('0501700000 · province')
            expect(row.locator('.suggestions .suggestion')).to_have_count(3)
            for code in ('0501718003', '0501733002', '0501737003'):
                expect(row.locator('.suggestions')).to_contain_text(code)
            row.locator('button.record-button').click()
            dialog = page.locator('#record-dialog')
            expect(dialog).to_be_visible()
            expect(dialog.locator('.record-summary')).to_contain_text('Camarines Sur 4th District Engineering Office')
            expect(dialog.locator('.record-summary')).to_contain_text('Region V')
            expect(dialog.locator('.record-summary')).to_contain_text('San Jose-Partido')
            section = dialog.locator('.record-section').filter(has_text='Location candidates, suggestions and score factors')
            section.locator('summary').click()
            expect(section.locator('pre')).to_contain_text('office_province_hint')
            expect(section.locator('pre')).to_contain_text('0501700000')
            with page.expect_download() as download_info:
                dialog.locator('#record-json-download').click()
            bundle = json.loads(Path(download_info.value.path()).read_text())
            self_record = bundle['record']
            assert self_record['record_id'] == 'dpwh_house_second:c10725'
            assert self_record['implementing_office'] == 'Camarines Sur 4th District Engineering Office'
            assert self_record['analysis_record']['chainages'], 'Retained chainage missing from modal JSON'
            assert len(bundle['location_interpretation']['candidates']) > 8, 'Modal JSON truncated to browser preview'
            assert len(bundle['candidate_locations']) == len(bundle['location_interpretation']['candidates'])
            assert bundle['comparison_group']['id'] == self_record['comparison_group_id']
            page.screenshot(path='/tmp/master-list-record-modal.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert dialog.evaluate('(d)=>d.scrollWidth<=d.clientWidth'), 'Mobile record modal overflows'
            page.screenshot(path='/tmp/master-list-record-modal-mobile.png', full_page=True)
            page.keyboard.press('Escape')
            expect(dialog).not_to_be_visible()
            expect(row.locator('button.record-button')).to_be_focused()
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.locator('#reset').click()
            # Office name associations can scope an existing barangay title
            # candidate without coordinates, while leaving application blocked.
            with gzip.open(ROOT / 'master_list/data/location_interpretations.jsonl.gz', 'rt') as stream:
                for line in stream:
                    office_profile = json.loads(line)
                    if office_profile['context'].get('coordinate_point_count') != 0 or len(office_profile['review_suggestion_codes']) > 8:
                        continue
                    office_candidate = next((c for c in office_profile['candidates']
                        if c['code'] in office_profile['review_suggestion_codes']
                        and not c['suggested'] and not c['coordinate_candidate'] and not c['registry_candidate']
                        and c['title']=='asserted' and c['named_parent']=='not_assessed'
                        and c['office_context']=='agrees'
                        and c.get('score_assessment',{}).get('dimension_details',{}).get('spatial',{}).get('level')=='barangay'), None)
                    if office_candidate:
                        break
                else:
                    raise AssertionError('No retained office-supported barangay review without coordinates')
            assert not office_candidate['score_assessment']['application']['eligible_for_trial']
            page.locator('#search').fill(office_profile['record_id'])
            expect(page.locator('#rows > tr[data-record-id]')).to_have_count(1)
            office_card = page.locator('#rows .suggestions .suggestion').filter(has_text=office_candidate['code'])
            expect(office_card).to_have_count(1)
            expect(page.locator('#rows .gps-layer')).to_have_count(0)
            office_card.locator('.candidate-score-details > summary').click()
            expect(office_card).to_contain_text('office agreement')
            office_card.locator('.qualitative-details > summary').click()
            office_card.locator('.office-context-details > summary').click()
            expect(office_card).to_contain_text('Candidate agreement: agrees')
            page.screenshot(path='/tmp/master-list-deo-without-coordinates.png', full_page=True)
            page.locator('#reset').click()
            # Context candidates reach the existing hierarchy-review section.
            with gzip.open(ROOT / 'master_list/data/location_interpretations.jsonl.gz', 'rt') as stream:
                for line in stream:
                    profile = json.loads(line)
                    spatial = next((c for c in profile['candidates']
                        if c['code'] in profile.get('review_suggestion_codes', [])
                        and c['coordinate_candidate'] and not c['suggested']
                        and len(profile['review_suggestion_codes']) <= 4), None)
                    if spatial:
                        break
                else:
                    raise AssertionError('No retained coordinate review suggestion')
            page.locator('#search').fill(profile['record_id'])
            suggestion = page.locator('#rows .suggestions .suggestion').filter(has_text=spatial['code'])
            expect(suggestion).to_have_count(1)
            expect(suggestion).to_contain_text('Context-based review candidate')
            expect(suggestion).to_contain_text('mapped coordinates')
            suggestion.get_by_text('Why suggested', exact=True).click()
            for label in ('Printed province:', 'Source region:', 'Locality headings:',
                          'Office context (administrative):', 'Registry:', 'Points /'):
                expect(suggestion).to_contain_text(label)
            page.screenshot(path='/tmp/master-list-context-suggestions.png', full_page=True)
            page.locator('#reset').click()
            # Applied-layer sort: independent of the master score; every row has an
            # applied-layer score (pinned for gate-passing rows, master carry-over
            # otherwise), so the sort is a plain numeric sort of the whole ledger.
            page.locator('button[data-sort=applied]').click()
            applied_first = page.locator('#rows tr[data-record-id] td.evidence .score.applied')
            first_scores = [int(s) for s in applied_first.all_text_contents()]
            assert first_scores == sorted(first_scores), 'Applied-layer sort is not numeric'
            # Carry-over rule: a carried-over applied pill always equals the master pill.
            pairs = page.locator('#rows tr[data-record-id] td.evidence').evaluate_all(
                '(cells) => cells.map(c => { const s=[...c.querySelectorAll(".score")];'
                ' return s.length===2 ? [s[0].textContent, s[1].textContent, s[1].classList.contains("carry")] : null; })')
            assert pairs and all(master == applied for master, applied, carry in pairs if carry), 'Carry-over pill differs from master pill'
            # Ascending leads with the lowest carried-over rows…
            assert all(carry for _, _, carry in pairs), 'Ascending applied sort must lead with carried-over rows'
            page.locator('button[data-sort=applied]').click()  # descending
            desc = page.locator('#rows tr[data-record-id] td.evidence .score.applied').all_text_contents()
            # …and descending is the exact reverse ledger, carry-over and pinned alike.
            assert [int(s) for s in desc] == sorted([int(s) for s in desc], reverse=True), 'Descending applied sort is not numeric'
            page.locator('#applied').check()
            expect(page.locator('#summary')).to_contain_text(f"of {applied_count:,} records")
            page.locator('#reset').click()
            page.locator('#view').select_option('observations')
            page.locator('#allocations').uncheck()
            expect(page.locator('#rows tr')).to_have_count(50)
            expect(page.locator('#summary')).to_contain_text('58,795')
            expect(page.locator('#error')).to_be_hidden()
            page.locator('#next').click()
            expect(page.locator('#summary')).to_contain_text('51–100')
            page.locator('#dataset').select_option('fmr_nep')
            expect(page.locator('#summary')).to_contain_text('704')
            expect(page.locator('#total')).to_contain_text('₱16,000,000,000')
            page.locator('#search').fill('Tubburan Bacarra Rango')
            expect(page.locator('#summary')).to_contain_text('of 1 records')
            expect(page.locator('#rows')).to_contain_text('0102802052')
            pdf = page.locator('#rows td').nth(5).locator('a')
            expect(pdf).to_have_attribute('href', (ROOT / 'dbm-other-nep-line-data/FMR.pdf').as_uri() + '#page=1')
            expect(page.locator('#rows td').nth(4).locator('.score:not(.applied)')).to_have_text(re.compile(r'^-?\d+$'))
            expect(page.locator('#rows td').nth(6)).to_contain_text('Printed 1511')
            page.locator('#reset').click()
            page.locator('#dataset').select_option('hfep_nep')
            page.locator('#search').fill('Nacagang')
            expect(page.locator('#rows tr')).to_have_count(1)
            expect(page.locator('#rows td').nth(5).locator('a')).to_have_attribute('href', (ROOT / 'dbm-other-nep-line-data/HFEP_2.pdf').as_uri() + '#page=1')
            page.locator('#reset').click()
            page.locator('#dataset').select_option('dpwh_nep_api')
            expect(page.locator('#rows td').nth(5)).to_contain_text('Not supplied (API listing)')
            page.locator('#reset').click()
            page.locator('#allocations').check()
            expect(page.locator('#summary')).to_contain_text('64,645')
            page.locator('#score').fill('8')
            scores = page.locator('#rows td.evidence .score:not(.applied)').all_text_contents()
            assert scores and all(int(score) >= 8 for score in scores)
            page.locator('#reset').click()
            page.locator('#search').fill('nonexistent record xyzq987654')
            expect(page.locator('#summary')).to_have_text('0 matching records')
            expect(page.locator('#next')).to_be_disabled()
            # Applied-suggestion derived layer: filter, block render, and no
            # assignment leakage into master locations.
            page.locator('#reset').click()
            page.locator('#applied').check()
            applied_rows = page.locator('#rows tr[data-record-id]')
            expect(applied_rows).to_have_count(50)
            expect(page.locator('#summary')).to_contain_text(f"of {applied_count:,} records")
            expect(page.locator('#rows .applied-layer').first).to_contain_text('not assigned')
            expect(page.locator('#rows .applied-layer').first).to_contain_text('Gate pass')
            expect(page.locator('#rows .applied-layer').first).to_contain_text('applied_suggestion_v1')
            # The master pill stays authoritative; the applied layer always shows,
            # pinned for gate-passing rows and carried over from the master otherwise.
            pills = page.locator('#rows tr[data-record-id] td.evidence .score.applied')
            expect(pills.first).to_be_visible()
            assert pills.evaluate_all('(nodes) => nodes.every(n => n.previousElementSibling && n.previousElementSibling.classList.contains("score"))'), 'applied pill without master pill'
            assert pills.evaluate_all('(nodes) => nodes.every(n => !n.classList.contains("carry"))'), 'with the filter on, every row must be a pinned (non-carry) applied row'
            page.locator('#reset').click()
            page.locator('#view').select_option('observations')
            scope = page.locator('#scope-note').inner_text()
            assert f"{applied_count:,} observations carry an applied suggestion" in scope, scope
            page.locator('#applied').uncheck()
            page.locator('#reset').click()
            # GPS-derived PSGC layer: filter, block render, agreement summary.
            page.locator('#gpsfilter').check()
            expect(page.locator('#summary')).to_contain_text('7,378 records')
            expect(page.locator('#rows .gps-layer').first).to_contain_text('GPS-derived PSGC')
            expect(page.locator('#rows .gps-layer').first).to_contain_text('not assigned')
            scope = page.locator('#scope-note').inner_text()
            assert '7,378 observations carry GPS points' in scope, scope
            assert 'coordinate_psgc_v1' in scope, scope
            page.locator('#gpsfilter').uncheck()
            page.locator('#reset').click()
            with gzip.open(ROOT / 'master_list/data/processing/observations.jsonl.gz', 'rt') as stream:
                cleaned = next(r for line in stream if (r := json.loads(line))['title_source'] != r['title_clean'])
            page.locator('#dataset').select_option(cleaned['dataset'])
            page.locator('#search').fill(cleaned['record_id'])
            expect(page.locator('#rows > tr[data-record-id]')).to_have_count(1)
            expect(page.locator('#rows td.title-cell')).to_contain_text(cleaned['title_clean'])
            assert page.locator('#rows td.title-cell').evaluate('(cell)=>cell.firstChild.textContent') == cleaned['title_clean']
            page.locator('#rows .observation-details summary').click()
            expect(page.locator('#rows .observation-details')).to_contain_text(cleaned['title_source'])
            page.locator('#reset').click()
            page.locator('#dataset').select_option('fmr_nep')
            page.locator('button[data-sort=value]').click()
            amounts = page.locator('#rows td.amount').all_text_contents()
            values = [int(s.replace('₱','').replace(',','')) for s in amounts]
            assert values == sorted(values), 'Value sort is not numeric'
            page.locator('button[data-sort=score]').click()
            scores = [int(s) for s in page.locator('#rows td.evidence .score:not(.applied)').all_text_contents()]
            assert scores == sorted(scores), 'Evidence-score sort is not numeric'
            page.locator('#category').select_option(index=1)
            page.locator('#review').check()
            assert page.locator('#rows tr').count() > 0
            assert page.locator('#rows td.page').evaluate_all('(cells) => cells.every(cell => cell.scrollWidth <= cell.clientWidth)'), 'Page references are clipped'
            page.screenshot(path='/tmp/master-list-desktop.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Unexpected mobile document overflow'
            page.screenshot(path='/tmp/master-list-mobile.png', full_page=True)
            # The cleaned tab consumes the audited release, with distinct
            # selected support and actionable questions instead of raw flags.
            cleaned_manifest=json.loads((ROOT/'master_list/data/cleaned/manifest.json').read_text())
            page.set_viewport_size({'width':1440,'height':1000})
            page.locator('#reset').click()
            page.get_by_role('tab',name='Cleaned data',exact=True).click()
            expect(page.locator('#tab-cleaned')).to_have_attribute('aria-selected','true')
            expect(page.locator('#summary')).to_contain_text('64,645 records')
            expect(page.locator('#cleaned-filters')).to_be_visible()
            expect(page.locator('#interpretation-filter')).to_be_hidden()
            assert page.locator('#main-download').get_attribute('href')=='data/cleaned/observations.csv.gz'
            page.locator('#cleaned-decision').select_option('adopted_candidate')
            expect(page.locator('#summary')).to_contain_text(f"{cleaned_manifest['location_decisions']['adopted_candidate']:,} records")
            page.locator('#reset').click()
            page.locator('#cleaned-status').select_option('ambiguous')
            expect(page.locator('#summary')).to_contain_text(f"{cleaned_manifest['location_statuses']['ambiguous']:,} records")
            page.locator('#reset').click()
            page.locator('#cleaned-flag').select_option('location_conflict')
            expect(page.locator('#summary')).to_contain_text(f"{cleaned_manifest['review_flags']['location_conflict']:,} records")
            page.locator('#rows .clarification button').first.click()
            expect(page.locator('#record-dialog .cleaned-record-section')).to_contain_text('Location details disagree')
            page.locator('#record-dialog .clarification .record-section > summary').first.click()
            expect(page.locator('#record-dialog .clarification pre').first).to_contain_text('coordinate_psgc')
            page.locator('#record-dialog-close').click()
            page.locator('#reset').click()
            page.locator('#review').check()
            expect(page.locator('#summary')).to_contain_text(f"{cleaned_manifest['counts']['with_review_questions']:,} records")
            page.locator('#reset').click()
            page.locator('#cleaned-flag').select_option('none')
            no_questions=cleaned_manifest['counts']['records']-cleaned_manifest['counts']['with_review_questions']
            expect(page.locator('#summary')).to_contain_text(f'{no_questions:,} records')
            page.locator('#reset').click()
            for _ in range(2):
                page.locator('button[data-sort=cleaned_support]').click()
                selected=page.evaluate('filtered.map(r=>r.cleaned.selectedSupport)')
                known=[s for s in selected if s is not None]
                assert selected==known+[None]*(len(selected)-len(known)), 'Unassessed selected support must sort last'
                assert known==sorted(known,reverse=page.evaluate('direction===-1'))
            page.locator('#cleaned-score').fill('7')
            assert page.evaluate('filtered.every(r=>r.cleaned.selectedSupport!=null&&r.cleaned.selectedSupport>=7)')
            page.locator('#reset').click()
            page.locator('#search').fill('dpwh_house_second:c12744')
            cleaned_row=page.locator('#rows > tr.cleaned-row')
            expect(cleaned_row).to_have_count(1)
            expect(cleaned_row.locator('.cleaned-selection')).to_contain_text('Santa Elena')
            expect(cleaned_row.locator('.cleaned-selection')).to_contain_text('1380700009')
            expect(cleaned_row.locator('.cleaned-selection')).to_contain_text('observed coordinate points')
            expect(cleaned_row.locator('.cleaned-support strong')).to_have_text('7')
            expect(cleaned_row.locator('td.evidence > details > summary')).to_have_text('Original master score: 0')
            cleaned_row.locator('.candidate-score-details > summary').click()
            expect(cleaned_row.locator('.candidate-score-details')).to_contain_text('Selected provisionally in the cleaned release')
            page.screenshot(path='/tmp/master-list-cleaned-desktop.png',full_page=True)
            cleaned_row.get_by_role('button',name='View data',exact=True).click()
            expect(page.locator('#record-dialog-title')).to_contain_text('Cleaned record details')
            with page.expect_download() as download_info:
                page.locator('#record-json-download').click()
            downloaded=download_info.value
            assert downloaded.suggested_filename.endswith('.cleaned.json')
            full=json.loads(Path(downloaded.path()).read_text())
            assert full['cleaned_record']['location_resolution']['selected_locations'][0]['psgc_code']=='1380700009'
            assert full['cleaned_evidence']['items']['candidate:1380700009']['score_assessment']['support_score']==7
            assert full['cleaned_evidence']['items']['master_location']['score']==0
            page.locator('#record-dialog-close').click()
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Unexpected cleaned mobile overflow'
            page.screenshot(path='/tmp/master-list-cleaned-mobile.png',full_page=True)
            page.locator('#tab-cleaned').focus()
            page.keyboard.press('ArrowLeft')
            expect(page.locator('#tab-source')).to_have_attribute('aria-selected','true')
            expect(page.locator('#view')).to_have_value('observations')
            # The same relative links resolve correctly when served from repo root.
            base = f'http://127.0.0.1:{server.server_port}'
            response = page.goto(base + '/master_list/#cleaned')
            assert response.status == 200
            expect(page.locator('#search')).to_be_enabled(timeout=60000)
            expect(page.locator('#tab-cleaned')).to_have_attribute('aria-selected','true')
            page.locator('#search').fill('dpwh_house_second:c12744')
            expect(page.locator('#rows .cleaned-selection')).to_contain_text('Santa Elena')
            page.locator('#tab-source').click()
            page.locator('#reset').click()
            page.locator('#view').select_option('observations')
            page.locator('#search').fill('dpwh_house_second:c10725')
            expect(page.locator('#rows > tr[data-record-id]')).to_have_count(1)
            page.locator('#rows button.record-button').click()
            expect(page.locator('#record-dialog .record-summary')).to_contain_text('Camarines Sur 4th District Engineering Office')
            page.locator('#record-dialog-close').click()
            page.locator('#reset').click()
            page.locator('#dataset').select_option('dpwh_house_third')
            url = page.locator('#rows td').nth(5).locator('a').get_attribute('href')
            parsed = urlsplit(url)
            assert parsed.fragment.startswith('page=')
            response = page.request.get(url, headers={'Range': 'bytes=0-31'})
            assert response.status == 206 and response.body().startswith(b'%PDF')
            assert unquote(parsed.path).startswith('/HB_BUDGET_3rd_reading/')
            response = page.request.get(base + '/master_list/data/project_list.csv.gz')
            assert response.status == 200
            for name in ('observations.csv.gz','review_catalog.json'):
                response=page.request.get(base+'/master_list/data/cleaned/'+name)
                assert response.status==200
            browser.close()
        assert not errors, errors
        print(json.dumps({'file_open': True, 'search_filters_sort_pagination': True,
                          'comparison_groups_and_expansion': True, 'outside_scope': True,
                          'clean_and_source_titles': True,
                          'applied_suggestion_layer': True,
                          'candidate_scoring_and_trial_proposals': True,
                          'cleaned_data_tab_and_evidence': True,
                          'location_interpretations': True,
                          'pdf_page_links': True, 'csv_download': True,
                          'desktop_mobile': True, 'browser_errors': errors}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
