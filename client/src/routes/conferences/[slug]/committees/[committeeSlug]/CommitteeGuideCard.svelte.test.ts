import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { BackgroundGuide } from '$lib/documents';
import CommitteeGuideCard from './CommitteeGuideCard.svelte';

const GUIDE: BackgroundGuide = {
	id: 'guide-1',
	title: 'UNSC background guide',
	fileName: 'unsc-guide.pdf',
	fileSizeBytes: 2048,
	audience: 'everyone',
	downloadUrl: 'https://storage.example/unsc-guide.pdf?token=abc'
};

describe('CommitteeGuideCard', () => {
	it('shows the title, the file and a download link that opens in a new tab', () => {
		render(CommitteeGuideCard, { props: { guide: GUIDE, isInsider: false } });

		expect(screen.getByRole('heading', { name: 'Background guide' })).toBeTruthy();
		expect(screen.getByText('UNSC background guide')).toBeTruthy();
		expect(screen.getByText(/unsc-guide\.pdf/)).toBeTruthy();

		// jsdom drops the space at the start of the hidden words, which a browser keeps.
		const link = screen.getByRole('link', { name: /Download.*background guide/ });
		expect(link.getAttribute('href')).toBe(GUIDE.downloadUrl);
		expect(link.getAttribute('target')).toBe('_blank');
	});

	it('says so when Storage could not sign a link', () => {
		render(CommitteeGuideCard, {
			props: { guide: { ...GUIDE, downloadUrl: null }, isInsider: true }
		});

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
	});

	it('tells somebody inside the conference that there is no guide yet', () => {
		render(CommitteeGuideCard, { props: { guide: null, isInsider: true } });

		expect(screen.getByText('No background guide yet')).toBeTruthy();
	});

	it('shows a visitor nothing when there is no guide they may download', () => {
		render(CommitteeGuideCard, { props: { guide: null, isInsider: false } });

		expect(screen.queryByRole('heading')).toBeNull();
	});
});
