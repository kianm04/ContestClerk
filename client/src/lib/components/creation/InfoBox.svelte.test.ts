import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import InfoBox from './InfoBox.svelte';

describe('InfoBox', () => {
	it('puts the title over the text, at the Organisation design’s sizes by default', () => {
		render(InfoBox, { props: { title: 'Applications opening soon', text: 'Open them later.' } });

		expect(screen.getByText('Applications opening soon')).toBeTruthy();
		expect(screen.getByText('Open them later.').classList.contains('fs-16')).toBe(true);
	});

	it('lets a step pass its own size for the sentence, replacing the default', () => {
		render(InfoBox, {
			props: {
				title: 'Applications opening soon',
				text: 'Open them later.',
				textClass: 'fs-15 lh-21'
			}
		});

		const text = screen.getByText('Open them later.');
		expect(text.classList.contains('fs-15')).toBe(true);
		expect(text.classList.contains('fs-16')).toBe(false);
	});
});
