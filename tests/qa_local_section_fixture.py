"""TEST ONLY: immutable official SQL extraction; no substitute product DDL."""
import hashlib
import json
import pathlib
import re
from datetime import datetime, timezone
from typing import NamedTuple

BEGIN_MARKER = b'-- BEGIN LOCAL VERIFIABLE SECTION'
END_MARKER = b'-- END LOCAL VERIFIABLE SECTION'
MIGRATIONS = ('20261008010000_qa_isolation_prerequisites.sql',
 '20261008015000_qa_password_transport.sql', '20261008018000_qa_rest_provenance.sql',
 '20261008018500_qa_core_rest_admission.sql', '20261008019000_qa_typed_producer_references.sql',
 '20261008019500_qa_delete_completion.sql', '20261008020000_qa_isolation_enforcement.sql',
 '20261008020500_qa_password_frame_composition.sql')

class OfficialSection(NamedTuple):
    full_sha256: str
    section_sha256: str
    barrier_sha256: str
    section: bytes
    barrier: bytes

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def extract_official_section(raw, expected_sha256):
    if digest(raw) != expected_sha256:
        raise ValueError('full-file source drift')
    if raw.count(BEGIN_MARKER) != 1 or raw.count(END_MARKER) != 1:
        raise ValueError('expected exactly one beginning and one end marker')
    begin, end = raw.index(BEGIN_MARKER), raw.index(END_MARKER)
    if end <= begin:
        raise ValueError('marker order invalid')
    start = raw.find(b'\n', begin)
    if start < 0 or start >= end:
        raise ValueError('beginning marker has no complete source line')
    if raw[begin + len(BEGIN_MARKER):start].strip():
        raise ValueError('unexpected beginning marker suffix')
    section = raw[start + 1:end]
    barriers = re.findall(rb'DO \$blocked\$[\s\S]*?END \$blocked\$;', raw)
    if len(barriers) != 1 or raw.index(barriers[0]) >= begin:
        raise ValueError('expected one original barrier before the local section')
    barrier = barriers[0]
    expected = (b"DO $blocked$ BEGIN RAISE EXCEPTION 'qa_enforcement_not_ready: "
                b"prerequisite/legacy8/password/REST/cascade/closure acceptance incomplete' "
                b"USING ERRCODE='55000'; END $blocked$;")
    if barrier != expected:
        raise ValueError('unconditional activation barrier bytes differ')
    return OfficialSection(digest(raw), digest(section), digest(barrier), section, barrier)

class LocalMigrationManifest:
    """Append-only receipts per clean fixture; never mutate the SQL catalog."""
    def __init__(self, path, identity, source_pins):
        self.path = pathlib.Path(path)
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding='utf-8'))
            if self.data['target_identity'] != identity or self.data['source_pins'] != source_pins:
                raise ValueError('manifest identity/source binding drift')
        else:
            self.data = {'target_identity': identity, 'source_pins': source_pins, 'entries': []}
        self.save()
    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2), encoding='utf-8')
    def already_recorded(self, name, kind, sha):
        existing = [e for e in self.data['entries'] if e['migration_name'] == name and e['application_kind'] == kind]
        if len(existing) > 1:
            raise ValueError('duplicate migration receipt')
        if existing and existing[0]['source_sha256'] != sha:
            raise ValueError('recorded migration source drift')
        return bool(existing)
    def record(self, name, kind, sha, status, section_sha256=None):
        if self.already_recorded(name, kind, sha):
            return False
        if name not in MIGRATIONS or sha != self.data['source_pins'][name]:
            raise ValueError('unbound migration source')
        receipt = {'migration_name': name, 'source_sha256': sha,
                   'application_kind': kind, 'apply_order': len(self.data['entries']) + 1,
                   'timestamp': datetime.now(timezone.utc).isoformat(), 'status': status,
                   'target_identity': self.data['target_identity']}
        if name == MIGRATIONS[6]:
            receipt['full_apply_status'] = 'blocked_by_activation_guard'
            receipt['local_verifiable_section_status'] = ('applied_for_local_test' if kind == 'local_section' else 'not_applied')
            receipt['section_sha256'] = section_sha256
            if kind == 'full' and status != 'blocked_by_activation_guard':
                raise ValueError('full200 can never be recorded applied')
        self.data['entries'].append(receipt)
        self.save()
        return True

