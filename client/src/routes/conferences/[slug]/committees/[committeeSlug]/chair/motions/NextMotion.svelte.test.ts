import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { SessionMotion } from '$lib/motions';
import NextMotion from './NextMotion.svelte';

/** Kenya's fifteen-minute unmoderated caucus, as the study draws it. */
const UNMOD: SessionMotion = {
	id: 'motion-1',
	kind: 'unmoderated_caucus',
	status: 'proposed',
	topic: 'Drafting the working paper',
	totalTimeSeconds: 900,
	speakingTimeSeconds: null,
	proposedBy: { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' },
	votesFor: null,
	votesAgainst: null,
	decidedAt: null,
	createdAt: '2026-10-01T10:00:00.000Z',
	startedWithoutVote: false
};

/** The motion to decide with thirteen present, so seven for pass it. */
function renderMotion(overrides: { isOutOfOrder?: boolean; hasRollCall?: boolean } = {}) {
	render(NextMotion, {
		props: {
			motion: UNMOD,
			isOutOfOrder: overrides.isOutOfOrder ?? false,
			presentCount: overrides.hasRollCall === false ? 15 : 13,
			majority: overrides.hasRollCall === false ? 8 : 7,
			hasRollCall: overrides.hasRollCall ?? true,
			onSubmit: vi.fn()
		}
	});

	return {
		pass: screen.getByRole<HTMLButtonElement>('button', { name: 'Pass' }),
		fail: screen.getByRole<HTMLButtonElement>('button', { name: 'Fail' }),
		votesFor: screen.getByLabelText<HTMLInputElement>('For')
	};
}

/** Whether a button is drawn as the filled primary. */
function isFilled(button: HTMLButtonElement): boolean {
	return button.className.split(' ').includes('bg-brand-900');
}

describe('NextMotion', () => {
	it('draws the motion’s title and who raised it, most disruptive first', () => {
		renderMotion();

		expect(screen.getByText('Unmoderated caucus · 15:00')).toBeTruthy();
		expect(screen.getByText('Drafting the working paper · Kenya')).toBeTruthy();
		expect(screen.getByRole('heading', { name: /most disruptive first/ })).toBeTruthy();
	});

	it('says so when the motion was put to the vote out of order', () => {
		renderMotion({ isOutOfOrder: true });

		expect(screen.getByRole('heading', { name: 'Next to vote · out of order' })).toBeTruthy();
	});

	it('has no filled button while nothing is counted: Pass and Fail are equal (P1)', () => {
		const { pass, fail } = renderMotion();

		expect(isFilled(pass)).toBe(false);
		expect(isFilled(fail)).toBe(false);
		expect(pass.disabled).toBe(false);
		expect(fail.disabled).toBe(false);
		expect(
			screen.getByText(/Passes with 7 for, a simple majority of the 13 present\./)
		).toBeTruthy();
	});

	it('fills the button the count agrees with and disables the other with its reason', async () => {
		const { pass, fail, votesFor } = renderMotion();

		await fireEvent.input(votesFor, { target: { value: '4' } });

		expect(isFilled(fail)).toBe(true);
		expect(pass.disabled).toBe(true);
		expect(screen.getByText('4 for is short of 7')).toBeTruthy();
		expect(screen.getByText('As counted, it fails.')).toBeTruthy();

		await fireEvent.input(votesFor, { target: { value: '9' } });

		expect(isFilled(pass)).toBe(true);
		expect(fail.disabled).toBe(true);
		expect(screen.getByText('9 for is enough to pass')).toBeTruthy();
		expect(screen.getByText('As counted, it passes.')).toBeTruthy();
	});

	it('makes Pass and Fail equal again once the counts are emptied', async () => {
		const { pass, fail, votesFor } = renderMotion();

		await fireEvent.input(votesFor, { target: { value: '9' } });
		await fireEvent.input(votesFor, { target: { value: '' } });

		expect(isFilled(pass) || isFilled(fail)).toBe(false);
		expect(pass.disabled || fail.disabled).toBe(false);
	});

	it('counts every seat before a roll call, and says there has been none, quietly', () => {
		renderMotion({ hasRollCall: false });

		expect(screen.getByText(/Passes with 8 for, a simple majority of the 15 seats\./)).toBeTruthy();
		expect(screen.getByText(/No roll call yet\./)).toBeTruthy();
	});

	it('sends Pass and Fail as the result, and Withdraw to its own action', () => {
		const { pass, fail } = renderMotion();
		const withdraw = screen.getByRole('button', { name: 'Withdraw' });

		expect([pass.name, pass.value]).toEqual(['result', 'passed']);
		expect([fail.name, fail.value]).toEqual(['result', 'failed']);
		expect(withdraw.getAttribute('formaction')).toBe('?/withdraw');
	});
});
