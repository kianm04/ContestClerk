import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ChairExpectation } from '$lib/chair-form';
import { createInstantForm } from '$lib/instant-form.svelte';
import { committeeDisplayUrl, signedInHomeUrl } from '$lib/urls';
import ConsoleTopBar from './ConsoleTopBar.svelte';

const form = createInstantForm<ChairExpectation>({ describeFailure: () => 'Not done.' });

/** The top bar of a committee in the lobby, its name a heading or not. */
function renderTopBar(isNameHeading: boolean, abbreviation: string | null = 'UNSC') {
	render(ConsoleTopBar, {
		props: {
			committee: { name: 'Security Council', abbreviation },
			isNameHeading,
			agenda: {
				topics: [],
				agendaTopic: null,
				setAgendaAction: '/chair?/setAgenda',
				isOpen: false,
				submitExpecting: form.submitExpecting
			},
			liveStatus: null,
			session: null,
			attendance: null,
			role: null,
			displayHref: committeeDisplayUrl('thimun-2027', 'unsc'),
			menu: {
				links: [],
				leaveHref: signedInHomeUrl(),
				areShortcutsOn: true,
				onToggleShortcuts: () => {},
				keyListRequestCount: 0,
				sessionControls: null
			}
		}
	});
}

describe('ConsoleTopBar', () => {
	it('makes the committee the page heading, named in full after its abbreviation', () => {
		renderTopBar(true);

		const heading = screen.getByRole('heading', { level: 1 });
		expect(heading.getAttribute('aria-label')).toBe('UNSC, Security Council');
		expect(heading.getAttribute('title')).toBe('Security Council');
		expect(heading.textContent?.trim()).toBe('UNSC');
	});

	it('names a committee without an abbreviation once', () => {
		renderTopBar(true, null);

		expect(screen.getByRole('heading', { level: 1 }).getAttribute('aria-label')).toBe(
			'Security Council'
		);
	});

	it('leaves the heading to a page that has its own', () => {
		renderTopBar(false);

		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
		expect(screen.getByTitle('Security Council').textContent).toContain('UNSC');
	});

	it('opens the projector’s display in a window of its own, without JavaScript too', () => {
		renderTopBar(true);

		const display = screen.getByRole('link', { name: 'Display' });
		expect(display.getAttribute('href')).toBe('/conferences/thimun-2027/committees/unsc/display');
		expect(display.getAttribute('target')).toBe('_blank');
		expect(display.getAttribute('rel')).toBe('noopener');
	});
});
