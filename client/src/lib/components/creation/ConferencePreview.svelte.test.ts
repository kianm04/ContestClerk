import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { CreationPreview } from '$lib/creation-draft';
import { SAMPLE_BANNER_IMAGE_PATH } from '$lib/media';
import ConferencePreview from './ConferencePreview.svelte';

const PREVIEW: CreationPreview = {
	name: 'Delft MUN 2027',
	tagline: null,
	bannerPath: null,
	organizedBy: 'Delft MUN',
	facts: [
		{ kind: 'dates', text: '16 – 18 Apr 2027' },
		{ kind: 'place', text: 'Delft, Netherlands' }
	],
	description: null
};

describe('ConferencePreview', () => {
	it('shows the draft with its facts and the note', () => {
		const { container } = render(ConferencePreview, {
			props: {
				preview: PREVIEW,
				note: { title: 'This is a draft conference', text: 'Edit later.' }
			}
		});

		expect(screen.getByRole('heading', { name: 'Conference preview' })).toBeTruthy();
		expect(screen.getByText('Delft MUN 2027')).toBeTruthy();
		expect(screen.getByText('Organised by Delft MUN')).toBeTruthy();
		expect(screen.getByText('Delft, Netherlands')).toBeTruthy();
		// Without a picture the sample banner keeps the panel's shape, with the "Draft" pill on it.
		expect(container.querySelector('img')?.getAttribute('src')).toBe(SAMPLE_BANNER_IMAGE_PATH);
		expect(screen.getByText('Draft')).toBeTruthy();
		expect(screen.getByText('This is a draft conference')).toBeTruthy();
	});

	it('puts the tagline under the name once there is one, as the Basics design does', () => {
		render(ConferencePreview, {
			props: { preview: { ...PREVIEW, tagline: 'Debate. Connect.' }, variant: 'basics' }
		});

		expect(screen.getByText('Debate. Connect.')).toBeTruthy();
		expect(screen.queryByText('Organised by Delft MUN')).toBeNull();
	});

	it('draws the banner with the Draft pill on it, and the description under a rule', () => {
		const { container } = render(ConferencePreview, {
			props: {
				preview: {
					...PREVIEW,
					bannerPath: 'conferences/1/banner.webp',
					description: 'Three days of debate.'
				},
				variant: 'basics'
			}
		});

		const banner = container.querySelector('img');
		expect(banner?.getAttribute('src')).toContain('conferences/1/banner.webp');
		// The Basics design draws the banner 150 design pixels tall.
		expect(banner?.parentElement?.classList.contains('h-37.5')).toBe(true);
		expect(screen.getByText('Draft')).toBeTruthy();
		expect(screen.getByText('Three days of debate.')).toBeTruthy();
	});
});
