import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { committeePapersUrl } from '$lib/urls';
import LiveContext from './LiveContext.svelte';

/** The context line for Brazil's delegate, five of six present, connected. */
function renderContext(overrides: Record<string, unknown> = {}) {
	return render(LiveContext, {
		props: {
			committee: { name: 'Security Council', abbreviation: 'UNSC' },
			agendaTopic: 'Humanitarian access',
			seatName: 'Brazil',
			attendanceText: '5/6 present',
			liveStatus: 'live',
			papersTitle: 'Resolutions',
			papersHref: committeePapersUrl('thimun-2027', 'unsc'),
			...overrides
		}
	});
}

/** The quiet line under the heading, its spaces made single. */
function factsLine(container: HTMLElement): string {
	return (container.querySelector('header p')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('LiveContext', () => {
	it('names the committee and the agenda, the reader\'s seat, who is present and "Connected"', () => {
		const { container } = renderContext();

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'UNSC · Humanitarian access'
		);
		expect(factsLine(container)).toBe('Brazil · 5/6 present · Connected');
	});

	it('names the abbreviation alone with no agenda, and the name with no abbreviation', () => {
		const abbreviation = renderContext({ agendaTopic: null });
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('UNSC');
		abbreviation.unmount();

		renderContext({
			committee: { name: 'Security Council', abbreviation: null },
			agendaTopic: null
		});
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Security Council');
	});

	it('says "Reconnecting…" while paused, and gives staff watching no seat', () => {
		const { container } = renderContext({ seatName: null, liveStatus: 'paused' });

		expect(factsLine(container)).toBe('5/6 present · Reconnecting…');
	});

	it('claims no connection before the page has listened, as without JavaScript', () => {
		const { container } = renderContext({ attendanceText: null, liveStatus: null });

		expect(factsLine(container)).toBe('Brazil');
	});

	it("links to the committee's papers beside the heading, by the committee's word for them", () => {
		const standard = renderContext();
		expect(screen.getByRole('link', { name: 'Resolutions' }).getAttribute('href')).toBe(
			committeePapersUrl('thimun-2027', 'unsc')
		);
		standard.unmount();

		renderContext({ papersTitle: 'Directives' });
		expect(screen.getByRole('link', { name: 'Directives' })).toBeTruthy();
	});
});
