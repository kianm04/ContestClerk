import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSession,
	addStaff,
	createCommitteeRoom
} from './conference-fixtures';

// The Row Level Security of `committee_session_notes` (T130), the chair's
// running notes on one session. permissions.md gives the table to "chair"
// and to nobody else, the way `chair_notes` is: a chair of the committee or an
// organiser of the conference reads and writes it, and a delegate, a volunteer
// and a stranger never see it. The `stamp_committee_session_notes` trigger
// records who saved last and moves the revision on, which is what keeps two
// chairs from wiping each other out.
//
// As in `committee-room.test.ts`, a refused insert comes back as an error
// naming "row-level security", while a refused select or update comes back
// empty, so those tests read the row back with a client that can see it.

/** A pad for the fixture session, started by the committee's chair. */
async function startNotes(
	room: Awaited<ReturnType<typeof createCommitteeRoom>>,
	sessionId: string,
	body = 'Opening speeches strong on **sanctions**.'
) {
	const { data, error } = await room.chair.supabase
		.from('committee_session_notes')
		.insert({ session_id: sessionId, committee_id: room.committeeId, body })
		.select('body, revision, updated_by')
		.single();

	if (error || !data) {
		throw new Error(`Could not start the fixture session notes: ${error?.message}`);
	}

	return data;
}

