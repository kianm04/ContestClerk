import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	approvePositionPapers,
	approveSubmittedPapers,
	listPaperSeats,
	positionPaperOverview,
	readWrittenPaperBody,
	reviewCommitteePaper,
	reviewPositionPaper
} from './paper-reviews';

// These tests are about what this module works out from the rows it reads, and
// which rows it asks to change. The stand-in below writes down every query and
// answers each relation with fixed rows; it does not filter them. Whether the
// database lets an organiser write a review at all is tested in `tests/db/`.

/** What one query the module sent was asking for. */
type RecordedQuery = {
	table: string;
	/** The row `.update(...)` was given, or `null` when the query did not update. */
	updated: Record<string, unknown> | null;
	/** Every filter, as `[method, column, value]`, in the order it was added. */
	filters: [string, string, unknown][];
};

/** What the stand-in answers with. */
type StandInAnswers = {
	/** The rows each relation gives back, whatever the filters say. */
	rows?: Record<string, unknown[]>;
	/** The message an update fails with. Nothing means updating works. */
	writeError?: string;
	/** The Postgres code that comes with `writeError`, such as `22P02` for a bad id. */
	writeErrorCode?: string;
};

/** A Supabase client that records queries and answers from `answers`. */
function makeStandIn(answers: StandInAnswers = {}) {
	const queries: RecordedQuery[] = [];

	function from(table: string) {
		const query: RecordedQuery = { table, updated: null, filters: [] };
		queries.push(query);

		function answer() {
			if (query.updated && answers.writeError) {
				const error = { message: answers.writeError, code: answers.writeErrorCode };
				return Promise.resolve({ data: null, error });
			}

			return Promise.resolve({ data: answers.rows?.[table] ?? [], error: null });
		}

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			order: () => builder,
			update: (row: Record<string, unknown>) => {
				query.updated = row;
				return builder;
			},
			eq: (column: string, value: unknown) => filter('eq', column, value),
			neq: (column: string, value: unknown) => filter('neq', column, value),
			in: (column: string, value: unknown) => filter('in', column, value),
			not: (column: string, operator: string, value: unknown) => filter('not', column, value),
			overrideTypes: answer
		};

		function filter(method: string, column: string, value: unknown) {
			query.filters.push([method, column, value]);
			return builder;
		}

		return builder;
	}

	const storage = {
		from: () => ({
			createSignedUrls: (paths: string[]) =>
				Promise.resolve({
					data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
					error: null
				})
		})
	};

	const supabase = { from, storage } as unknown as SupabaseClient;

	return { supabase, queries };
}

describe('positionPaperOverview', () => {
	it('counts every filled seat once, so the four counts add up to the filled seats', async () => {
		const { supabase } = makeStandIn({
			rows: {
				committees: [
					{ id: 'unsc', slug: 'unsc', name: 'Security Council', abbreviation: 'UNSC' },
					{ id: 'who', slug: 'who', name: 'World Health Organization', abbreviation: null }
				],
				seats: [
					{ id: 'seat-1', committee_id: 'unsc' },
					{ id: 'seat-2', committee_id: 'unsc' },
					{ id: 'seat-3', committee_id: 'unsc' },
					{ id: 'seat-4', committee_id: 'unsc' },
					{ id: 'seat-5', committee_id: 'who' }
				],
				documents: [
					{ seat_id: 'seat-1', review_status: 'approved' },
					{ seat_id: 'seat-2', review_status: 'submitted' },
					{ seat_id: 'seat-3', review_status: 'changes_requested' }
				]
			}
		});

		const rows = await positionPaperOverview(supabase, 'conference-1');

		expect(rows).toEqual([
			{
				committeeId: 'unsc',
				committeeSlug: 'unsc',
				committeeHeading: 'UNSC',
				filledSeatCount: 4,
				counts: { missing: 1, submitted: 1, approved: 1, changes_requested: 1 }
			},
			{
				committeeId: 'who',
				committeeSlug: 'who',
				committeeHeading: 'World Health Organization',
				filledSeatCount: 1,
				counts: { missing: 1, submitted: 0, approved: 0, changes_requested: 0 }
			}
		]);
	});

	it('reads only seats with a delegate in them', async () => {
		const { supabase, queries } = makeStandIn({
			rows: {
				committees: [{ id: 'unsc', slug: 'unsc', name: 'Security Council', abbreviation: 'UNSC' }]
			}
		});

		await positionPaperOverview(supabase, 'conference-1');

		const seatQuery = queries.find((query) => query.table === 'seats');
		expect(seatQuery?.filters).toContainEqual(['not', 'user_id', null]);
	});

	it('reads nothing more when the conference has no committees', async () => {
		const { supabase, queries } = makeStandIn();

		expect(await positionPaperOverview(supabase, 'conference-1')).toEqual([]);
		expect(queries.map((query) => query.table)).toEqual(['committees']);
	});
});

