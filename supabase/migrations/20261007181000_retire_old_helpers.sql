-- Step 8 of docs/roles-and-permissions.md retires the two helpers the
-- permissions replaced. Migration 20261007180000_committee_permissions moved
-- the last policy and function off them, so nothing in the database asks them
-- any more; the app asks `has_permission` and `has_committee_permission`.
--
--   can_manage_conference(id)  was has_permission(id, 'administrator')
--   is_committee_chair(id)     was has_committee_permission(id, 'run_room')
--
-- `drop function` without `cascade` fails if anything still depended on them,
-- which is the check that nothing does.

drop function public.can_manage_conference(uuid);
drop function public.is_committee_chair(uuid);
