import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { ChairCommittee } from '$lib/chair-room';
import type { CommitteePaper, PaperCommittee, PaperPerson } from '$lib/committee-papers';
import type { Conference } from '$lib/conferences';

// The gate and the reads are stood in for, so these tests are about what the
// route decides on top of them: which papers have a record copy, and what it
// says. Drawing the text and the words stay real.
vi.mock('$lib/server/access', () => ({ requireRoomWatcher: vi.fn() }));
vi.mock('$lib/server/committee-papers', () => ({
	readCommitteePaper: vi.fn(),
	readPaperCommittee: vi.fn(),
	readPaperPeople: vi.fn()
}));
vi.mock('$lib/server/paper-votes', () => ({
	readAmendmentVotes: vi.fn(),
	readPaperDecidedAt: vi.fn(),
	readPaperVote: vi.fn()
}));
vi.mock('$lib/server/paper-amendments', () => ({
	readPaperAmendments: vi.fn(),
	readPaperVersions: vi.fn()
}));

import { requireRoomWatcher } from '$lib/server/access';
import {
	readCommitteePaper,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { readPaperAmendments, readPaperVersions } from '$lib/server/paper-amendments';
import { readAmendmentVotes, readPaperDecidedAt, readPaperVote } from '$lib/server/paper-votes';
import type { PaperAmendment } from '$lib/paper-amendments';
import type { ClauseContent } from '$lib/paper-clauses';

const SUPABASE = {};

const CONFERENCE = {
	id: 'conference-1',
	slug: 'northbridge-2027',
	name: 'Northbridge Model United Nations 2027',
	timezone: 'Europe/London'
} as Conference;

const COMMITTEE = {
	id: 'committee-1',
	slug: 'disec',
	name: 'Disarmament and International Security Committee',
	abbreviation: 'DISEC'
} as ChairCommittee;

const SETTINGS = { paperWords: 'sponsors_and_signatories' } as PaperCommittee;

const AUSTRIA: PaperPerson = {
	seatId: 'seat-at',
	seatName: 'Austria',
	countryCode: 'AT',
	holderId: null,
	holderName: null,
	role: 'author',
	isLead: true,
	isMine: false
};

/** Draft resolution 1.1, passed. Tests spread it and change what they need. */
const PASSED = {
	id: 'paper-1',
	kind: 'draft_resolution',
	status: 'passed',
	title: 'Human control over autonomous weapons',
	topic: 'Lethal autonomous weapons systems',
	topicNumber: 1,
	sequence: 1,
	leadSeatId: 'seat-at',
	body: '1. Calls upon all Member States to negotiate;',
	updatedAt: '2027-03-15T10:00:00Z'
} as CommitteePaper;

const SUBMITTED: ClauseContent = {
	preamble: [],
	operative: [
		{ id: 'o1', markdown: 'Calls upon all Member States to negotiate;', children: [] },
		{ id: 'o2', markdown: 'Requests a report;', children: [] }
	]
};

/** The text once amendment 1, striking clause 2, has passed. */
const AMENDED: ClauseContent = { preamble: [], operative: [SUBMITTED.operative[0]] };

/** Amendment 1, striking clause 2, which passed. */
const STRIKE = {
	id: 'amendment-1',
	sequence: 1,
	proposerName: 'United States',
	action: 'strike',
	targetPart: 'operative',
	targetClauseId: 'o2',
	textMarkdown: null,
	parentAmendmentId: null,
	status: 'passed',
	isFriendly: false,
	basedOnVersionId: 'version-1',
	decidedAt: '2027-03-16T15:00:00Z'
} as PaperAmendment;

function makeEvent(): PageServerLoadEvent {
	return {
		params: { slug: 'northbridge-2027', committeeSlug: 'disec', paperId: 'paper-1' },
		url: new URL(
			'http://localhost/conferences/northbridge-2027/committees/disec/resolutions/paper-1/print'
		),
		locals: { supabase: SUPABASE }
	} as unknown as PageServerLoadEvent;
}

/** What `load` throws for a page that does not exist, or never throws at all. */
async function statusOfLoad(): Promise<number | null> {
	try {
		await load(makeEvent());
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}

	return null;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireRoomWatcher).mockResolvedValue({
		user: { id: 'user-1' },
		conference: CONFERENCE,
		committee: COMMITTEE
	} as Awaited<ReturnType<typeof requireRoomWatcher>>);
	vi.mocked(readCommitteePaper).mockResolvedValue(PASSED);
	vi.mocked(readPaperCommittee).mockResolvedValue(SETTINGS);
	vi.mocked(readPaperPeople).mockResolvedValue([AUSTRIA]);
	vi.mocked(readPaperVote).mockResolvedValue({
		passed: true,
		counts: { for: 31, against: 6, abstain: 7 },
		closedAt: '2027-03-16T16:40:00Z'
	});
	vi.mocked(readPaperDecidedAt).mockResolvedValue('2027-03-16T16:40:00Z');
	vi.mocked(readPaperVersions).mockResolvedValue([
		{ id: 'version-1', versionNumber: 1, content: SUBMITTED }
	]);
	vi.mocked(readPaperAmendments).mockResolvedValue([]);
	vi.mocked(readAmendmentVotes).mockResolvedValue({});
});

