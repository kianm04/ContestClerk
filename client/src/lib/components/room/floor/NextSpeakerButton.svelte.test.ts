import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NextSpeakerButton from './NextSpeakerButton.svelte';

const UNITED_KINGDOM = { id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB' };

/** The props every test starts from: someone speaking, the United Kingdom waiting. */
function propsWith(overrides: Record<string, unknown> = {}) {
	return {
		nextSeat: UNITED_KINGDOM,
		hasSpeaker: true,
		isPrimary: true,
		onSubmit: vi.fn(),
		...overrides
	};
}

describe('NextSpeakerButton', () => {
	it('reads "Next: {seat}" while someone has the floor, and declares N', () => {
		render(NextSpeakerButton, { props: propsWith() });

		const button = screen.getByRole('button', { name: 'Next: United Kingdom' });

		expect(button.getAttribute('aria-keyshortcuts')).toBe('N');
		expect(button.getAttribute('title')).toBe('Next: United Kingdom');
		expect(button.hasAttribute('disabled')).toBe(false);
		expect(button.closest('form')?.getAttribute('action')).toBe('?/nextSpeaker');
	});

	it('reads "Call {seat}" over an empty floor', () => {
		render(NextSpeakerButton, { props: propsWith({ hasSpeaker: false }) });

		expect(screen.getByRole('button', { name: 'Call United Kingdom' })).toBeTruthy();
	});

	it('is the filled primary, or outlined during the opening before a roll call', () => {
		const filled = render(NextSpeakerButton, { props: propsWith() });

		expect(filled.getByRole('button').className).toContain('bg-brand-900');
		filled.unmount();

		render(NextSpeakerButton, { props: propsWith({ isPrimary: false }) });

		expect(screen.getByRole('button').className).toContain('bg-surface');
		expect(screen.getByRole('button').className).not.toContain('bg-brand-900');
	});

	it('is a disabled "Next" with "Nobody is waiting" beside it when no present seat waits', () => {
		render(NextSpeakerButton, { props: propsWith({ nextSeat: null }) });

		expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('Nobody is waiting')).toBeTruthy();
	});

	it('is left out with nobody on the floor and nobody waiting', () => {
		render(NextSpeakerButton, { props: propsWith({ nextSeat: null, hasSpeaker: false }) });

		expect(screen.queryByRole('button')).toBeNull();
	});
});
