import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { ConferenceHero } from '$lib/home-hero';
import { committeeLiveUrl, committeeUrl, conferenceScheduleUrl, invoiceUrl } from '$lib/urls';
import HomeHero from './HomeHero.svelte';

const DOOR = committeeUrl('amsterdam-open-mun-2027', 'unhrc');
const BANNER_PATH = 'conferences/amsterdam/banner.jpg';

/** Sofia's hero eight months out, section 2b of `docs/home.md`. */
function makeHero(overrides: Partial<ConferenceHero> = {}): ConferenceHero {
	return {
		kind: 'conference',
		conferenceId: 'conference-amsterdam',
		slug: 'amsterdam-open-mun-2027',
		name: 'Amsterdam Open MUN 2027',
		href: DOOR,
		bannerPath: BANNER_PATH,
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

/** The panel itself: the shadcn card the hero is drawn in. */
function panel(container: HTMLElement): Element {
	return container.querySelector('[data-slot="card"]')!;
}

/** The hero's photographs, which alone have an empty `alt`; a flag has the country's name. */
function photos(container: HTMLElement): NodeListOf<HTMLImageElement> {
	return container.querySelectorAll('img[alt=""]');
}

describe('HomeHero', () => {
	it('is white with a hairline border on an ordinary day, and no shadow', () => {
		const { container } = render(HomeHero, { props: { hero: makeHero() } });

		expect(panel(container).className).toContain('border-border');
		expect(panel(container).className).toContain('shadow-none');
		expect(panel(container).className).not.toContain('bg-accent');
		expect(container.querySelector('.bg-ring')).toBeNull();
	});

	it('takes the light-blue fill and loses its border on a conference day, with a dot on the label', () => {
		const { container } = render(HomeHero, { props: { hero: makeLiveHero() } });

		expect(panel(container).className).toContain('bg-accent');
		expect(panel(container).className).not.toContain('border-border');
		expect(screen.getByText('Running now · day 2 of 3')).toBeTruthy();
		expect(container.querySelector('.bg-ring')).toBeTruthy();
	});

	it('names the conference as the page’s h1, linking to the reader’s door', () => {
		render(HomeHero, { props: { hero: makeHero() } });

		const heading = screen.getByRole('heading', { level: 1 });

		expect(heading.textContent?.trim()).toBe('Amsterdam Open MUN 2027');
		expect(within(heading).getByRole('link').getAttribute('href')).toBe(DOOR);
		expect(screen.getAllByRole('heading')).toHaveLength(1);
	});

	it('draws the banner once, first on a phone and in a column of its own from md up', () => {
		const { container } = render(HomeHero, { props: { hero: makeHero() } });

		const pictures = photos(container);

		expect(pictures).toHaveLength(1);
		expect(pictures[0].getAttribute('src')).toContain(BANNER_PATH);
		// The 3:1 strip across the top on a phone, the 3:2 photo in the right-hand column from `md` up.
		expect(pictures[0].className).toContain('aspect-[3/1]');
		expect(pictures[0].className).toContain('md:aspect-[3/2]');
		expect(pictures[0].parentElement?.className).toContain('order-first');
		expect(pictures[0].parentElement?.className).toContain('md:order-last');
		expect(pictures[0].parentElement?.className).toContain('md:w-[22rem]');
	});

	it('draws no picture and nothing in its place without a banner', () => {
		const { container } = render(HomeHero, { props: { hero: makeHero({ bannerPath: null }) } });

		expect(photos(container)).toHaveLength(0);
		expect(container.querySelector('[class*="md:w-[22rem]"]')).toBeNull();
		// Still every fact, with the whole width to itself.
		expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
		expect(screen.getByText('8 months')).toBeTruthy();
	});

	it('has exactly one filled button, and the door as a text link beside it', () => {
		const { container } = render(HomeHero, { props: { hero: makeHero() } });

		const button = screen.getByRole('link', { name: 'Pay invoice' });
		const door = screen.getByRole('link', { name: 'Open committee page' });

		expect(container.querySelectorAll('.bg-primary')).toHaveLength(1);
		expect(button.className).toContain('bg-primary');
		expect(button.getAttribute('href')).toBe(invoiceUrl('invoice-1'));
		expect(door.className).not.toContain('bg-primary');
		expect(door.getAttribute('href')).toBe(DOOR);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('writes the next step block only when the hero took a task', () => {
		const { unmount } = render(HomeHero, { props: { hero: makeHero() } });

		expect(screen.getByText('Next step')).toBeTruthy();
		expect(screen.getByText('Pay invoice rotterdammun-2026-0001')).toBeTruthy();
		expect(screen.getByText('Overdue')).toBeTruthy();
		expect(
			screen.getByText('Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026')
		).toBeTruthy();
		unmount();

		render(HomeHero, { props: { hero: makeLiveHero() } });

		expect(screen.queryByText('Next step')).toBeNull();
		expect(screen.getByRole('link', { name: 'Open live room' }).className).toContain('bg-primary');
	});

	it('draws the figures with the seat’s flag, and no strip when there is none', () => {
		const { unmount } = render(HomeHero, { props: { hero: makeLiveHero() } });

		const figures = screen.getAllByRole('listitem');

		expect(figures.map((figure) => figure.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'In session UNHRC · Session 3',
			'Morocco UNHRC',
			'12:30 Next: Lunch · Atrium'
		]);
		// The flag is hidden from a screen reader on purpose: the value already names the country.
		expect(figures[1].querySelector('img[alt="Morocco"]')).toBeTruthy();
		unmount();

		render(HomeHero, { props: { hero: makeHero({ figures: [] }) } });

		expect(screen.queryByRole('list')).toBeNull();
	});

	it('draws the button alone when the door is where the button already leads', () => {
		render(HomeHero, { props: { hero: makeHero({ secondary: null }) } });

		// The name's link and the button: nothing else.
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});
});
