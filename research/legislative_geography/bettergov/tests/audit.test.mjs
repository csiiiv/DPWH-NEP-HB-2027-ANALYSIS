import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const report=JSON.parse(readFileSync(new URL("../audit_report.json",import.meta.url),"utf8"));
const manifest=JSON.parse(readFileSync(new URL("../source_manifest.json",import.meta.url),"utf8"));
test("all upstream assets are pinned by commit AND blob hash",()=>{
 assert.match(manifest.upstreamCommit,/^[a-f0-9]{40}$/);
 assert.equal(manifest.pinnedFiles.length,4);
 for(const source of manifest.pinnedFiles)assert.match(source.gitBlobSha1,/^[a-f0-9]{40}$/);
 assert.equal(report.upstream.commit,manifest.upstreamCommit);
});
test("source coverage is not falsely presented as national district coverage",()=>{
 assert.equal(report.measurements.hierarchyCityKeys,136);
 assert.equal(report.measurements.hierarchyBarangayNameRows,7418);
 assert.equal(report.measurements.generatedLocalityRows,1627);
 assert.equal(report.officialControl.geographicLegislativeDistricts,254);
 assert.equal(report.discrepancies.catalogClaimedDistricts,256);
});
test("conflicting city-barangay keys never become verified rows",()=>{
 assert.equal(report.measurements.conflictingPrimaryCityBarangayKeys,253);
 assert.equal(report.conflicts.length,report.measurements.conflictingPrimaryCityBarangayKeys);
 assert.ok(report.conflicts.every(r=>r.provisionalOnly&&r.status==="needs_official_congressional_district_verification"));
});
test("known Butuan reapportionment source problem is exposed",()=>{
 assert.equal(report.discrepancies.generatedButuanUnderAgusanDelNorte,"Lone District");
 assert.equal(report.discrepancies.generatedButuanNeedsReview,true);
});