describe('committee_session_notes, who may read and write them', () => {
	it('lets a chair start the notes and records them as the first revision in their name', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const written = await startNotes(room, sessionId);

		expect(written).toEqual({
			body: 'Opening speeches strong on **sanctions**.',
			revision: 1,
			updated_by: room.chair.userId
		});
	});

	it('lets a co-chair save over them, moving the revision on and naming the co-chair', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		await startNotes(room, sessionId);
		const coChair = await createSignedInClient('Fixture Co-Chair');
		await addChair(room.supabase, room.committeeId, coChair.userId);

		// The page saves only while the revision is still the one it started
		// from, so a second chair's save names revision 1.
		const { data, error } = await coChair.supabase
			.from('committee_session_notes')
			.update({ body: 'Bloc forming around France.' })
			.eq('session_id', sessionId)
			.eq('revision', 1)
			.select('body, revision, updated_by');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ body: 'Bloc forming around France.', revision: 2, updated_by: coChair.userId }
		]);

		// A save that started from revision 1 again finds nothing to change,
		// which is how the page learns somebody else saved in between.
		const { data: stale } = await room.chair.supabase
			.from('committee_session_notes')
			.update({ body: 'An older draft.' })
			.eq('session_id', sessionId)
			.eq('revision', 1)
			.select('revision');

		expect(stale).toEqual([]);
	});

	it('does not let a chair choose the revision or the name the notes are saved under', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const coChair = await createSignedInClient('Fixture Co-Chair');
		await addChair(room.supabase, room.committeeId, coChair.userId);

		const { data, error } = await room.chair.supabase
			.from('committee_session_notes')
			.insert({
				session_id: sessionId,
				committee_id: room.committeeId,
				body: 'Said to be the co-chair’s.',
				revision: 40,
				updated_by: coChair.userId
			})
			.select('revision, updated_by')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({ revision: 1, updated_by: room.chair.userId });
	});

	it('lets the organiser read and save them', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		await startNotes(room, sessionId);

		const { data, error } = await room.supabase
			.from('committee_session_notes')
			.update({ body: 'Organiser was here.' })
			.eq('session_id', sessionId)
			.select('body');

		expect(error).toBeNull();
		expect(data).toEqual([{ body: 'Organiser was here.' }]);
	});

	it('shows the notes to nobody else: not the delegate, not a volunteer', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		await startNotes(room, sessionId);

		const { data: delegateSees, error } = await room.delegate.supabase
			.from('committee_session_notes')
			.select('body')
			.eq('session_id', sessionId);

		expect(error).toBeNull();
		expect(delegateSees).toEqual([]);

		const volunteer = await createSignedInClient('Fixture Volunteer');
		await addStaff(room.supabase, room.conferenceId, volunteer.userId, 'volunteer');

		const { data: volunteerSees } = await volunteer.supabase
			.from('committee_session_notes')
			.select('body')
			.eq('session_id', sessionId);

		expect(volunteerSees).toEqual([]);
	});

	it('refuses a delegate writing or rewriting the notes', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { error: insertError } = await room.delegate.supabase
			.from('committee_session_notes')
			.insert({ session_id: sessionId, committee_id: room.committeeId, body: 'Mine.' });

		expect(insertError?.message).toContain('row-level security');

		await startNotes(room, sessionId, 'The chair’s own words.');

		await room.delegate.supabase
			.from('committee_session_notes')
			.update({ body: 'Rewritten by a delegate.' })
			.eq('session_id', sessionId);

		const { data: left } = await room.chair.supabase
			.from('committee_session_notes')
			.select('body')
			.eq('session_id', sessionId);

		expect(left).toEqual([{ body: 'The chair’s own words.' }]);
	});

	it("refuses a chair filing notes against another committee's session", async () => {
		const room = await createCommitteeRoom();
		const otherCommitteeId = await addCommittee(
			room.supabase,
			room.conferenceId,
			'Human Rights Council'
		);
		const otherChair = await createSignedInClient('Fixture Other Chair');
		await addChair(room.supabase, otherCommitteeId, otherChair.userId);
		const otherSessionId = await addSession(otherChair.supabase, otherCommitteeId);

		// The chair is a real chair of the committee the row names, so only the
		// "the session belongs to that committee" half can turn them away.
		const { error } = await room.chair.supabase.from('committee_session_notes').insert({
			session_id: otherSessionId,
			committee_id: room.committeeId,
			body: 'Notes on a room that is not mine.'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('keeps the notes with their session', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const secondSessionId = await addSession(room.chair.supabase, room.committeeId, 'Session II');
		await startNotes(room, sessionId);

		const { error } = await room.chair.supabase
			.from('committee_session_notes')
			.update({ session_id: secondSessionId })
			.eq('session_id', sessionId);

		expect(error?.message).toContain('Session notes stay with their session.');
	});
});

// T144 stores the notes as Markdown. Its migration rewrote the HTML the old
// editor saved with `session_notes_markdown_from_html`, which stays behind for
// this test. The row below holds every tag the old editor could save.
describe('committee_session_notes, the old HTML turned into Markdown', () => {
	const OLD_HTML =
		'<h3>Opening</h3><p>Ghana <b>yields</b> to <i>France</i> &amp; <u>Chile</u>, not a*b</p>' +
		'<ul><li>one</li><li><strong>two</strong></li></ul><ol><li>first</li><li>second</li></ol>' +
		'<p>line<br>next</p><p><br></p>' +
		'<div><a href="https://www.un.org/en/" rel="noopener noreferrer">UN site</a> 1 &lt; 2&nbsp;&nbsp;it&#39;s</div>';

	const MARKDOWN = [
		'### Opening',
		'',
		'Ghana **yields** to *France* & ++Chile++, not a\\*b',
		'',
		'- one',
		'- **two**',
		'',
		'1. first',
		'1. second',
		'',
		'line\\',
		'next',
		'',
		"[UN site](<https://www.un.org/en/>) 1 \\< 2  it's"
	].join('\n');

	it('turns a row of the old HTML into the same notes in Markdown', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const stored = await startNotes(room, sessionId, OLD_HTML);

		const admin = createServiceRoleClient();
		const { data, error } = await admin.rpc('session_notes_markdown_from_html', {
			html: stored.body
		});

		expect(error).toBeNull();
		expect(data).toBe(MARKDOWN);
	});

	it('keeps the conversion from anybody but the service role', async () => {
		const room = await createCommitteeRoom();

		const { error } = await room.chair.supabase.rpc('session_notes_markdown_from_html', {
			html: '<p>Hi</p>'
		});

		expect(error?.message).toContain('permission denied');
	});
});
