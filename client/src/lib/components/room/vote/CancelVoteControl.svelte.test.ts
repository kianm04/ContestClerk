import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ChairForm } from '$lib/chair-form';
import CancelVoteControl from './CancelVoteControl.svelte';

// SvelteKit's `enhance` needs a running app; the question is what is tested here.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => undefined }) }));

const LINKS = {
	isConfirming: false,
	confirmHref: '/conferences/mun/committees/unsc/chair/voting?cancel=confirm',
	keepHref: '/conferences/mun/committees/unsc/chair/voting'
} as const;

const submitExpecting: ChairForm['submitExpecting'] = () => () => undefined;

describe('CancelVoteControl', () => {
	it('is a quiet link to the question, which works without JavaScript', () => {
		render(CancelVoteControl, { props: { voteId: 'vote-1', links: LINKS, submitExpecting } });

		expect(screen.getByRole('link', { name: 'Cancel vote' }).getAttribute('href')).toBe(
			LINKS.confirmHref
		);
		expect(screen.queryByText('Cancel this vote? Nothing will be recorded.')).toBeNull();
	});

	it('asks in place, never in a dialog, and "Keep voting" puts the question away', async () => {
		render(CancelVoteControl, { props: { voteId: 'vote-1', links: LINKS, submitExpecting } });

		await fireEvent.click(screen.getByRole('link', { name: 'Cancel vote' }));

		expect(screen.getByText('Cancel this vote? Nothing will be recorded.')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Cancel vote' }).closest('form')?.getAttribute('action')
		).toBe('?/cancelVote');
		expect(screen.queryByRole('dialog')).toBeNull();

		await fireEvent.click(screen.getByRole('link', { name: 'Keep voting' }));

		expect(screen.queryByText('Cancel this vote? Nothing will be recorded.')).toBeNull();
	});

	it('keeps asking when the room is read again with the address unchanged', async () => {
		const { rerender } = render(CancelVoteControl, {
			props: { voteId: 'vote-1', links: LINKS, submitExpecting }
		});

		await fireEvent.click(screen.getByRole('link', { name: 'Cancel vote' }));
		// Every reading of the room hands over new links, here with the same answers.
		await rerender({ links: { ...LINKS } });

		expect(screen.getByText('Cancel this vote? Nothing will be recorded.')).toBeTruthy();
	});

	it('asks at once when the address says so (`?cancel=confirm`)', () => {
		render(CancelVoteControl, {
			props: { voteId: 'vote-1', links: { ...LINKS, isConfirming: true }, submitExpecting }
		});

		expect(screen.getByText('Cancel this vote? Nothing will be recorded.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Keep voting' }).getAttribute('href')).toBe(
			LINKS.keepHref
		);
	});
});
