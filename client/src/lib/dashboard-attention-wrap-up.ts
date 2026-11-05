/**
 * The "Needs you" lines about money and the last jobs of a conference: unpaid
 * invoices, awards to confirm, a last announcement and the participant list.
 *
 * Nothing here talks to Supabase or knows any Svelte. `dashboard-attention.ts`
 * chooses which phases draw each line.
 */

import type { AttentionFacts, AttentionItem } from '$lib/dashboard-attention';
import { countOf } from '$lib/dashboard-words';
import { dayInTimezone, daysBetween } from '$lib/dates';
import { EMPTY_INVOICE_LIST_QUERY } from '$lib/invoices';
import { formatMoney } from '$lib/money';
import {
	manageAnnouncementsUrl,
	manageAwardsUrl,
	manageFeesTableUrl,
	manageParticipantsUrl
} from '$lib/urls';

/** "The oldest is 9 days old.", or "The oldest is from today." */
function oldestInvoiceText(oldestCreatedAt: string, now: Date, timezone: string): string {
	const createdDay = dayInTimezone(new Date(oldestCreatedAt), timezone);
	const daysOld = daysBetween(createdDay, dayInTimezone(now, timezone));

	if (daysOld <= 0) {
		return 'The oldest is from today.';
	}

	return `The oldest is ${countOf(daysOld, 'day', 'days')} old.`;
}

/**
 * "1 invoice is still unpaid" with whom it is for, or "3 invoices are unpaid"
 * with the total and the age of the oldest. Both open the unpaid invoices.
 */
export function unpaidInvoiceLines(facts: AttentionFacts): AttentionItem[] {
	const invoices = facts.unpaidInvoices;
	const currency = facts.stats.currency;

	if (invoices.count === 0) {
		return [];
	}

	const total = formatMoney(invoices.totalCents, currency);
	const href = manageFeesTableUrl(facts.conference.slug, {
		...EMPTY_INVOICE_LIST_QUERY,
		status: 'unpaid'
	});

	if (invoices.count === 1) {
		const detail = invoices.onlyPayerName === null ? total : `${invoices.onlyPayerName} · ${total}`;

		return [
			{ key: 'unpaid', title: '1 invoice is still unpaid', detail, actionLabel: 'Invoices', href }
		];
	}

	let detail = `${total} in total.`;

	if (invoices.oldestCreatedAt !== null) {
		const oldest = oldestInvoiceText(
			invoices.oldestCreatedAt,
			facts.now,
			facts.conference.timezone
		);

		detail = `${detail} ${oldest}`;
	}

	return [
		{
			key: 'unpaid',
			title: `${invoices.count} invoices are unpaid`,
			detail,
			actionLabel: 'Invoices',
			href
		}
	];
}

/** "Confirm and publish the awards", while chairs' proposals wait for the organiser. */
export function proposedAwardLines(facts: AttentionFacts): AttentionItem[] {
	const { proposed, confirmed } = facts.awardCounts;

	if (proposed === 0) {
		return [];
	}

	const awards = countOf(proposed + confirmed, 'award', 'awards');
	const waiting = countOf(proposed, 'still needs', 'still need');

	return [
		{
			key: 'proposed-awards',
			title: 'Confirm and publish the awards',
			detail: `Chairs proposed ${awards}. ${waiting} your confirmation.`,
			actionLabel: 'Review awards',
			href: manageAwardsUrl(facts.conference.slug)
		}
	];
}

/** "Thank your delegates", once a conference somebody took part in is over. */
export function thankDelegateLines(facts: AttentionFacts): AttentionItem[] {
	if (facts.stats.seatsFilled === 0) {
		return [];
	}

	return [
		{
			key: 'thank-delegates',
			title: 'Thank your delegates',
			detail: 'A last announcement reaches everyone who had a seat.',
			actionLabel: 'Write announcement',
			href: manageAnnouncementsUrl(facts.conference.slug)
		}
	];
}

/** "Export the participant list": its CSV is on the participants page. */
export function exportParticipantLines(facts: AttentionFacts): AttentionItem[] {
	if (facts.stats.seatsFilled === 0) {
		return [];
	}

	return [
		{
			key: 'export-participants',
			title: 'Export the participant list',
			detail: 'A CSV with seats, schools and payment.',
			actionLabel: 'Participants',
			href: manageParticipantsUrl(facts.conference.slug)
		}
	];
}
