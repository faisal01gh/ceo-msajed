"""TEST ONLY: immutable official migration/section extraction contract."""
import hashlib
import importlib.util
import pathlib
import unittest

FILE = pathlib.Path(__file__).with_name('qa_local_section_fixture.py')
SPEC = importlib.util.spec_from_file_location('local_section', FILE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'supabase/migrations/20261008020000_qa_isolation_enforcement.sql'

class LocalSectionContract(unittest.TestCase):
    def setUp(self):
        self.raw = SOURCE.read_bytes()
        self.sha = hashlib.sha256(self.raw).hexdigest()
    def test_actual_official_section_bound_to_full_file_and_barrier(self):
        result = MODULE.extract_official_section(self.raw, self.sha)
        self.assertEqual(result.full_sha256, self.sha)
        self.assertEqual(result.section_sha256, hashlib.sha256(result.section).hexdigest())
        self.assertIn(b'CREATE OR REPLACE FUNCTION app_private.qa_enforcement_admit', result.section)
        self.assertNotIn(b'DO $blocked$', result.section)
        self.assertIn(b"USING ERRCODE='55000'", result.barrier)
    def test_changed_full_file_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'full-file source drift'):
            MODULE.extract_official_section(self.raw + b'\n', self.sha)
    def test_duplicate_begin_is_rejected(self):
        raw = self.raw + b'\n-- BEGIN LOCAL VERIFIABLE SECTION\n'
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            MODULE.extract_official_section(raw, hashlib.sha256(raw).hexdigest())
    def test_duplicate_end_is_rejected(self):
        raw = self.raw + b'\n-- END LOCAL VERIFIABLE SECTION\n'
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            MODULE.extract_official_section(raw, hashlib.sha256(raw).hexdigest())
    def test_missing_marker_is_rejected(self):
        raw = self.raw.replace(b'-- END LOCAL VERIFIABLE SECTION', b'-- not-an-end-marker')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            MODULE.extract_official_section(raw, hashlib.sha256(raw).hexdigest())
    def test_reversed_markers_are_rejected(self):
        raw = self.raw.replace(b'-- BEGIN LOCAL VERIFIABLE SECTION', b'-- swapped-marker', 1)
        raw = raw.replace(b'-- END LOCAL VERIFIABLE SECTION', b'-- BEGIN LOCAL VERIFIABLE SECTION', 1)
        raw = raw.replace(b'-- swapped-marker', b'-- END LOCAL VERIFIABLE SECTION', 1)
        with self.assertRaisesRegex(ValueError, 'marker order'):
            MODULE.extract_official_section(raw, hashlib.sha256(raw).hexdigest())

if __name__ == '__main__':
    unittest.main()
