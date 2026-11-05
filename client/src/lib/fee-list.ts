/**
 * The list of fees on the "Fees" tab of an organiser's fees page,
 * `/manage/[slug]/fees`: the columns its rows line up in, what a row's
 * "Valid" column says, and which fee carries which status.
 *
 * They live here rather than in the components, because the headings and
 * every row share the columns, and because `CLAUDE.md` keeps rules like these
 * out of a component's script block. Nothing here talks to Supabase.
 */
import { applicableFee, feeWindowSentence, isFeeCurrentlyValid, type ManagedFee } from '$lib/fees';
import type { StatusDotTone } from '$lib/manage-status';

/**
 * The columns of the fee list from `lg` up: the drag handle and arrows, the
 * fee, who it is charged to, when it is valid, the amount and the row's two
 * buttons. The headings and every row share them, so they line up as a
 * table. Below `lg` a row stacks its facts under the name instead.
 *
 * Written out in full, because Tailwind reads class names out of this file.
 */
export const FEE_COLUMNS_CLASS = 'lg:grid-cols-[5.5rem_minmax(0,1fr)_10.5rem_9rem_6rem_6.5rem]';

/** The one status a fee's row may show beside its name. */
export type FeeStatus = {
	tone: StatusDotTone;
	label: string;
};

/**
 * When a fee is charged, as its row's "Valid" column says it: "Until 31 Dec
 * 2026", or "Always" for a fee with no window at all.
 */
export function feeValidityLabel(fee: ManagedFee, timezone: string): string {
	const window = feeWindowSentence(fee, timezone);

	if (window === '') {
		return 'Always';
	}

	return window;
}

/**
 * The status a fee's row shows, or `null` for none.
 *
 * "Charged now" goes on the fee an acceptance would invoice at this moment,
 * one per kind of delegate. It is a fact about the whole list, because only
 * the first fee of a kind whose window is open wins, so the row cannot work
 * it out alone. A fee whose own window is closed is warned about instead, as
 * `05-pages/organiser/fees.md` asks under its edge cases.
 */
export function feeStatus(fee: ManagedFee, fees: ManagedFee[], now: Date): FeeStatus | null {
	const chargedNow = applicableFee(fees, fee.appliesTo, now);

	if (chargedNow?.id === fee.id) {
		return { tone: 'success', label: 'Charged now' };
	}

	if (!isFeeCurrentlyValid(fee, now)) {
		return { tone: 'warning', label: 'Not currently valid' };
	}

	return null;
}
