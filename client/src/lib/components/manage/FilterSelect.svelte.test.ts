import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FilterSelect from './FilterSelect.svelte';

const COMMITTEE_OPTIONS = [
	{ value: 'disec', label: 'DISEC' },
	{ value: 'unsc', label: 'UNSC' }
];

describe('FilterSelect', () => {
	it('has a label a screen reader can read, and sends its value under its name', () => {
		render(FilterSelect, {
			props: { label: 'Committee', name: 'committee', value: '', options: COMMITTEE_OPTIONS }
		});

		expect(screen.getByLabelText('Committee').getAttribute('name')).toBe('committee');
	});

	it('starts with the placeholder, which sends nothing', () => {
		render(FilterSelect, {
			props: {
				label: 'Committee',
				name: 'committee',
				value: '',
				options: COMMITTEE_OPTIONS,
				placeholder: 'Any committee'
			}
		});

		const select = screen.getByLabelText('Committee') as HTMLSelectElement;

		expect(select.options[0].textContent).toBe('Any committee');
		expect(select.value).toBe('');
	});

	it('shows the choice the page is already on', () => {
		render(FilterSelect, {
			props: {
				label: 'Committee',
				name: 'committee',
				value: 'unsc',
				options: COMMITTEE_OPTIONS,
				placeholder: 'Any committee'
			}
		});

		expect((screen.getByLabelText('Committee') as HTMLSelectElement).value).toBe('unsc');
	});
});