describe('load', () => {
	it('gives the record copy of a passed draft resolution, named a resolution', async () => {
		const data = await load(makeEvent());

		expect(data).toMatchObject({
			name: 'Resolution 1.1',
			title: 'Human control over autonomous weapons',
			adopted: 'Adopted on 16 March 2027 by 31 votes to 6, with 7 abstentions.',
			opening: 'The General Assembly,',
			committeeHeading: 'DISEC',
			paperHref: '/conferences/northbridge-2027/committees/disec/resolutions/paper-1'
		});
		expect(data?.facts).toEqual([
			{ label: 'Conference', value: 'Northbridge Model United Nations 2027' },
			{ label: 'Committee', value: 'Disarmament and International Security Committee' },
			{ label: 'Topic', value: 'Lethal autonomous weapons systems' },
			{ label: 'Sponsors', value: 'Austria' },
			{ label: 'Signatories', value: 'None' }
		]);
		expect(data?.bodyHtml).toContain('Calls upon');
		expect(data?.printed).toMatch(/^Record copy, printed from MUNMeet on /);
	});

	it('gives the text as amended and a row for each amendment decided', async () => {
		vi.mocked(readPaperVersions).mockResolvedValue([
			{ id: 'version-1', versionNumber: 1, content: SUBMITTED },
			{ id: 'version-2', versionNumber: 2, content: AMENDED }
		]);
		vi.mocked(readPaperAmendments).mockResolvedValue([STRIKE]);
		vi.mocked(readAmendmentVotes).mockResolvedValue({
			'amendment-1': {
				passed: true,
				counts: { for: 25, against: 13, abstain: 6 },
				closedAt: '2027-03-16T15:00:00Z'
			}
		});

		const data = await load(makeEvent());

		expect(readAmendmentVotes).toHaveBeenCalledWith(SUPABASE, ['amendment-1']);
		expect(data?.bodyHtml).toContain('Calls upon');
		expect(data?.bodyHtml).not.toContain('Requests a report');
		expect(data?.amendments).toEqual([
			{
				id: 'amendment-1',
				sequence: 1,
				proposedBy: 'United States',
				words: 'Strike clause 2',
				outcome: 'Passed, 25 to 13, with 6 abstentions'
			}
		]);
	});

	it('dates a paper passed without a vote by when it was decided', async () => {
		vi.mocked(readPaperVote).mockResolvedValue(null);
		vi.mocked(readPaperDecidedAt).mockResolvedValue('2027-03-15T10:00:00Z');

		expect(await load(makeEvent())).toMatchObject({ adopted: 'Adopted on 15 March 2027.' });
	});

	it('has no record copy for a paper that has not passed, a working paper, or none at all', async () => {
		vi.mocked(readCommitteePaper).mockResolvedValueOnce({ ...PASSED, status: 'introduced' });
		expect(await statusOfLoad()).toBe(404);

		vi.mocked(readCommitteePaper).mockResolvedValueOnce({ ...PASSED, kind: 'working_paper' });
		expect(await statusOfLoad()).toBe(404);

		vi.mocked(readCommitteePaper).mockResolvedValueOnce(null);
		expect(await statusOfLoad()).toBe(404);

		expect(readPaperVote).not.toHaveBeenCalled();
	});
});
