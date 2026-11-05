/**
 * What "Withdraw application" on a delegate's own application page changes,
 * worked out in the browser so the status reads "Withdrawn" the moment the
 * answer is confirmed (T142).
 *
 * The page keeps an instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for it and draws its status card with the
 * presses still on their way laid on top (`applicationAfterPresses`). Like
 * the server's `withdrawApplication`, only a submitted or waitlisted
 * application is withdrawn, and neither has a seat to give back.
 */
import type { MyApplication } from '$lib/applications';
import type { InstantPress } from '$lib/instant-form.svelte';
import { pressedAction } from '$lib/row-changes';

/** The part of the page a withdrawal changes. */
export type MyApplicationView = {
	application: MyApplication;
	canEdit: boolean;
	canWithdraw: boolean;
};

/** The statuses the server withdraws from; any other is left as it is. */
const WITHDRAWABLE_STATUSES: MyApplication['status'][] = ['submitted', 'waitlisted'];

/** `view` as it will be once every press still on its way is saved. */
export function applicationAfterPresses(
	view: MyApplicationView,
	presses: InstantPress[]
): MyApplicationView {
	const isWithdrawing = presses.some((press) => pressedAction(press.action) === '?/withdraw');

	if (!isWithdrawing || !WITHDRAWABLE_STATUSES.includes(view.application.status)) return view;

	return {
		application: { ...view.application, status: 'withdrawn' },
		canEdit: false,
		canWithdraw: false
	};
}

/** The first sentence of the toast when the withdrawal failed. */
export function describeWithdrawFailure(): string {
	return 'Your application was not withdrawn.';
}
