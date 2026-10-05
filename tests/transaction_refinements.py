"""Static acceptance for the 2026-10-05 transaction workflow refinement.
Read-only: no network/database access and no production mutations.
"""
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
app=(repo/'app.js').read_text(encoding='utf-8')
edge=(repo/'supabase/functions/transactions-api/index.ts').read_text(encoding='utf-8')
migration=(repo/'supabase/migrations/20261005182000_transaction_detail_edit_permissions.sql').read_text(encoding='utf-8')
spec=(repo/'docs/transactions/SPEC.md').read_text(encoding='utf-8')
checks={
  'edge-version-34':'version:34' in edge,
  'exec-direct-close':'if(isExec(who.role))return true' in edge,
  'cross-sector-close':'isCrossSector' in edge and 'effectiveCloseAuthority' in edge,
  'close-target-hierarchy':'closeRequestTarget' in edge and 'target_role' in edge,
  'subject-backend':'action==="change_subject"' in edge,
  'unit-backend':'action==="change_responsible_unit"' in edge,
  'priority-reason':'reason_required' in edge and 'old_priority' in edge and 'new_priority' in edge,
  'subject-permission':'transactions.edit_subject' in migration and 'transactions.edit_subject' in app,
  'unit-permission':'transactions.change_responsible_unit' in migration and 'transactions.change_responsible_unit' in app,
  'close-label':'إغلاق المعاملة' in app,
  'requests-label':'الطلبات والاعتمادات' in app,
  'whatsapp-fields':all(x in app for x in ['عنوان المعاملة:','عدد أيام المعاملة:','المطلوب:','الإدارة المسؤولة:','المسؤول عن المعاملة:']),
  'bell-unread':'notification-bell' in app and 'notification-dot' in app,
  'notification-opens-transaction':'notification_read' in app and 'openDetails(row.transaction_id' in app,
  'pdf-history':'سجل المعاملة' in app and 'historyText(h)' in app,
  'list-sequence-column':'["م","رقم المعاملة"' in app,
  'spec-close-hierarchy':'الموظف → مدير الإدارة' in spec and 'مدير الإدارة → المساعد المسؤول' in spec,
  'spec-requested-term':'القرار المقترح' not in spec and 'المطلوب' in spec,
}
failed=[name for name,ok in checks.items() if not ok]
print({'checks':len(checks),'failed':failed})
assert not failed, failed
