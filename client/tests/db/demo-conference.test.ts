import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createVisitorClient } from './supabase-test-client';

// The demo conference that supabase/demo-seed.sql adds for sales calls. Every
// `pnpm db:reset` loads that file, so these tests prove after each reset that
// the file still loads whole, that the files its documents point at were
// uploaded, and that its demo accounts can sign in.
//
// They read with the service-role client, which Row Level Security does not
// limit. That is deliberate: nothing here asks who may see a row, only whether
// the seed wrote the rows it promises. The permission rules have their own
// tests in the other files of this folder.

/** The demo conference's fixed id, from demo-seed.sql. */
const DEMO_CONFERENCE_ID = 'd2000000-0000-4000-8000-000000000001';

/** The password every demo account shares, written down in demo-seed.sql. */
const DEMO_PASSWORD = 'sample-password-123';

/** The four accounts supabase/README.md tells a presenter to sign in as. */
const DEMO_ACCOUNT_EMAILS = [
	'demo.organiser@example.test',
	'demo.chair@example.test',
	'demo.head@example.test',
	'demo.delegate@example.test'
];

/** Counts how many of `values` are equal to `wanted`. */
function countOf(values: string[], wanted: string): number {
	return values.filter((value) => value === wanted).length;
}

describe('the demo conference seed', () => {
	it('is a published conference that has already finished, with its awards published', async () => {
		const supabase = createServiceRoleClient();

		const { data, error } = await supabase
			.from('conferences')
			.select('name, status, end_date, awards_published_at')
			.eq('id', DEMO_CONFERENCE_ID)
			.single();

		expect(error).toBeNull();
		expect(data?.name).toBe('Lisbon Atlantic MUN');
		expect(data?.status).toBe('published');
		expect(data?.awards_published_at).not.toBeNull();

		// Dates are compared as "YYYY-MM-DD" text, which sorts like the dates themselves.
		const today = new Date().toISOString().slice(0, 10);
		expect(String(data?.end_date) < today).toBe(true);
	});

	it('has three committees whose 24 seats are all taken', async () => {
		const supabase = createServiceRoleClient();

		const { data: committees } = await supabase
			.from('committees')
			.select('id')
			.eq('conference_id', DEMO_CONFERENCE_ID);
		const committeeIds = (committees ?? []).map((committee) => committee.id);

		const { data: seats } = await supabase
			.from('seats')
			.select('user_id')
			.in('committee_id', committeeIds);
		const takenSeats = (seats ?? []).filter((seat) => seat.user_id !== null);

		expect(committeeIds).toHaveLength(3);
		expect(seats).toHaveLength(24);
		expect(takenSeats).toHaveLength(24);
	});

	it('has individual applications in every final state and two accepted school delegations', async () => {
		const supabase = createServiceRoleClient();

		const { data: applications } = await supabase
			.from('applications')
			.select('status')
			.eq('conference_id', DEMO_CONFERENCE_ID);
		const applicationStatuses = (applications ?? []).map((application) => application.status);

		const { data: delegations } = await supabase
			.from('delegations')
			.select('status')
			.eq('conference_id', DEMO_CONFERENCE_ID);

		expect(countOf(applicationStatuses, 'accepted')).toBe(12);
		expect(countOf(applicationStatuses, 'rejected')).toBe(1);
		expect(countOf(applicationStatuses, 'waitlisted')).toBe(1);
		expect(countOf(applicationStatuses, 'withdrawn')).toBe(1);
		expect(delegations).toEqual([{ status: 'accepted' }, { status: 'accepted' }]);
	});

	it('has invoices that are mostly paid, with one waived and one unpaid', async () => {
		const supabase = createServiceRoleClient();

		const { data: invoices } = await supabase
			.from('invoices')
			.select('status, quantity, unit_amount_cents, amount_cents')
			.eq('conference_id', DEMO_CONFERENCE_ID);
		const invoiceStatuses = (invoices ?? []).map((invoice) => invoice.status);

		expect(invoices).toHaveLength(14);
		expect(countOf(invoiceStatuses, 'paid')).toBe(12);
		expect(countOf(invoiceStatuses, 'waived')).toBe(1);
		expect(countOf(invoiceStatuses, 'unpaid')).toBe(1);

		for (const invoice of invoices ?? []) {
			expect(invoice.amount_cents).toBe(invoice.quantity * invoice.unit_amount_cents);
		}
	});

	it('has a schedule, announcements and reviewed position papers', async () => {
		const supabase = createServiceRoleClient();

		const { count: eventCount } = await supabase
			.from('schedule_events')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', DEMO_CONFERENCE_ID);
		const { count: announcementCount } = await supabase
			.from('announcements')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', DEMO_CONFERENCE_ID);
		const { data: papers } = await supabase
			.from('documents')
			.select('review_status')
			.eq('conference_id', DEMO_CONFERENCE_ID)
			.eq('kind', 'position_paper');
		const reviewStatuses = (papers ?? []).map((paper) => paper.review_status);

		expect(eventCount).toBe(10);
		expect(announcementCount).toBe(6);
		expect(papers).toHaveLength(23);
		expect(countOf(reviewStatuses, 'approved')).toBe(21);
		expect(countOf(reviewStatuses, 'changes_requested')).toBe(1);
		expect(countOf(reviewStatuses, 'submitted')).toBe(1);
	});

	it('has a position paper written on MUNMeet among the uploaded ones', async () => {
		const supabase = createServiceRoleClient();

		// Switzerland's paper in the Security Council, from demo-seed.sql (T146).
		const { data: paper } = await supabase
			.from('documents')
			.select('storage_path, body_markdown, review_status')
			.eq('id', 'da000000-0000-4000-8000-000000000027')
			.single();

		expect(paper?.storage_path).toBeNull();
		expect(paper?.body_markdown).toContain('## The situation in the Sahel');
		expect(paper?.review_status).toBe('approved');
	});

	it('has a stored file of the recorded size behind every uploaded document', async () => {
		const supabase = createServiceRoleClient();

		// Switzerland's paper was written on MUNMeet (T146), so it has no file to download.
		const { data: documents } = await supabase
			.from('documents')
			.select('storage_path, file_size_bytes')
			.eq('conference_id', DEMO_CONFERENCE_ID)
			.not('storage_path', 'is', null);

		expect(documents).toHaveLength(28);

		for (const document of documents ?? []) {
			if (document.storage_path === null) continue;
			const { data: file, error } = await supabase.storage
				.from('documents')
				.download(document.storage_path);

			expect(error, document.storage_path).toBeNull();
			expect(file?.size, document.storage_path).toBe(document.file_size_bytes);
		}
	});

	it('has a played Security Council session with speeches, motions and a roll-call vote', async () => {
		const supabase = createServiceRoleClient();
		const sessionId = 'db000000-0000-4000-8000-000000000031';

		const { data: session } = await supabase
			.from('committee_sessions')
			.select('status')
			.eq('id', sessionId)
			.single();
		const { count: attendanceCount } = await supabase
			.from('roll_call_entries')
			.select('seat_id', { count: 'exact', head: true })
			.eq('roll_call_id', 'df000000-0000-4000-8000-000000000031');
		const { data: speeches } = await supabase
			.from('speakers_list_entries')
			.select('status, speakers_list:speakers_lists!inner(session_id)')
			.eq('speakers_list.session_id', sessionId)
			.eq('status', 'spoken');
		const { data: motions } = await supabase
			.from('motions')
			.select('status')
			.eq('session_id', sessionId);
		const { data: vote } = await supabase
			.from('votes')
			.select('method, passed, vote_entries(choice)')
			.eq('session_id', sessionId)
			.single();

		expect(session?.status).toBe('ended');
		expect(attendanceCount).toBe(8);
		expect(speeches).toHaveLength(13);
		expect(motions).toHaveLength(4);
		expect(vote?.method).toBe('roll_call');
		expect(vote?.passed).toBe(true);
		expect(vote?.vote_entries).toHaveLength(8);
	});

	it('has four confirmed awards per committee, each naming its winner', async () => {
		const supabase = createServiceRoleClient();

		const { data: awards } = await supabase
			.from('awards')
			.select('status, user_id, committee:committees!inner(conference_id)')
			.eq('committee.conference_id', DEMO_CONFERENCE_ID);
		const confirmedWithWinner = (awards ?? []).filter(
			(award) => award.status === 'confirmed' && award.user_id !== null
		);

		expect(awards).toHaveLength(12);
		expect(confirmedWithWinner).toHaveLength(12);
	});

	it.each(DEMO_ACCOUNT_EMAILS)('lets %s sign in with the demo password', async (email) => {
		const visitor = createVisitorClient();

		const { data, error } = await visitor.auth.signInWithPassword({
			email,
			password: DEMO_PASSWORD
		});

		expect(error).toBeNull();
		expect(data.session).not.toBeNull();
	});
});
