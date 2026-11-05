import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AppFooter from './AppFooter.svelte';

describe('AppFooter', () => {
	it('shows the year it is given rather than reading the clock itself', () => {
		render(AppFooter, { props: { year: 2026 } });

		expect(screen.getByRole('link', { name: '© 2026 MUNMeet' })).toBeTruthy();
	});

	it('links to the terms, the privacy policy and the address people write to', () => {
		render(AppFooter, { props: { year: 2026 } });

		expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
		expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
		expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe(
			'mailto:hello@munmeet.app'
		);
	});

	it('makes every link big enough to tap on a phone', () => {
		render(AppFooter, { props: { year: 2026 } });

		// Four small links sit side by side in one row, so each one carries the
		// 44px touch target `03-design/design-system.md` asks for rather than
		// leaving the padding on the row around them.
		for (const name of ['© 2026 MUNMeet', 'Terms', 'Privacy', 'Contact']) {
			expect(screen.getByRole('link', { name }).className).toContain('min-h-11');
		}
	});

	it('is a real <footer>, so a screen reader can jump straight to it', () => {
		const { container } = render(AppFooter, { props: { year: 2026 } });

		expect(container.querySelector('footer')).toBeTruthy();
	});
});
