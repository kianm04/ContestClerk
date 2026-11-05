import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import CaucusClockLine from './CaucusClockLine.svelte';

const NOW = new Date('2026-10-01T12:00:00.000Z');

/** A moment `seconds` after `NOW`. */
function after(seconds: number): string {
	return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

/** Lets SvelteKit's `use:enhance` send the form as it is. */
const onSubmit: SubmitFunction = () => undefined;

describe('CaucusClockLine', () => {
	it('reads the time left of the total, with "Extend +5:00" and "End caucus" outlined', () => {
		const clock = { totalSeconds: 600, endsAt: after(372), pausedRemainingSeconds: null };
		render(CaucusClockLine, { props: { clock, now: NOW, onSubmit } });

		const timer = screen.getByRole('timer', { name: 'Caucus time left' });
		expect(timer.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:12 left of 10:00');

		const extend = screen.getByRole('button', { name: 'Extend +5:00' });
		const end = screen.getByRole('button', { name: 'End caucus' });
		expect(extend.closest('form')?.getAttribute('action')).toBe('?/extendCaucus');
		expect(end.closest('form')?.getAttribute('action')).toBe('?/endCaucus');
		expect(extend.className).not.toContain('bg-brand-900');
		expect(end.className).not.toContain('bg-brand-900');
	});

	it('says the time is up in danger colour, with only "Extend +5:00" left on the line', () => {
		const clock = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 };
		render(CaucusClockLine, { props: { clock, now: NOW, onSubmit } });

		const upText = screen.getByText('Caucus time is up');
		expect(upText.className).toContain('text-danger-700');
		expect(screen.getByRole('button', { name: 'Extend +5:00' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'End caucus' })).toBeNull();
	});

	it('moves with `now`, standing still while paused', () => {
		const paused = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 };
		const later = new Date(NOW.getTime() + 30_000);
		render(CaucusClockLine, { props: { clock: paused, now: later, onSubmit } });

		expect(screen.getByRole('timer', { name: 'Caucus time left' }).textContent).toContain('6:12');
	});
});
