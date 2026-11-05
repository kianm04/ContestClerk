import { describe, expect, it } from 'vitest';
import type { MyApplication } from '$lib/applications';
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	applicationAfterPresses,
	describeWithdrawFailure,
	type MyApplicationView
} from './my-application-presses';

/** A view of an application with `status`, so each test only says what it needs to. */
function makeView(status: MyApplication['status']): MyApplicationView {
	return {
		application: {
			id: 'application-1',
			conferenceId: 'conference-1',
			status,
			committeePreferences: [],
			seatPreferences: '',
			motivation: '',
			answers: {},
			submittedAt: '2026-03-01T10:00:00Z',
			decisionNote: null,
			updatedAt: '2026-03-01T10:00:00Z'
		},
		canEdit: true,
		canWithdraw: true
	};
}

/** A press posted to `address`. */
function press(address: string): InstantPress {
	return {
		id: 1,
		action: new URL(`http://localhost/applications/application-1${address}`),
		formData: new FormData(),
		expected: null
	};
}

describe('applicationAfterPresses', () => {
	it('shows a submitted application as withdrawn at once', () => {
		const shown = applicationAfterPresses(makeView('submitted'), [press('?/withdraw')]);

		expect(shown.application.status).toBe('withdrawn');
		expect(shown.canEdit).toBe(false);
		expect(shown.canWithdraw).toBe(false);
	});

	it('leaves the view alone with no press on its way', () => {
		const view = makeView('waitlisted');

		expect(applicationAfterPresses(view, [])).toBe(view);
	});

	it('leaves an application the server would not withdraw as it is', () => {
		const view = makeView('accepted');

		expect(applicationAfterPresses(view, [press('?/withdraw')])).toBe(view);
	});
});

describe('describeWithdrawFailure', () => {
	it('says the application was not withdrawn', () => {
		expect(describeWithdrawFailure()).toBe('Your application was not withdrawn.');
	});
});
