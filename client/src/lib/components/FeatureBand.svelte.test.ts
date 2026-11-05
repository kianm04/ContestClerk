import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import FeatureBand from './FeatureBand.svelte';

const band = {
	eyebrow: 'For organisers',
	title: 'One place for the whole conference',
	description: 'Applications, allocation, fees and the committee room.'
};

describe('FeatureBand', () => {
	it('shows the eyebrow, the title and the description', () => {
		render(FeatureBand, { props: band });

		expect(screen.getByText('For organisers')).toBeTruthy();
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
			'One place for the whole conference'
		);
		expect(screen.getByText('Applications, allocation, fees and the committee room.')).toBeTruthy();
	});

	it('shows no picture and no placeholder when it was given neither', () => {
		const { container } = render(FeatureBand, { props: band });

		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('.bg-brand-50')).toBeNull();
	});

	it('shows the picture when there is one', () => {
		const { container } = render(FeatureBand, {
			props: { ...band, imagePath: 'marketing/room.jpg' }
		});

		expect(container.querySelector('img')?.getAttribute('src')).toContain('marketing/room.jpg');
	});

	it('puts the picture first from the md width up when it is reversed', () => {
		const { container } = render(FeatureBand, {
			props: { ...band, imagePath: 'marketing/room.jpg', isReversed: true }
		});

		expect(container.querySelector('img')?.className).toContain('md:order-1');
	});

	it('draws the placeholder box with its caption while the screenshot is missing', () => {
		const { container } = render(FeatureBand, {
			props: { ...band, imageCaption: 'The applications table' }
		});

		expect(screen.getByText('The applications table')).toBeTruthy();
		expect(container.querySelector('img')).toBeNull();
	});

	it('shows the picture rather than the placeholder when it has both', () => {
		const { container } = render(FeatureBand, {
			props: { ...band, imagePath: 'marketing/room.jpg', imageCaption: 'The applications table' }
		});

		expect(container.querySelector('img')).toBeTruthy();
		expect(screen.queryByText('The applications table')).toBeNull();
	});

	it('gives the picture its caption as alt text', () => {
		render(FeatureBand, {
			props: { ...band, imagePath: 'marketing/room.jpg', imageCaption: 'The applications table' }
		});

		expect(screen.getByRole('img', { name: 'The applications table' })).toBeTruthy();
	});

	it('leaves a picture without a caption out of what a screen reader reads', () => {
		const { container } = render(FeatureBand, {
			props: { ...band, imagePath: 'marketing/room.jpg' }
		});

		expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
	});

	it('puts the placeholder on the side the picture would take when it is reversed', () => {
		render(FeatureBand, {
			props: { ...band, imageCaption: 'The applications table', isReversed: true }
		});

		expect(screen.getByText('The applications table').className).toContain('md:order-1');
	});

	it('puts the picture above the text on a phone, whichever way round the band is', () => {
		// `05-pages/public/for-organisers.md` asks for the picture on top at phone
		// width on every band, so the plain `order-*` classes are the same for a
		// reversed band and an ordinary one. Only the `md:` pair alternates.
		for (const isReversed of [false, true]) {
			const { container } = render(FeatureBand, {
				props: { ...band, imagePath: 'marketing/room.jpg', isReversed }
			});

			expect(container.querySelector('img')?.className).toContain('order-1');
			expect(screen.getAllByText(band.title).at(-1)?.parentElement?.className).toContain('order-2');
		}
	});

	it('shows the button written between its tags', () => {
		const children = createRawSnippet(() => ({ render: () => '<a href="/create">Start</a>' }));

		render(FeatureBand, { props: { ...band, children } });

		expect(screen.getByRole('link', { name: 'Start' })).toBeTruthy();
	});
});
