import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { RoomSeat } from '$lib/committee-room';
import MotionComposer from './MotionComposer.svelte';

const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const PERU: RoomSeat = { id: 'seat-pe', name: 'Peru', countryCode: 'PE' };

/** The composer over two seats, Peru absent; `onSubmit` cancels the request it is handed. */
function renderComposer() {
	const onSubmit = vi.fn<SubmitFunction>(({ cancel }) => cancel());

	render(MotionComposer, {
		props: {
			refusedValues: null,
			refusedErrors: null,
			seats: [KENYA, PERU],
			attendance: { 'seat-ke': 'present', 'seat-pe': 'absent' },
			defaultSpeakingSeconds: 90,
			papers: [],
			onSubmit
		}
	});

	const raisedBy = screen.getByRole<HTMLInputElement>('combobox', { name: 'Raised by' });
	const form = raisedBy.closest('form') as HTMLFormElement;

	return { onSubmit, raisedBy, form };
}

/** The labels of the composer's fields, in order. */
function fieldLabels(): string[] {
	return Array.from(document.querySelectorAll('form label'))
		.map((label) => label.textContent?.trim() ?? '')
		.filter((text) => !['Mod', 'Unmod', 'Extend', 'Suspend', 'Adjourn'].includes(text))
		.filter((text) => !['Close debate', 'Document', 'Other'].includes(text));
}

describe('MotionComposer', () => {
	it('starts on Mod with its fields, each time field showing its default', () => {
		renderComposer();

		expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Mod' }).checked).toBe(true);
		expect(fieldLabels()).toEqual(['Raised by', 'Topic', 'Total', 'Each']);
		expect(screen.getByLabelText<HTMLInputElement>('Total').placeholder).toBe('10:00');
		expect(screen.getByLabelText<HTMLInputElement>('Each').placeholder).toBe('1:30');
	});

	it('shows only the fields the chosen kind asks for', async () => {
		renderComposer();

		await fireEvent.click(screen.getByRole('radio', { name: 'Extend' }));
		expect(fieldLabels()).toEqual(['Raised by', 'By']);
		expect(screen.getByLabelText<HTMLInputElement>('By').placeholder).toBe('5:00');

		await fireEvent.click(screen.getByRole('radio', { name: 'Close debate' }));
		expect(fieldLabels()).toEqual(['Raised by']);

		await fireEvent.click(screen.getByRole('radio', { name: 'Unmod' }));
		expect(fieldLabels()).toEqual(['Raised by', 'Length', 'Topic']);
	});

	it('offers the chair first and an absent seat as absent, and Enter moves on to the next field', async () => {
		const { raisedBy } = renderComposer();

		await fireEvent.click(raisedBy);
		const options = screen
			.getAllByRole('option')
			.map((option) => option.textContent?.replace(/\s+/g, ' ').trim());
		expect(options).toEqual(['The chair', 'Kenya', 'Peru absent']);
		expect(screen.getByRole('option', { name: /Peru/ }).getAttribute('aria-disabled')).toBe('true');

		await fireEvent.input(raisedBy, { target: { value: 'ken' } });
		await fireEvent.keyDown(raisedBy, { key: 'Enter' });

		expect(raisedBy.value).toBe('Kenya');
		expect(document.activeElement).toBe(screen.getByLabelText('Topic'));
	});

	it('adds the motion, empties the fields but the kind, and puts the cursor back in Raised by', async () => {
		const { onSubmit, raisedBy, form } = renderComposer();

		await fireEvent.focus(raisedBy);
		await fireEvent.input(raisedBy, { target: { value: 'ken' } });
		await fireEvent.keyDown(raisedBy, { key: 'Enter' });
		await fireEvent.input(screen.getByLabelText('Topic'), { target: { value: 'Aid workers' } });
		await fireEvent.submit(form);

		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		const sent = onSubmit.mock.calls[0][0].formData;
		expect(sent.get('proposedBySeatId')).toBe('seat-ke');
		expect(sent.get('topic')).toBe('Aid workers');
		expect(sent.get('newRowId')).toMatch(/^[0-9a-f-]{36}$/);
		expect(screen.getByLabelText<HTMLInputElement>('Topic').value).toBe('');
		expect(raisedBy.value).toBe('');
		expect(document.activeElement).toBe(raisedBy);
		// The list waits for typing, so it does not cover the row of kinds.
		expect(raisedBy.getAttribute('aria-expanded')).toBe('false');
	});

	it('shows what is missing under the fields without sending anything', async () => {
		const { onSubmit, form } = renderComposer();

		await fireEvent.submit(form);

		expect(await screen.findByText('Pick the seat that raised the motion.')).toBeTruthy();
		expect(screen.getByText('A moderated caucus needs a topic.')).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
