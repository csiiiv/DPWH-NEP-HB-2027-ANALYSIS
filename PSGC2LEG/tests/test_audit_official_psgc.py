import tempfile
import unittest
import zipfile
from pathlib import Path
import importlib.util

SPEC = importlib.util.spec_from_file_location("audit_psa", Path(__file__).resolve().parents[1] / "audit_official_psgc.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class TestOfficialPsgcAudit(unittest.TestCase):
    def test_csv_codes_and_leading_zeros(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "test.csv"
            source.write_text(
                "10-digit PSGC,Name,Geographic Level\n"
                "0100000000,Region I (Ilocos Region),Reg\n"
                "0102800000,Ilocos Norte,Prov\n"
                "0102801000,Adams,Mun\n"
                "0102801001,Adams,Bgy\n",
                encoding="utf-8",
            )
            parsed = MOD.extract_rows(source)
            self.assertEqual(parsed["0102801001"]["level"], "Bgy")
            self.assertEqual(len(parsed), 4)
            registry = {"records": {"0102801001": ["Adams", "barangay", "0102801000"]}, "provenance": {}}
            diff = MOD.compare(parsed, registry, "sha", "test.csv")
            self.assertEqual(diff["summary"]["name_mismatch"], 0)
            self.assertEqual(diff["summary"]["official_not_in_mirror"], 3)

    def test_xlsx_without_external_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "psgc.xlsx"
            with zipfile.ZipFile(file, "w") as z:
                z.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="PSGC" sheetId="1" r:id="rId1"/></sheets></workbook>""")
                z.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>""")
                z.writestr("xl/worksheets/sheet1.xml", """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>10-digit PSGC</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c><c r="C1" t="inlineStr"><is><t>Geographic Level</t></is></c></row>
<row r="2"><c r="A2"><v>102800001</v></c><c r="B2" t="inlineStr"><is><t>Adams</t></is></c><c r="C2" t="inlineStr"><is><t>Bgy</t></is></c></row>
</sheetData></worksheet>""")
            parsed = MOD.extract_rows(file)
            self.assertEqual(parsed["0102800001"]["name"], "Adams")

    def test_detect_name_change(self):
        primary = {"1380100001": {"name": "Barangay 1", "level": "Bgy"}}
        mirror = {"records": {"1380100001": ["Barangay One", "barangay", "1380100000"]}, "provenance": {}}
        result = MOD.compare(primary, mirror, "sha", "f.csv")
        self.assertEqual(result["summary"]["name_mismatch"], 1)

    def test_reject_duplicate_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "dupe.csv"
            file.write_text(
                "10-digit PSGC,Name,Geographic Level\n0102801001,Adams,Bgy\n0102801001,Repeat,Bgy\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                MOD.extract_rows(file)


if __name__ == "__main__":
    unittest.main()
