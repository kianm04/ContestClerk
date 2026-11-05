import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConferenceThumb from './ConferenceThumb.svelte';

const BANNER_PATH = 'conferences/11111111/banner-a1.jpg';

/**
 * The width and height classes of an element, sorted, so the picture and the
 * empty slot can be checked for the same size whatever else they carry.
 */
function sizeClasses(element: Element | null): string[] {
	return Array.from(element?.classList ?? [])
		.filter((className) => /^(sm:)?[wh]-/.test(className))
		.sort();
}

describe('ConferenceThumb', () => {
	it('draws the banner cropped to the slot, with a hairline inside its edge', () => {
		const { container } = render(ConferenceThumb, { props: { bannerPath: BANNER_PATH } });

		const picture = container.querySelector('img');

		expect(picture?.getAttribute('src')).toContain(BANNER_PATH);
		expect(picture?.className).toContain('object-cover');
		expect(picture?.className).toContain('-outline-offset-1');
	});

	it('leaves the picture silent for a screen reader, because the name is beside it', () => {
		render(ConferenceThumb, { props: { bannerPath: BANNER_PATH } });

		// An `<img alt="">` has no role, so nothing here is an image to a screen reader.
		expect(screen.queryByRole('img')).toBeNull();
	});

	it('draws an empty slot of the same size without a banner, so the names line up', () => {
		const withPicture = render(ConferenceThumb, { props: { bannerPath: BANNER_PATH } });
		const withoutPicture = render(ConferenceThumb, { props: { bannerPath: null } });

		const slot = withoutPicture.container.firstElementChild;

		expect(withoutPicture.container.querySelector('img')).toBeNull();
		expect(sizeClasses(slot)).toEqual(sizeClasses(withPicture.container.querySelector('img')));
		expect(sizeClasses(slot).length).toBeGreaterThan(0);
	});

	it('never draws initials or any words in place of a missing banner', () => {
		const { container } = render(ConferenceThumb, { props: { bannerPath: null } });

		expect(container.textContent?.trim()).toBe('');
	});
});
