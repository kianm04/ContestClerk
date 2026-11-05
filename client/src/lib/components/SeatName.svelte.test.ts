import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SeatName from './SeatName.svelte';

describe('SeatName', () => {
	it('draws the flag of a country seat in front of its name', () => {
		const { container } = render(SeatName, { props: { name: 'Canada', countryCode: 'CA' } });

		expect(screen.getByText('Canada')).toBeTruthy();
		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://flagcdn.com/w40/ca.png'
		);
	});

	it('hides the flag from a screen reader, because the name already says the country', () => {
		render(SeatName, { props: { name: 'Canada', countryCode: 'CA' } });

		expect(screen.queryByRole('img')).toBeNull();
	});

	it('draws the name alone for a seat that is not a country', () => {
		const { container } = render(SeatName, { props: { name: 'Press', countryCode: null } });

		expect(screen.getByText('Press')).toBeTruthy();
		expect(container.querySelector('img')).toBeNull();
	});
});
