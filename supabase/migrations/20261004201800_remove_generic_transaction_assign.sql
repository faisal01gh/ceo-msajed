-- Remove superseded generic transaction routing permission.
-- Granular routing permissions are now authoritative.

delete from public.permissions
where code='transactions.assign';
