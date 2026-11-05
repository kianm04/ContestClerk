import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Badge from './Badge.svelte';

describe('Badge', () => {
	it('always says something, because colour is never the only signal', () => {
		render(Badge, { props: { tone: 'success', label: 'Accepted' } });

		expect(screen.getByText('Accepted')).toBeTruthy();
	});

	it('uses the colours of the tone it is given', () => {
		render(Badge, { props: { tone: 'danger', label: 'Not accepted' } });

		expect(screen.getByText('Not accepted').className).toContain('bg-danger-100');
	});

	it('uses different colours for a different tone', () => {
		render(Badge, { props: { tone: 'neutral', label: 'Draft' } });

		expect(screen.getByText('Draft').className).toContain('bg-neutral-100');
	});

	it('can cut a long label short and still offer the whole of it', () => {
		const label = 'Moderated caucus · Piracy off the coast · 10:00 total, 1:00 each';
		render(Badge, { props: { tone: 'brand', label, isShortened: true } });

		const badge = screen.getByText(label);
		expect(badge.className).toContain('truncate');
		expect(badge.getAttribute('title')).toBe(label);
	});
});
