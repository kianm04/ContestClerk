import { createServiceRoleClient } from '../db/supabase-test-client';
import type { TestUser } from './signed-in-user';

// The walkthrough seed (`supabase/walkthrough-seed.sql`) from a browser test's
// side: its accounts, which the click-budget tests walk as, and a way to put
// its rows back after a walk has changed them.
//
// The click budgets are walked on the seed's own readers, conferences and days
// (`specs/03-design/streamlining/design.md`, "Where each budget is walked"), so
// T163's walk by hand finds the seed as the audit did. A walk that changes a
// seed row (starts a session, proposes an award) therefore has to put it back:
// take a `snapshotSeedRows` before the walk and hand it to `restoreSeedRows` in
// a `finally` after it.

/** The password of every walkthrough account, written down in the seed file. */
export const WALKTHROUGH_PASSWORD = 'sample-password-123';

/** Samuel Osei, who chairs the Human Rights Council of "about to start" and organises nothing. */
export const SAMUEL: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000012',
	email: 'walk.chair.upcoming@example.test',
	fullName: 'Samuel Osei',
	password: WALKTHROUGH_PASSWORD
};

/** Fiona Campbell, who chairs the Security Council of "running today", in session on day 2 of 3. */
export const FIONA: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000011',
	email: 'walk.chair.live@example.test',
	fullName: 'Fiona Campbell',
	password: WALKTHROUGH_PASSWORD
};

/** Eleanor Whitfield, who owns Northbridge MUN Society and organises all five conferences. */
export const ELEANOR: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000001',
	email: 'walk.organiser@example.test',
	fullName: 'Eleanor Whitfield',
	password: WALKTHROUGH_PASSWORD
};

/** James Wilson, who holds the United Kingdom in the Security Council of "running today". */
export const JAMES: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000061',
	email: 'walk.delegate.live@example.test',
	fullName: 'James Wilson',
	password: WALKTHROUGH_PASSWORD
};

/**
 * Maya Thompson, who holds Canada in the Human Rights Council of "about to
 * start", with an unpaid invoice and a position paper sent back for changes.
 */
export const MAYA: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000051',
	email: 'walk.delegate.upcoming@example.test',
	fullName: 'Maya Thompson',
	password: WALKTHROUGH_PASSWORD
};

/**
 * Rachel Morgan, head of St Aidan's Academy, a draft delegation of three at
 * "applications open" that she has not sent to the organisers yet.
 */
export const RACHEL: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000031',
	email: 'walk.head.open@example.test',
	fullName: 'Rachel Morgan',
	password: WALKTHROUGH_PASSWORD
};

/** Tom Hughes, a runner on the volunteer team of "running today". */
export const TOM: TestUser = {
	id: 'f5000000-0000-4000-8000-000000000021',
	email: 'walk.volunteer.live@example.test',
	fullName: 'Tom Hughes',
	password: WALKTHROUGH_PASSWORD
};

/**
 * Which rows to keep: every row of `table` whose `column` equals `value`, such
 * as the `committees` whose `conference_id` is one conference's. The table has
 * to have an `id` column, which is how the rows are told apart when they are
 * put back.
 */
export type SeedRowScope = {
	table: string;
	column: string;
	value: string;
};

/** The rows of one scope as they were before a walk. */
export type SeedRowSnapshot = {
	scope: SeedRowScope;
	rows: Record<string, unknown>[];
};

/** Read the rows of `scope` as they are now, to put back after a walk. */
export async function snapshotSeedRows(scope: SeedRowScope): Promise<SeedRowSnapshot> {
	// The service-role client, because a walk may change rows its reader is not
	// allowed to read back, and Row Level Security does not limit this one.
	const admin = createServiceRoleClient();
	const { data, error } = await admin.from(scope.table).select('*').eq(scope.column, scope.value);

	if (error || !data) {
		throw new Error(`Could not read the ${scope.table} rows to keep: ${error?.message}`);
	}

	return { scope, rows: data };
}

/**
 * Put the rows of a snapshot back as they were: delete every row of its scope
 * that the walk added, then write every kept row back over what the walk made
 * of it. A column a trigger stamps on every change, such as `updated_at`, takes
 * the moment of the restore, because the trigger fires on the write back too.
 */
export async function restoreSeedRows(snapshot: SeedRowSnapshot): Promise<void> {
	const admin = createServiceRoleClient();
	const { table, column, value } = snapshot.scope;
	const keptIds = snapshot.rows.map((row) => String(row.id));

	// Every row of the scope whose id the snapshot does not hold. PostgREST
	// writes "not in this list" as `not.in.(a,b)`. With nothing kept, every row
	// of the scope is one the walk added.
	let addedRows = admin.from(table).delete().eq(column, value);

	if (keptIds.length > 0) {
		addedRows = addedRows.not('id', 'in', `(${keptIds.join(',')})`);
	}

	const { error: deleteError } = await addedRows;

	if (deleteError) {
		throw new Error(`Could not remove the ${table} rows a walk added: ${deleteError.message}`);
	}

	if (snapshot.rows.length === 0) {
		return;
	}

	const { error: writeError } = await admin.from(table).upsert(snapshot.rows, { onConflict: 'id' });

	if (writeError) {
		throw new Error(`Could not put the ${table} rows back: ${writeError.message}`);
	}
}
