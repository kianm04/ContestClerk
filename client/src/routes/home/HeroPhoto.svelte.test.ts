import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import HeroPhoto from './HeroPhoto.svelte';

const BANNER_PATH = 'conferences/11111111/banner-a1.jpg';

describe('HeroPhoto', () => {
	it('draws the banner once, cropped from its centre to fill its shape', () => {
		const { container } = render(HeroPhoto, { props: { bannerPath: BANNER_PATH } });

		const pictures = container.querySelectorAll('img');

		expect(pictures).toHaveLength(1);
		expect(pictures[0].getAttribute('src')).toContain(BANNER_PATH);
		expect(pictures[0].className).toContain('w-full');
		expect(pictures[0].className).toContain('object-cover');
		expect(pictures[0].className).toContain('object-center');
	});

	it('is a 3:1 strip across the panel on a phone, rounded only at the top and with no hairline', () => {
		const { container } = render(HeroPhoto, { props: { bannerPath: BANNER_PATH } });

		const picture = container.querySelector('img');

		expect(picture?.className).toContain('aspect-[3/1]');
		expect(picture?.className).toContain('rounded-t-[0.625rem]');
		// Every outline class waits for `md`, so the strip has no hairline.
		expect(picture?.className).not.toMatch(/(^|\s)-?outline/);
	});

	it('is the 3:2 photograph with a hairline inside its edge from md up', () => {
		const { container } = render(HeroPhoto, { props: { bannerPath: BANNER_PATH } });

		const picture = container.querySelector('img');

		expect(picture?.className).toContain('md:aspect-[3/2]');
		expect(picture?.className).toContain('md:rounded-md');
		expect(picture?.className).toContain('md:-outline-offset-1');
	});

	it('leaves the picture silent for a screen reader, because the name is beside it', () => {
		render(HeroPhoto, { props: { bannerPath: BANNER_PATH } });

		// An `<img alt="">` has no role, so nothing here is an image to a screen reader.
		expect(screen.queryByRole('img')).toBeNull();
	});
});
