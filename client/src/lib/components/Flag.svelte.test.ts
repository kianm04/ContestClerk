import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Flag from './Flag.svelte';

describe('Flag', () => {
	it('reads out the country name rather than the code', () => {
		render(Flag, { props: { countryCode: 'NL' } });

		expect(screen.getByRole('img', { name: 'Netherlands' })).toBeTruthy();
	});

	it('asks flagcdn for the flag of that country', () => {
		render(Flag, { props: { countryCode: 'NL' } });

		expect(screen.getByRole('img', { name: 'Netherlands' }).getAttribute('src')).toBe(
			'https://flagcdn.com/w40/nl.png'
		);
	});

	it('asks for a bigger picture at the larger size', () => {
		render(Flag, { props: { countryCode: 'DE', size: 'md' } });

		expect(screen.getByRole('img', { name: 'Germany' }).getAttribute('src')).toBe(
			'https://flagcdn.com/w80/de.png'
		);
	});

	it('asks for a sharper picture still at the largest size', () => {
		render(Flag, { props: { countryCode: 'FR', size: 'lg' } });

		expect(screen.getByRole('img', { name: 'France' }).getAttribute('src')).toBe(
			'https://flagcdn.com/w160/fr.png'
		);
	});
});