describe('listPaperSeats', () => {
	it('joins each seat to its delegate and its paper, with a one-minute link', async () => {
		const { supabase } = makeStandIn({
			rows: {
				seats: [
					{ id: 'seat-1', name: 'France', country_code: 'FR', user_id: 'user-1' },
					{ id: 'seat-2', name: 'Chile', country_code: 'CL', user_id: 'user-2' }
				],
				documents: [
					{
						id: 'paper-1',
						seat_id: 'seat-1',
						file_name: 'france.pdf',
						review_status: 'submitted',
						review_comment: null,
						reviewed_at: null,
						updated_at: '2027-01-10T09:00:00Z',
						storage_path: 'conference-1/papers/seat-1.pdf',
						body_markdown: null
					}
				],
				profiles: [{ id: 'user-1', full_name: 'Amélie Laurent', avatar_path: null }]
			}
		});

		const seats = await listPaperSeats(supabase, 'conference-1', 'unsc');

		expect(seats[0]).toEqual({
			seatId: 'seat-1',
			seatName: 'France',
			countryCode: 'FR',
			delegateName: 'Amélie Laurent',
			delegateAvatarPath: null,
			status: 'submitted',
			paper: {
				id: 'paper-1',
				fileName: 'france.pdf',
				reviewStatus: 'submitted',
				reviewComment: null,
				reviewedAt: null,
				updatedAt: '2027-01-10T09:00:00Z',
				downloadUrl: 'https://signed/conference-1/papers/seat-1.pdf',
				isWritten: false
			}
		});
		// A seat without a paper is missing, and a profile the organiser cannot read has no name.
		expect(seats[1]).toMatchObject({ status: 'missing', paper: null, delegateName: null });
	});
});

describe('listPaperSeats with a written paper', () => {
	it('marks a paper written on MUNMeet, signs no link for it and sends no text', async () => {
		const { supabase } = makeStandIn({
			rows: {
				seats: [{ id: 'seat-1', name: 'France', country_code: 'FR', user_id: 'user-1' }],
				documents: [
					{
						id: 'paper-1',
						seat_id: 'seat-1',
						file_name: null,
						review_status: 'submitted',
						review_comment: null,
						reviewed_at: null,
						updated_at: '2027-01-10T09:00:00Z',
						storage_path: null,
						body_markdown: 'France **supports** the treaty.'
					}
				],
				profiles: []
			}
		});

		const seats = await listPaperSeats(supabase, 'conference-1', 'unsc');

		expect(seats[0].paper).toMatchObject({ fileName: null, downloadUrl: null, isWritten: true });
		// The text is read only by the reading page, one paper at a time.
		expect(seats[0].paper).not.toHaveProperty('bodyHtml');
	});
});

describe('readWrittenPaperBody', () => {
	it("reads one paper's Markdown, asking for it by committee as well as by id", async () => {
		const { supabase, queries } = makeStandIn({
			rows: { documents: [{ body_markdown: 'France **supports** the treaty.' }] }
		});

		const markdown = await readWrittenPaperBody(supabase, 'unsc', 'paper-1');

		expect(markdown).toBe('France **supports** the treaty.');
		expect(queries[0].filters).toEqual([
			['eq', 'id', 'paper-1'],
			['eq', 'committee_id', 'unsc'],
			['eq', 'kind', 'position_paper']
		]);
	});

	it('answers null when there is no such paper, or it is an uploaded file', async () => {
		const missing = makeStandIn({ rows: { documents: [] } });
		const uploaded = makeStandIn({ rows: { documents: [{ body_markdown: null }] } });

		expect(await readWrittenPaperBody(missing.supabase, 'unsc', 'paper-1')).toBeNull();
		expect(await readWrittenPaperBody(uploaded.supabase, 'unsc', 'paper-1')).toBeNull();
	});
});

