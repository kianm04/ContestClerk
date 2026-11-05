import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCommittee } from '$lib/committees';
import type { Conference } from '$lib/conferences';

// The five reads are stood in for, so these tests are about how their answers
// are put together. Each read has its own tests next to it.
vi.mock('./application-form-settings', () => ({ readApplicationFormSettings: vi.fn() }));
vi.mock('./fees', () => ({ listFees: vi.fn(), readPaymentSettings: vi.fn() }));
vi.mock('./manage', () => ({ readChecklistCounts: vi.fn() }));
vi.mock('./manage-committees', () => ({ listCommitteesForManage: vi.fn() }));

import { readApplicationFormSettings } from './application-form-settings';
import { listFees, readPaymentSettings } from './fees';
import { readChecklistCounts } from './manage';
import { listCommitteesForManage } from './manage-committees';
import {
	listReviewCommittees,
	readConferenceChecklistCounts,
	readPublishReviewFacts
} from './publish-review';

/** The Supabase client. Every read is stood in for, so it is only handed on. */
const SUPABASE = {} as SupabaseClient;

const NOW = new Date('2026-11-15T10:00:00Z');

/** A draft as `/create` leaves it, with a window already set. */
const CONFERENCE: Conference = {
	id: 'conference-1',
	slug: 'northbridge-mun-2027',
	name: 'Northbridge MUN 2027',
	description: null,
	organizationName: 'Northbridge MUN Society',
	organizationSlug: 'northbridge-mun-society',
	city: 'London',
	countryCode: 'GB',
	countryName: 'United Kingdom',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-03-12',
	endDate: '2027-03-14',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'mixed',
	status: 'draft',
	timezone: 'Europe/London',
	expectedDelegates: null,
	applicationsOpenAt: '2026-10-01T09:00:00Z',
	applicationsCloseAt: '2027-01-31T23:59:00Z',
	committeeCount: 1,
	committeeNames: ['DISEC'],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** One committee as the committees list reads it, with seven seats on offer and no chair. */
const COMMITTEE: ManagedCommittee = {
	id: 'committee-1',
	slug: 'disec',
	name: 'Disarmament and International Security',
	abbreviation: 'DISEC',
	description: null,
	topics: [],
	level: 'beginner',
	room: null,
	position: 1,
	defaultSpeakingTimeSeconds: 60,
	seatCounts: { available: 7, filled: 0, reserved: 0, total: 8 },
	chairNames: [],
	hasBackgroundGuide: false,
	positionPaperCount: 0
};

beforeEach(() => {
	vi.mocked(listCommitteesForManage).mockResolvedValue([COMMITTEE]);
	vi.mocked(listFees).mockResolvedValue([]);
	vi.mocked(readPaymentSettings).mockResolvedValue({
		currency: 'GBP',
		collectsPaymentsManually: true,
		paymentInstructions: null
	});
	vi.mocked(readApplicationFormSettings).mockResolvedValue({
		committeePreferenceCount: 2,
		askMotivation: true
	});
	vi.mocked(readChecklistCounts).mockResolvedValue({
		[CONFERENCE.id]: {
			committeeCount: 1,
			committeesWithoutAvailableSeatsCount: 0,
			onlyCommitteeWithoutSeatsId: null,
			feeCount: 0,
			collectsPaymentsManually: true
		}
	});
});

describe('listReviewCommittees', () => {
	it('counts the seats on offer and the chairs of each committee', async () => {
		const chaired: ManagedCommittee = {
			...COMMITTEE,
			id: 'committee-2',
			chairNames: ['Ada', 'Ben']
		};
		vi.mocked(listCommitteesForManage).mockResolvedValue([COMMITTEE, chaired]);

		const committees = await listReviewCommittees(SUPABASE, CONFERENCE.id);

		expect(committees.map((committee) => committee.chairCount)).toEqual([0, 2]);
		expect(committees[0].availableSeatCount).toBe(7);
	});
});

describe('readPublishReviewFacts', () => {
	it('keeps only what the page shows of each committee', async () => {
		const facts = await readPublishReviewFacts(SUPABASE, CONFERENCE, false, NOW);

		expect(facts.committees).toEqual([
			{
				name: 'Disarmament and International Security',
				abbreviation: 'DISEC',
				availableSeatCount: 7,
				chairCount: 0
			}
		]);
	});

	it('hands on the payment and application form settings', async () => {
		const facts = await readPublishReviewFacts(SUPABASE, CONFERENCE, false, NOW);

		expect(facts).toMatchObject({
			currency: 'GBP',
			collectsPaymentsManually: true,
			committeePreferenceCount: 2,
			askMotivation: true,
			now: NOW
		});
	});

	it('works the checklist out from the counts', async () => {
		const facts = await readPublishReviewFacts(SUPABASE, CONFERENCE, false, NOW);
		const committeesLine = facts.checklist.find((line) => line.key === 'committees');
		const detailsLine = facts.checklist.find((line) => line.key === 'details');

		expect(committeesLine?.isDone).toBe(true);
		expect(detailsLine?.isDone).toBe(false);
	});
});

describe('readConferenceChecklistCounts', () => {
	it('answers with the counts of the one conference', async () => {
		const counts = await readConferenceChecklistCounts(SUPABASE, CONFERENCE.id);

		expect(counts.committeeCount).toBe(1);
	});

	it('fails loudly when the conference was not counted', async () => {
		vi.mocked(readChecklistCounts).mockResolvedValue({});

		await expect(readConferenceChecklistCounts(SUPABASE, CONFERENCE.id)).rejects.toThrow(
			'Could not count the checklist'
		);
	});
});
