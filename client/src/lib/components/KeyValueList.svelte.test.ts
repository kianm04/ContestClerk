import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import KeyValueList from './KeyValueList.svelte';

const items = [
	{ label: 'Venue', value: 'World Forum' },
	{ label: 'Timezone', value: 'Europe/Amsterdam' }
];

describe('KeyValueList', () => {
	it('shows every fact with its name', () => {
		render(KeyValueList, { props: { items } });

		expect(screen.getByText('Venue')).toBeTruthy();
		expect(screen.getByText('World Forum')).toBeTruthy();
		expect(screen.getByText('Europe/Amsterdam')).toBeTruthy();
	});

	it('pairs each name with its value in a description list', () => {
		const { container } = render(KeyValueList, { props: { items } });

		expect(container.querySelectorAll('dt')).toHaveLength(2);
		expect(container.querySelectorAll('dd')).toHaveLength(2);
	});

	it('draws a flag before a country, and none before any other fact', () => {
		const { container } = render(KeyValueList, {
			props: { items: [...items, { label: 'Country', value: 'Netherlands', countryCode: 'NL' }] }
		});

		const flags = container.querySelectorAll('dd img');

		expect(flags).toHaveLength(1);
		expect(flags[0].closest('dd')?.textContent).toBe('Netherlands');
	});

	it('gives each value exactly its own words, with no space before them', () => {
		const { container } = render(KeyValueList, { props: { items } });

		const values = [...container.querySelectorAll('dd')].map((value) => value.textContent);

		expect(values).toEqual(items.map((item) => item.value));
	});

	it('shows nothing at all for an empty list', () => {
		const { container } = render(KeyValueList, { props: { items: [] } });

		expect(container.querySelectorAll('dt')).toHaveLength(0);
	});
});
