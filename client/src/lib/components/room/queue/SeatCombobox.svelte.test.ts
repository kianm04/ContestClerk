import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { RoomSeat } from '$lib/committee-room';
import { queueSeatOptions, whoOptions, type ListedEntry } from '$lib/seat-search';
import SeatCombobox from './SeatCombobox.svelte';

const CHINA: RoomSeat = {
	id: 'seat-cn',
	name: 'China',
	countryCode: 'CN',
	delegateName: 'Wei Zhang'
};
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GERMANY: RoomSeat = { id: 'seat-de', name: 'Germany', countryCode: 'DE' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const PANAMA: RoomSeat = { id: 'seat-pa', name: 'Panama', countryCode: 'PA' };

/** China has the floor and France waits; Panama is marked absent. */
const ENTRIES: ListedEntry[] = [
	{ status: 'speaking', seat: { id: 'seat-cn' } },
	{ status: 'waiting', seat: { id: 'seat-fr' } }
];

/** The add box over five seats, with `onChoose` and `onEmptySpace` to watch. */
function renderBox() {
	const onChoose = vi.fn();
	const onEmptySpace = vi.fn();
	const optionsFor = (query: string) =>
		queueSeatOptions([CHINA, FRANCE, GERMANY, KENYA, PANAMA], query, {
			entries: ENTRIES,
			attendance: { 'seat-pa': 'absent' }
		});

	render(SeatCombobox, {
		props: {
			id: 'add-box',
			label: 'Add a delegation',
			placeholder: 'Add a delegation…',
			optionsFor,
			keyShortcut: '/',
			onEmptySpace,
			onChoose
		}
	});

	const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Add a delegation' });

	return { input, onChoose, onEmptySpace };
}

/** The words of every option the list shows now. */
function optionTexts(): string[] {
	return screen
		.getAllByRole('option')
		.map((option) => option.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('SeatCombobox', () => {
	it('follows the ARIA combobox pattern, closed until it has the focus', () => {
		const { input } = renderBox();

		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(input.getAttribute('aria-controls')).toBe('add-box-options');
		expect(input.getAttribute('aria-keyshortcuts')).toBe('/');
		expect(document.getElementById('add-box-options')?.getAttribute('role')).toBe('listbox');
		expect(document.activeElement).not.toBe(input);
	});

	it('lists every seat on focus, with the marks, the speaker and a waiting seat not choosable', async () => {
		const { input } = renderBox();

		await fireEvent.focus(input);

		expect(input.getAttribute('aria-expanded')).toBe('true');
		expect(optionTexts()).toEqual([
			'China speaking',
			'France in list',
			'Germany',
			'Kenya',
			'Panama absent · Mark present'
		]);
		const disabled = screen
			.getAllByRole('option')
			.filter((option) => option.getAttribute('aria-disabled') === 'true');
		expect(disabled.map((option) => option.textContent?.trim().split(/\s/)[0])).toEqual([
			'China',
			'France'
		]);
	});

	it('filters by a word of the name, the country code or the delegate as the chair types', async () => {
		const { input } = renderBox();
		await fireEvent.focus(input);

		await fireEvent.input(input, { target: { value: 'ger' } });
		expect(optionTexts()).toEqual(['Germany']);

		await fireEvent.input(input, { target: { value: 'ke' } });
		expect(optionTexts()).toEqual(['Kenya']);

		await fireEvent.input(input, { target: { value: 'wei' } });
		expect(optionTexts()).toEqual(['China speaking']);
	});

	it('says so when nothing matches', async () => {
		const { input } = renderBox();
		await fireEvent.focus(input);

		await fireEvent.input(input, { target: { value: 'xyz' } });

		expect(screen.getByText('No seat matches “xyz”')).toBeTruthy();
	});

	it('chooses the first seat that can be chosen with Enter, empties the box and keeps the focus', async () => {
		const { input, onChoose } = renderBox();
		input.focus();
		await fireEvent.focus(input);

		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ value: 'seat-de' }));

		await fireEvent.input(input, { target: { value: 'ken' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'seat-ke' }));
		expect(input.value).toBe('');
		expect(document.activeElement).toBe(input);
		expect(input.getAttribute('aria-expanded')).toBe('true');
	});

	it('moves the highlight past the seats that cannot be chosen', async () => {
		const { input, onChoose } = renderBox();
		await fireEvent.focus(input);

		expect(input.getAttribute('aria-activedescendant')).toBe('add-box-options-2');

		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(input.getAttribute('aria-activedescendant')).toBe('add-box-options-4');

		// Past the last, round to the first that can be chosen, skipping China and France.
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(input.getAttribute('aria-activedescendant')).toBe('add-box-options-2');

		await fireEvent.keyDown(input, { key: 'ArrowUp' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onChoose).toHaveBeenCalledWith(
			expect.objectContaining({ value: 'seat-pa', marksPresent: true })
		);
	});

	it('chooses a seat on a click, but not one that cannot be chosen', async () => {
		const { input, onChoose } = renderBox();
		await fireEvent.focus(input);

		await fireEvent.click(screen.getByRole('option', { name: /France/ }));
		expect(onChoose).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('option', { name: /Kenya/ }));
		expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ value: 'seat-ke' }));
	});

	it('closes the list on the first Escape and leaves the box on the second', async () => {
		const { input } = renderBox();
		input.focus();
		await fireEvent.focus(input);

		await fireEvent.keyDown(input, { key: 'Escape' });
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(input);

		await fireEvent.keyDown(input, { key: 'Escape' });
		expect(document.activeElement).not.toBe(input);
	});

	it('hands Space in the empty box to the room, and types it once something is typed', async () => {
		const { input, onEmptySpace } = renderBox();
		await fireEvent.focus(input);

		const emptySpace = await fireEvent.keyDown(input, { key: ' ' });
		expect(onEmptySpace).toHaveBeenCalledTimes(1);
		// `fireEvent` answers false when the press was marked handled.
		expect(emptySpace).toBe(false);

		await fireEvent.input(input, { target: { value: 'united' } });
		const typedSpace = await fireEvent.keyDown(input, { key: ' ' });
		expect(onEmptySpace).toHaveBeenCalledTimes(1);
		expect(typedSpace).toBe(true);
	});

	it('keeps a choice in the box and closes its list as a form field (`isPicker`, S7–S9)', async () => {
		const onChoose = vi.fn();
		render(SeatCombobox, {
			props: {
				id: 'who',
				label: 'Who',
				placeholder: 'Search delegations, or type a name',
				optionsFor: (query: string) => whoOptions([FRANCE, KENYA], {}, query),
				onChoose,
				isPicker: true
			}
		});
		const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Who' });

		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: 'Secretary-General' } });
		expect(optionTexts()).toEqual(['Use “Secretary-General” a name, not a seat']);
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ kind: 'name' }));
		expect(input.value).toBe('Secretary-General');
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});
});
