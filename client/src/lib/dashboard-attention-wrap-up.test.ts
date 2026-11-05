import { describe, expect, it } from 'vitest';
import { QUIET_ATTENTION_FACTS } from './dashboard-attention-samples';
import {
	exportParticipantLines,
	proposedAwardLines,
	thankDelegateLines,
	unpaidInvoiceLines
} from './dashboard-attention-wrap-up';

describe('unpaidInvoiceLines', () => {
	it('names who the one unpaid invoice is for and how much it is', () => {
		const unpaidInvoices = {
			count: 1,
			totalCents: 4500,
			oldestCreatedAt: '2026-09-20T10:00:00Z',
			onlyPayerName: 'Maya Thompson'
		};

		expect(unpaidInvoiceLines({ ...QUIET_ATTENTION_FACTS, unpaidInvoices })).toEqual([
			{
				key: 'unpaid',
				title: '1 invoice is still unpaid',
				detail: 'Maya Thompson · £45.00',
				actionLabel: 'Invoices',
				href: '/manage/northbridge/fees?status=unpaid#invoices'
			}
		]);
	});

	it('adds several up and says how old the oldest is', () => {
		const unpaidInvoices = {
			count: 3,
			totalCents: 17000,
			oldestCreatedAt: '2026-09-23T10:00:00Z',
			onlyPayerName: null
		};
		const [line] = unpaidInvoiceLines({ ...QUIET_ATTENTION_FACTS, unpaidInvoices });

		expect(line.title).toBe('3 invoices are unpaid');
		expect(line.detail).toBe('£170.00 in total. The oldest is 9 days old.');
	});

	it('draws nothing while every invoice is paid', () => {
		expect(unpaidInvoiceLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('proposedAwardLines', () => {
	it('counts every award and the ones still waiting for the organiser', () => {
		const awardCounts = { proposed: 3, confirmed: 2 };

		expect(proposedAwardLines({ ...QUIET_ATTENTION_FACTS, awardCounts })).toEqual([
			{
				key: 'proposed-awards',
				title: 'Confirm and publish the awards',
				detail: 'Chairs proposed 5 awards. 3 still need your confirmation.',
				actionLabel: 'Review awards',
				href: '/manage/northbridge/awards'
			}
		]);
	});

	it('speaks of one in the singular, and draws nothing once none waits', () => {
		const one = { proposed: 1, confirmed: 0 };

		expect(proposedAwardLines({ ...QUIET_ATTENTION_FACTS, awardCounts: one })[0].detail).toBe(
			'Chairs proposed 1 award. 1 still needs your confirmation.'
		);
		expect(proposedAwardLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('thankDelegateLines and exportParticipantLines', () => {
	it('suggest a last announcement and the participant list once somebody took part', () => {
		expect(thankDelegateLines(QUIET_ATTENTION_FACTS)[0].href).toBe(
			'/manage/northbridge/announcements'
		);
		expect(exportParticipantLines(QUIET_ATTENTION_FACTS)[0].href).toBe(
			'/manage/northbridge/participants'
		);
	});

	it('suggest neither when nobody held a seat', () => {
		const stats = { ...QUIET_ATTENTION_FACTS.stats, seatsFilled: 0 };

		expect(thankDelegateLines({ ...QUIET_ATTENTION_FACTS, stats })).toEqual([]);
		expect(exportParticipantLines({ ...QUIET_ATTENTION_FACTS, stats })).toEqual([]);
	});
});