describe('reviewPositionPaper', () => {
	it('writes the review columns on one position paper of this conference', async () => {
		const { supabase, queries } = makeStandIn({ rows: { documents: [{ id: 'paper-1' }] } });

		const wasReviewed = await reviewPositionPaper(
			supabase,
			'conference-1',
			'paper-1',
			{ status: 'changes_requested', comment: 'Cite your sources.' },
			'organiser-1'
		);

		expect(wasReviewed).toBe(true);
		expect(queries[0].updated).toMatchObject({
			review_status: 'changes_requested',
			review_comment: 'Cite your sources.',
			reviewed_by: 'organiser-1'
		});
		expect(typeof queries[0].updated?.reviewed_at).toBe('string');
		expect(queries[0].filters).toEqual([
			['eq', 'id', 'paper-1'],
			['eq', 'conference_id', 'conference-1'],
			['eq', 'kind', 'position_paper']
		]);
	});

	it('answers false when no row changed, which is how a refused update looks', async () => {
		const { supabase } = makeStandIn();

		const review = { status: 'approved', comment: null } as const;
		expect(await reviewPositionPaper(supabase, 'conference-1', 'paper-9', review, 'x')).toBe(false);
	});

	it('throws when the database reports an error', async () => {
		const { supabase } = makeStandIn({ writeError: 'permission denied' });

		const review = { status: 'approved', comment: null } as const;
		await expect(reviewPositionPaper(supabase, 'c', 'p', review, 'x')).rejects.toThrow(
			'permission denied'
		);
	});

	it('answers false for an id that is not a uuid, rather than failing the page', async () => {
		const { supabase } = makeStandIn({
			writeError: 'invalid input syntax',
			writeErrorCode: '22P02'
		});

		const review = { status: 'approved', comment: null } as const;
		expect(await reviewPositionPaper(supabase, 'c', 'not-an-id', review, 'x')).toBe(false);
	});
});

describe('reviewCommitteePaper', () => {
	it('reviews the paper only when it belongs to this committee', async () => {
		const { supabase, queries } = makeStandIn({ rows: { documents: [{ id: 'paper-1' }] } });

		const wasReviewed = await reviewCommitteePaper(
			supabase,
			'committee-1',
			'paper-1',
			{ status: 'approved', comment: 'Well argued.' },
			'chair-1'
		);

		expect(wasReviewed).toBe(true);
		expect(queries[0].updated).toMatchObject({
			review_status: 'approved',
			review_comment: 'Well argued.',
			reviewed_by: 'chair-1'
		});
		expect(queries[0].filters).toEqual([
			['eq', 'id', 'paper-1'],
			['eq', 'committee_id', 'committee-1'],
			['eq', 'kind', 'position_paper']
		]);
	});

	it("answers false for another committee's paper, which no row matches", async () => {
		const { supabase } = makeStandIn();

		const review = { status: 'approved', comment: null } as const;
		expect(await reviewCommitteePaper(supabase, 'committee-1', 'paper-9', review, 'x')).toBe(false);
	});
});

describe('approveSubmittedPapers', () => {
	it('approves only the papers of this committee that are awaiting review', async () => {
		const { supabase, queries } = makeStandIn({
			rows: { documents: [{ id: 'paper-1' }, { id: 'paper-2' }] }
		});

		const approvedCount = await approveSubmittedPapers(supabase, 'committee-1', 'chair-1');

		expect(approvedCount).toBe(2);
		expect(queries[0].updated).toMatchObject({
			review_status: 'approved',
			review_comment: null,
			reviewed_by: 'chair-1'
		});
		expect(queries[0].filters).toEqual([
			['eq', 'committee_id', 'committee-1'],
			['eq', 'kind', 'position_paper'],
			['eq', 'review_status', 'submitted']
		]);
	});

	it('throws when the database reports an error', async () => {
		const { supabase } = makeStandIn({ writeError: 'permission denied' });

		await expect(approveSubmittedPapers(supabase, 'committee-1', 'chair-1')).rejects.toThrow(
			'permission denied'
		);
	});
});

describe('approvePositionPapers', () => {
	it('skips papers that are already approved and counts the ones that changed', async () => {
		const { supabase, queries } = makeStandIn({
			rows: { documents: [{ id: 'paper-1' }, { id: 'paper-2' }] }
		});

		const approvedCount = await approvePositionPapers(
			supabase,
			'conference-1',
			['paper-1', 'paper-2', 'paper-3'],
			'organiser-1'
		);

		expect(approvedCount).toBe(2);
		expect(queries[0].updated).toMatchObject({ review_status: 'approved', review_comment: null });
		expect(queries[0].filters).toContainEqual(['neq', 'review_status', 'approved']);
		expect(queries[0].filters).toContainEqual(['in', 'id', ['paper-1', 'paper-2', 'paper-3']]);
	});

	it('sends nothing for an empty list', async () => {
		const { supabase, queries } = makeStandIn();

		expect(await approvePositionPapers(supabase, 'conference-1', [], 'organiser-1')).toBe(0);
		expect(queries).toEqual([]);
	});
});
