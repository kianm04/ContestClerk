import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { ConferenceHero } from '$lib/home-hero';
import { committeeLiveUrl, committeeUrl, conferenceScheduleUrl, invoiceUrl } from '$lib/urls';
import HeroFacts from './HeroFacts.svelte';

const DOOR = committeeUrl('amsterdam-open-mun-2027', 'unhrc');

/** Sofia's hero eight months out, section 2b of `docs/home.md`. */
function makeHero(overrides: Partial<ConferenceHero> = {}): ConferenceHero {
	return {
		kind: 'conference',
		conferenceId: 'conference-amsterdam',
		slug: 'amsterdam-open-mun-2027',
		name: 'Amsterdam Open MUN 2027',
		href: DOOR,
		bannerPath: 'conferences/amsterdam/banner.jpg',
		timezone: 'Europe/Amsterdam',
		label: { text: 'Your next conference', isLive: false },
		metaLine: 'Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam',
		figures: [
			{ value: '8 months', label: 'to go' },
			{ value: 'Morocco', label: 'UNHRC', flagCountryCode: 'MA' }
		],
		nextStep: {
			taskId: 'invoice:invoice-1',
			title: 'Pay invoice rotterdammun-2026-0001',
			detail: 'Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026',
			due: { text: 'Overdue', tone: 'danger', hasDot: true }
		},
		primary: { label: 'Pay invoice', href: invoiceUrl('invoice-1') },
		secondary: { label: 'Open committee page', href: DOOR },
		...overrides
	};
}

/** Sofia on day 2, UNHRC in session: section 6(c). */
function makeLiveHero(): ConferenceHero {
	return makeHero({
		label: { text: 'Running now · day 2 of 3', isLive: true },
		figures: [
			{ value: 'In session', label: 'UNHRC · Session 3' },
			{ value: 'Morocco', label: 'UNHRC', flagCountryCode: 'MA' },
			{ value: '12:30', label: 'Next: Lunch · Atrium' }
		],
		nextStep: null,
		primary: {
			label: 'Open live room',
			href: committeeLiveUrl('amsterdam-open-mun-2027', 'unhrc')
		},
		secondary: {
			label: "Today's programme",
			href: conferenceScheduleUrl('amsterdam-open-mun-2027')
		}
	});
}

describe('HeroFacts', () => {
	it('names the conference as the page’s h1, a link to the reader’s own door', () => {
		render(HeroFacts, { props: { hero: makeHero() } });

		const heading = screen.getByRole('heading', { level: 1 });
		const link = within(heading).getByRole('link');

		expect(heading.textContent?.trim()).toBe('Amsterdam Open MUN 2027');
		expect(link.getAttribute('href')).toBe(DOOR);
		expect(heading.className).toContain('font-display');
		// The padding makes the name a 44px target on a phone; the negative margin keeps the line where it was.
		expect(link.className).toContain('py-1.5');
		expect(link.className).toContain('-my-1.5');
	});

	it('writes the label plain and the meta line under the name on an ordinary day', () => {
		const { container } = render(HeroFacts, { props: { hero: makeHero() } });

		expect(screen.getByText('Your next conference').className).toContain('text-muted-foreground');
		expect(
			screen.getByText('Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam')
		).toBeTruthy();
		expect(container.querySelector('.bg-ring')).toBeNull();
	});

	it('gives the label a light-blue dot on a conference day', () => {
		const { container } = render(HeroFacts, { props: { hero: makeLiveHero() } });

		expect(screen.getByText('Running now · day 2 of 3')).toBeTruthy();
		expect(container.querySelector('.bg-ring')).toBeTruthy();
	});

	it('draws the figures as a strip, the seat with its flag before it', () => {
		render(HeroFacts, { props: { hero: makeHero() } });

		const figures = screen.getAllByRole('listitem');

		expect(figures).toHaveLength(2);
		expect(figures[0].textContent).toContain('8 months');
		expect(figures[0].textContent).toContain('to go');
		expect(figures[1].textContent).toContain('Morocco');
		expect(figures[1].textContent).toContain('UNHRC');
		// The flag is hidden from a screen reader on purpose: the value already names the country.
		expect(figures[1].querySelector('img[alt="Morocco"]')).toBeTruthy();
	});

	it('draws no strip at all when there is no figure', () => {
		render(HeroFacts, { props: { hero: makeHero({ figures: [] }) } });

		expect(screen.queryByRole('list')).toBeNull();
	});

	it('writes the next step only when the hero took one', () => {
		const { unmount } = render(HeroFacts, { props: { hero: makeHero() } });

		expect(screen.getByText('Next step')).toBeTruthy();
		expect(screen.getByText('Pay invoice rotterdammun-2026-0001')).toBeTruthy();
		unmount();

		render(HeroFacts, { props: { hero: makeLiveHero() } });

		expect(screen.queryByText('Next step')).toBeNull();
	});

	it('ends with the one button and the link beside it', () => {
		const { container } = render(HeroFacts, { props: { hero: makeHero() } });

		expect(container.querySelectorAll('.bg-primary')).toHaveLength(1);
		expect(screen.getByRole('link', { name: 'Pay invoice' }).className).toContain('bg-primary');
		expect(screen.getByRole('link', { name: 'Open committee page' }).getAttribute('href')).toBe(
			DOOR
		);
	});
});
