import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { chairRollCallFromUrl } from '$lib/urls';
import AttendanceChip from './AttendanceChip.svelte';

const ROLL_CALL = chairRollCallFromUrl('thimun-2027', 'unsc', 'gsl');

/** The chip for `presentCount` of `availableSeats`, during the opening or not. */
function renderChip(presentCount: number | null, availableSeats: number, isOpening: boolean) {
	const hasQuorum = presentCount !== null && presentCount >= Math.ceil(availableSeats / 2);

	render(AttendanceChip, {
		props: {
			presence: { presentCount, availableSeats, hasQuorum },
			isOpening,
			rollCallHref: ROLL_CALL
		}
	});

	return screen.getByRole('link');
}

/** The chip's words, without the hint of its key. */
function wordsOf(chip: HTMLElement): string {
	const copy = chip.cloneNode(true) as HTMLElement;
	copy.querySelector('kbd')?.remove();

	return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('AttendanceChip', () => {
	it('asks for a roll call before the first one, in the neutral tone', () => {
		const chip = renderChip(null, 6, true);

		expect(wordsOf(chip)).toBe('Take roll call');
		expect(chip.className).not.toContain('warning');
	});

	it('reads "5/6 present · quorum met" once quorum is met', () => {
		const chip = renderChip(5, 6, false);

		expect(wordsOf(chip)).toBe('5/6 present · quorum met');
		expect(chip.className).not.toContain('warning');
	});

	it('counts what is still needed during the opening, still neutral', () => {
		const chip = renderChip(3, 8, true);

		expect(wordsOf(chip)).toBe('3/8 present · 1 more needed');
		expect(chip.className).not.toContain('warning');
	});

	it('reads "no quorum" in the warning tone once debate has started', () => {
		const chip = renderChip(3, 8, false);

		expect(wordsOf(chip)).toBe('3/8 present · no quorum');
		expect(chip.className).toContain('bg-warning-100');
		expect(chip.className).toContain('text-warning-700');
	});

	it('opens the roll call view and declares R', () => {
		const chip = renderChip(5, 6, false);

		expect(chip.getAttribute('href')).toBe(ROLL_CALL);
		expect(chip.getAttribute('aria-keyshortcuts')).toBe('R');
		expect(chip.querySelector('kbd')?.textContent?.trim()).toBe('R');
	});

	it('keeps the words after the count for a screen reader where a narrow screen hides them', () => {
		const chip = renderChip(5, 6, false);
		const hidden = Array.from(chip.querySelectorAll('span')).map((span) => span.className);

		expect(hidden).toContain('max-md:sr-only');
		expect(hidden).toContain('max-[1100px]:sr-only');
	});
});
