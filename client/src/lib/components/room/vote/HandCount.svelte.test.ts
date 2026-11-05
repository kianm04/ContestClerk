import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ChairForm } from '$lib/chair-form';
import type { OpenVote } from '$lib/votes';
import HandCount from './HandCount.svelte';

// SvelteKit's `enhance` needs a running app. Standing it in with a handler
// that stops the browser's own submit keeps every form on the page, so these
// tests are about what the view draws and when it saves.
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(),
	enhance: (form: HTMLFormElement) => {
		const stopSubmit = (event: Event) => event.preventDefault();
		form.addEventListener('submit', stopSubmit);
		return { destroy: () => form.removeEventListener('submit', stopSubmit) };
	}
}));

/** An open show of hands with nothing counted yet. */
const VOTE: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: null,
	votesAgainst: null,
	votesAbstain: null,
	passed: null,
	openedAt: '2026-01-01T10:00:00.000Z',
	closedAt: null,
	entries: {}
};

/** A stand-in for the chair's instant form, which hands each press back untouched. */
const submitExpecting: ChairForm['submitExpecting'] = () => () => undefined;

const CANCEL_LINKS = {
	isConfirming: false,
	confirmHref: '/conferences/mun/committees/unsc/chair/voting?cancel=confirm',
	keepHref: '/conferences/mun/committees/unsc/chair/voting'
} as const;

/** The hand count of `vote`, with six delegates present. */
function renderHandCount(vote: OpenVote = VOTE) {
	return render(HandCount, {
		props: { vote, presentCount: 6, cancelLinks: CANCEL_LINKS, submitExpecting }
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('HandCount', () => {
	it('asks for the hands and keeps "Close vote" disabled while nothing is counted', () => {
		renderHandCount();

		expect(screen.getByRole('heading', { name: /Draft Resolution 1\.1/ }).textContent).toContain(
			'substantive · simple majority'
		);
		expect(screen.getByText('Vote open')).toBeTruthy();
		expect(screen.getByText('Count the hands for, then against, then abstentions.')).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Close vote/ }).hasAttribute('disabled')).toBe(true);
	});

	it('follows each press of + and −, naming "Close vote" by the result, and saves the count', async () => {
		const save = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit');
		renderHandCount();

		const moreFor = screen.getByRole('button', { name: 'One more for' });
		for (let press = 0; press < 4; press += 1) await fireEvent.click(moreFor);
		await fireEvent.click(screen.getByRole('button', { name: 'One more against' }));

		expect(screen.getByLabelText<HTMLInputElement>('For').value).toBe('4');
		expect(screen.getByText('As counted, it passes.')).toBeTruthy();
		const close = screen.getByRole('button', { name: 'Close vote: passes' });
		expect(close.hasAttribute('disabled')).toBe(false);
		expect(save).toHaveBeenCalledTimes(5);

		await fireEvent.click(screen.getByRole('button', { name: 'One fewer for' }));
		await fireEvent.click(screen.getByRole('button', { name: 'One fewer for' }));
		await fireEvent.click(screen.getByRole('button', { name: 'One more against' }));

		expect(screen.getByText('As counted, it fails.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Close vote: fails' })).toBeTruthy();
	});

	it('follows a typed count, and does not save more hands than delegates present', async () => {
		const save = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit');
		renderHandCount();

		await fireEvent.input(screen.getByLabelText('For'), { target: { value: '7' } });

		expect(screen.getByText('As counted, it passes.')).toBeTruthy();
		expect(save).not.toHaveBeenCalled();
	});

	it('keeps a count typed but not saved when the room is read again with nothing new', async () => {
		const { rerender } = renderHandCount();

		await fireEvent.input(screen.getByLabelText('For'), { target: { value: '7' } });
		// Every reading of the room hands over a new `vote`, here with the same counts.
		await rerender({ vote: { ...VOTE } });

		expect(screen.getByLabelText<HTMLInputElement>('For').value).toBe('7');
		expect(screen.getByRole('button', { name: 'Close vote: passes' })).toBeTruthy();
	});

	it('shows a count saved elsewhere, such as by a co-chair, in place of the typed one', async () => {
		const { rerender } = renderHandCount();

		await fireEvent.input(screen.getByLabelText('For'), { target: { value: '7' } });
		await rerender({ vote: { ...VOTE, votesFor: 2, votesAgainst: 0, votesAbstain: 0 } });

		expect(screen.getByLabelText<HTMLInputElement>('For').value).toBe('2');
	});

	it('starts from the count already saved, the fields being the form "Close vote" sends', () => {
		renderHandCount({ ...VOTE, votesFor: 2, votesAgainst: 3, votesAbstain: 1 });

		const forField = screen.getByLabelText<HTMLInputElement>('For');

		expect(forField.value).toBe('2');
		expect(forField.name).toBe('votesFor');
		expect(forField.form?.getAttribute('action')).toBe('?/closeVote');
		expect(screen.getByRole('button', { name: 'Close vote: fails' })).toBeTruthy();
	});
});
