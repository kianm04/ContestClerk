import { describe, expect, it } from 'vitest';
import { QUIET_ATTENTION_FACTS, SAMPLE_COMMITTEE } from './dashboard-attention-samples';
import {
	emptyProgrammeLines,
	fullCommitteeLines,
	missingPaperLines,
	noChairLines,
	noFeeLines
} from './dashboard-attention-setup';

/** DISEC with nobody chairing it. */
const UNCHAIRED = { ...SAMPLE_COMMITTEE, id: 'disec-id', abbreviation: 'DISEC', chairNames: [] };

describe('noChairLines', () => {
	it('names the one committee nobody chairs and opens it', () => {
		expect(noChairLines({ ...QUIET_ATTENTION_FACTS, committees: [UNCHAIRED] })).toEqual([
			{
				key: 'no-chair',
				title: 'DISEC has no chair',
				detail: 'Delegates see "Chairs to be announced".',
				actionLabel: 'Invite a chair',
				href: '/manage/northbridge/committees/disec-id'
			}
		]);
	});

	it('counts several and opens the committees list', () => {
		const committees = [UNCHAIRED, { ...UNCHAIRED, id: 'unsc-id' }];
		const [line] = noChairLines({ ...QUIET_ATTENTION_FACTS, committees });

		expect(line.title).toBe('2 committees have no chair');
		expect(line.href).toBe('/manage/northbridge/committees');
	});

	it('draws nothing while every committee has a chair', () => {
		expect(noChairLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('fullCommitteeLines', () => {
	it('gives each committee without a free seat its own line', () => {
		const full = { ...SAMPLE_COMMITTEE, seatCounts: { ...SAMPLE_COMMITTEE.seatCounts, filled: 3 } };

		expect(fullCommitteeLines({ ...QUIET_ATTENTION_FACTS, committees: [full] })).toEqual([
			{
				key: 'full-committee-hrc-id',
				title: 'Human Rights Council has no free seats',
				detail: 'Nobody else can apply for it.',
				actionLabel: 'Add seats',
				href: '/manage/northbridge/committees/hrc-id'
			}
		]);
		expect(fullCommitteeLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('noFeeLines', () => {
	it('warns while there is no fee and nobody collects money by hand', () => {
		const facts = { ...QUIET_ATTENTION_FACTS, hasFeesOrManualCollection: false };

		expect(noFeeLines(facts).map((line) => line.title)).toEqual([
			'No fees yet: delegates will not be invoiced'
		]);
		expect(noFeeLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});

	it('opens the fees page on its "Fees" tab, not on the invoices a public conference opens on', () => {
		const facts = { ...QUIET_ATTENTION_FACTS, hasFeesOrManualCollection: false };
		const slug = QUIET_ATTENTION_FACTS.conference.slug;

		expect(noFeeLines(facts)[0].href).toBe(`/manage/${slug}/fees?tab=fees`);
	});
});

describe('emptyProgrammeLines', () => {
	it('names the one conference day nothing is on', () => {
		const allocation = {
			...QUIET_ATTENTION_FACTS.allocation,
			eventStarts: ['2026-11-14T09:00:00Z', '2026-11-16T09:00:00Z']
		};

		expect(emptyProgrammeLines({ ...QUIET_ATTENTION_FACTS, allocation })).toEqual([
			{
				key: 'empty-day',
				title: 'Sunday 15 November has no events',
				detail: 'Delegates see an empty day on the programme.',
				actionLabel: 'Schedule',
				href: '/manage/northbridge/schedule'
			}
		]);
	});

	it('counts several empty days, and says when the schedule is empty', () => {
		const oneEvent = { ...QUIET_ATTENTION_FACTS.allocation, eventStarts: ['2026-11-14T09:00:00Z'] };
		const noEvents = { ...QUIET_ATTENTION_FACTS.allocation, eventStarts: [] };

		const [several] = emptyProgrammeLines({ ...QUIET_ATTENTION_FACTS, allocation: oneEvent });
		const [empty] = emptyProgrammeLines({ ...QUIET_ATTENTION_FACTS, allocation: noEvents });

		expect(several.title).toBe('2 conference days have no events');
		expect(empty.title).toBe('The schedule is empty');
		expect(empty.actionLabel).toBe('Add the first event');
	});

	it('draws nothing while every day has an event', () => {
		expect(emptyProgrammeLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('missingPaperLines', () => {
	it('counts the papers not yet in and gives the deadline', () => {
		const missingOne = { ...SAMPLE_COMMITTEE, positionPaperCount: 1 };

		expect(missingPaperLines({ ...QUIET_ATTENTION_FACTS, committees: [missingOne] })).toEqual([
			{
				key: 'missing-papers',
				title: '1 position paper is missing',
				detail: 'The deadline is Friday 6 November.',
				actionLabel: 'Position papers',
				href: '/manage/northbridge/documents?tab=papers&paper=missing'
			}
		]);
	});

	it('draws nothing when the conference asks for no papers', () => {
		const conference = { ...QUIET_ATTENTION_FACTS.conference, positionPaperRequired: false };
		const missingOne = { ...SAMPLE_COMMITTEE, positionPaperCount: 1 };

		expect(
			missingPaperLines({ ...QUIET_ATTENTION_FACTS, conference, committees: [missingOne] })
		).toEqual([]);
	});
});
