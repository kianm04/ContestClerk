import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SearchInput from './SearchInput.svelte';

describe('SearchInput', () => {
	it('has a label a screen reader can read, although none is drawn', () => {
		render(SearchInput, { props: { name: 'q', value: '', placeholder: 'Search conferences' } });

		expect(screen.getByLabelText('Search')).toBeTruthy();
	});

	it('takes another label when the page searches something else', () => {
		render(SearchInput, {
			props: { name: 'q', value: '', placeholder: 'Search delegates', label: 'Search delegates' }
		});

		expect(screen.getByLabelText('Search delegates')).toBeTruthy();
	});

	it('shows the search the page is already on', () => {
		render(SearchInput, { props: { name: 'q', value: 'Hague', placeholder: 'Search' } });

		expect(screen.getByLabelText('Search')).toHaveProperty('value', 'Hague');
	});

	it('falls back to the shared `field-<name>` id when the page names none', () => {
		render(SearchInput, { props: { name: 'q', value: '', placeholder: 'Search' } });

		expect(screen.getByLabelText('Search').getAttribute('id')).toBe('field-q');
	});

	it('takes an id of its own, so two boxes named `q` can share a page', () => {
		render(SearchInput, {
			props: {
				name: 'q',
				value: '',
				placeholder: 'Search conferences',
				inputId: 'header-conference-search'
			}
		});

		// `getByLabelText` only finds the input when the label really points at it.
		expect(screen.getByLabelText('Search').getAttribute('id')).toBe('header-conference-search');
	});

	it('tells the page about every keystroke and navigates nowhere itself', async () => {
		const oninput = vi.fn();
		render(SearchInput, { props: { name: 'q', value: '', placeholder: 'Search', oninput } });

		await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'Ha' } });

		expect(oninput).toHaveBeenCalledOnce();
	});

	it('tells the page about every key pressed, so it can act on Enter itself', async () => {
		const onkeydown = vi.fn();
		render(SearchInput, { props: { name: 'q', value: '', placeholder: 'Search', onkeydown } });

		await fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });

		expect(onkeydown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
	});

	it('shows a new search the page sends, over anything already typed', async () => {
		// This is how "Reset" on `/conferences` empties the box: the address
		// changes, the page hands the box a new value, and it has to follow.
		const { rerender } = render(SearchInput, {
			props: { name: 'q', value: 'Vienna', placeholder: 'Search' }
		});

		const input = screen.getByLabelText('Search');
		await fireEvent.input(input, { target: { value: 'Berlin' } });

		await rerender({ name: 'q', value: '', placeholder: 'Search' });

		expect(input).toHaveProperty('value', '');
	});

	it('keeps what was typed when the page sends the same value again', async () => {
		// Fresh page data builds a new object with the same text in it; see TextField's test.
		let query = $state({ text: 'Vienna' });
		render(SearchInput, {
			props: {
				name: 'q',
				placeholder: 'Search conferences',
				get value() {
					return query.text;
				}
			}
		});

		const input = screen.getByLabelText('Search');
		await fireEvent.input(input, { target: { value: 'Rotterdam' } });

		query = { text: 'Vienna' };
		flushSync();

		expect(input).toHaveProperty('value', 'Rotterdam');
	});
});
