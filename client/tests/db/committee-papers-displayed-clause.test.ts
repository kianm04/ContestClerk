import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from './supabase-test-client';
import {
	createPaperCommittee,
	expectSuccess,
	franceSubmitsPaper,
	type PaperCommittee
} from './committee-paper-fixtures';

// Which clause of the paper on the projector is on screen
// (20261009121000_committee_papers_displayed_clause.sql, for
// docs/committee-papers.md section 6): `committee_state.displayed_clause`,
// which the dais steps with "Previous clause" and "Next clause", and the
// trigger `committee_state_reset_displayed_clause`, whose function
// `reset_displayed_clause` starts each paper put on screen at its top.
//
// The dais and the delegates change it through their own clients, so a test
// only passes if the policy lets that person do it. A refused update comes
// back with no row changed, so the room is read back past Row Level Security.

/** Where the projector stands, as the database holds it. */
async function storedScreen(committeeId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_state')
		.select('displayed_paper_id, displayed_clause')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored room: ${error?.message}`);

	return data;
}

/** "Next clause" or "Previous clause", as whoever presses it: the clause the projector moves to. */
function showClause(committee: PaperCommittee, person: 'chair' | 'france', clause: number | null) {
	return committee[person].supabase
		.from('committee_state')
		.update({ displayed_clause: clause })
		.eq('committee_id', committee.committeeId)
		.select('committee_id');
}

describe('committee_state.displayed_clause', () => {
	it('starts a paper at its top when it is introduced, and the dais steps through it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		expect(await storedScreen(committee.committeeId)).toEqual({
			displayed_paper_id: paperId,
			displayed_clause: null
		});

		await expectSuccess(showClause(committee, 'chair', 0));
		await expectSuccess(showClause(committee, 'chair', 2));

		expect((await storedScreen(committee.committeeId)).displayed_clause).toBe(2);
	});

	it('is the dais’s to change, not a delegate’s', async () => {
		const committee = await createPaperCommittee();
		await franceSubmitsPaper(committee);

		const { data, error } = await showClause(committee, 'france', 3);

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect((await storedScreen(committee.committeeId)).displayed_clause).toBeNull();
	});

	it('is never below 0, nor set while no paper is on screen', async () => {
		const committee = await createPaperCommittee();
		await franceSubmitsPaper(committee);

		expect((await showClause(committee, 'chair', -1)).error?.code).toBe('23514');

		await expectSuccess(
			committee.chair.supabase
				.from('committee_state')
				.update({ displayed_paper_id: null })
				.eq('committee_id', committee.committeeId)
		);

		expect((await showClause(committee, 'chair', 1)).error?.code).toBe('23514');
	});
});

describe('reset_displayed_clause', () => {
	it('goes back to the top whenever another paper goes on screen, or none', async () => {
		const committee = await createPaperCommittee();
		const firstPaperId = await franceSubmitsPaper(committee);
		const secondPaperId = await franceSubmitsPaper(committee);
		const showPaper = (paperId: string | null) =>
			committee.chair.supabase
				.from('committee_state')
				.update({ displayed_paper_id: paperId })
				.eq('committee_id', committee.committeeId);

		await expectSuccess(showClause(committee, 'chair', 3));
		await expectSuccess(showPaper(firstPaperId));

		expect(await storedScreen(committee.committeeId)).toEqual({
			displayed_paper_id: firstPaperId,
			displayed_clause: null
		});

		await expectSuccess(showClause(committee, 'chair', 2));
		await expectSuccess(showPaper(null));

		expect(await storedScreen(committee.committeeId)).toEqual({
			displayed_paper_id: null,
			displayed_clause: null
		});

		await expectSuccess(showPaper(secondPaperId));
		await expectSuccess(showClause(committee, 'chair', 1));

		expect((await storedScreen(committee.committeeId)).displayed_clause).toBe(1);
	});

	it('keeps the clause while the same paper stays on screen', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		await expectSuccess(showClause(committee, 'chair', 4));
		await expectSuccess(
			committee.chair.supabase
				.from('committee_state')
				.update({ displayed_paper_id: paperId })
				.eq('committee_id', committee.committeeId)
		);

		expect((await storedScreen(committee.committeeId)).displayed_clause).toBe(4);
	});

	it('goes back to the top when the paper on screen is withdrawn', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		await expectSuccess(showClause(committee, 'chair', 2));
		await expectSuccess(committee.chair.supabase.rpc('withdraw_paper', { paper_id: paperId }));

		expect(await storedScreen(committee.committeeId)).toEqual({
			displayed_paper_id: null,
			displayed_clause: null
		});
	});
});
