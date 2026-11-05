import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import SourcePaperPanel from './SourcePaperPanel.svelte';

const DRAFT_URL = '/conferences/hmun/committees/disec/resolutions/draft-1' as ResolvedPathname;

describe('SourcePaperPanel', () => {
	it('shows the working paper read only, with a link that closes it', () => {
		render(SourcePaperPanel, {
			source: {
				id: 'working-paper-1',
				title: 'Meaningful human control',
				kindAndNumber: 'Working paper 1.1',
				metaLine: 'Austria, Costa Rica · Introduced 14 March',
				bodyHtml: '<p>Recalling <strong>the Convention</strong>,</p>'
			},
			closeHref: DRAFT_URL
		});

		expect(screen.getByRole('region', { name: 'Working paper 1.1' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Meaningful human control' })).toBeTruthy();
		expect(screen.getByText('Austria, Costa Rica · Introduced 14 March')).toBeTruthy();
		expect(screen.getByText('the Convention').tagName).toBe('STRONG');
		expect(screen.getByRole('link', { name: 'Close Working paper 1.1' }).getAttribute('href')).toBe(
			DRAFT_URL
		);
		expect(screen.queryByRole('textbox')).toBeNull();
	});
});
