import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import SpeechControls from './SpeechControls.svelte';

const KENYA = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const NOTES =
	'/conferences/thimun-2027/committees/unsc/chair/notes?seat=seat-cn' as ResolvedPathname;

/** The controls with `timer`, Kenya to yield to. */
function renderWith(timer: {
	totalSeconds: number | null;
	endsAt: string | null;
	pausedRemainingSeconds: number | null;
}) {
	return render(SpeechControls, {
		props: { timer, startSeconds: 90, yieldSeats: [KENYA], noteHref: NOTES, onSubmit: vi.fn() }
	});
}

/** What one control of the row is called: a menu's button, or a button's words without its key hint. */
function controlName(control: Element): string {
	const summary = control.querySelector('summary');

	if (summary !== null)
		return (summary.getAttribute('aria-label') ?? summary.textContent ?? '').trim();

	return control.getAttribute('aria-label') ?? control.firstChild?.textContent?.trim() ?? '';
}

const READY = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 };
const RUNNING = {
	totalSeconds: 90,
	endsAt: '2099-01-01T00:00:00.000Z',
	pausedRemainingSeconds: null
};
const PAUSED = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 52 };

describe('SpeechControls', () => {
	it('draws the five controls in their order: clock, +15 s, Yield, End speech, ⋯', () => {
		const { container } = renderWith(READY);
		const row = container.querySelector('div');
		const words = Array.from(row?.children ?? []).map(controlName);

		expect(words).toEqual(['Start', '+15 s', 'Yield', 'End speech', 'More']);
	});

	it('reads Start, Pause or Resume on one button of one fixed width, which declares Space', () => {
		for (const [timer, label, action] of [
			[READY, 'Start', '?/timerResume'],
			[RUNNING, 'Pause', '?/timerPause'],
			[PAUSED, 'Resume', '?/timerResume']
		] as const) {
			const { unmount } = renderWith(timer);
			const button = screen.getByRole('button', { name: label });

			expect(button.getAttribute('formaction')).toBe(action);
			expect(button.getAttribute('aria-keyshortcuts')).toBe('Space');
			expect(button.className).toContain('w-28');
			unmount();
		}
	});

	it('starts a timer of the speaking time for a speaker who has none', () => {
		const { container } = renderWith({
			totalSeconds: null,
			endsAt: null,
			pausedRemainingSeconds: null
		});

		expect(screen.getByRole('button', { name: 'Start' }).getAttribute('formaction')).toBe(
			'?/timerStart'
		);
		expect(container.querySelector<HTMLInputElement>('input[name="seconds"]')?.value).toBe('90');
		expect(screen.getByRole('button', { name: '+15 s' }).hasAttribute('disabled')).toBe(true);
	});

	it('makes "End speech" a plain button, and declares + and E', () => {
		renderWith(RUNNING);

		const endSpeech = screen.getByRole('button', { name: 'End speech' });

		expect(endSpeech.className).toContain('bg-surface');
		expect(endSpeech.className).not.toMatch(/danger/);
		expect(endSpeech.getAttribute('aria-keyshortcuts')).toBe('E');
		expect(screen.getByRole('button', { name: '+15 s' }).getAttribute('aria-keyshortcuts')).toBe(
			'Plus'
		);
	});

	it('offers "To the chair" and the present seats in Yield, and the ⋯ menu, as forms', () => {
		renderWith(RUNNING);

		expect(screen.getByRole('button', { name: /To the chair/ }).getAttribute('formaction')).toBe(
			'?/yieldToChair'
		);
		const kenya = screen.getByRole('button', { name: 'Kenya' });

		expect(kenya.getAttribute('formaction')).toBe('?/yieldToSeat');
		expect(kenya.getAttribute('value')).toBe('seat-ke');
		expect(screen.getByRole('button', { name: 'Reset clock' }).getAttribute('formaction')).toBe(
			'?/timerReset'
		);
		expect(screen.getByRole('link', { name: 'Note on this speech' }).getAttribute('href')).toBe(
			NOTES
		);
	});
});
