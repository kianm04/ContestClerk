import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { ConferenceRowData } from '$lib/home-rows';
import ConferenceRow from './ConferenceRow.svelte';

const BANNER_PATH = 'conferences/11111111/banner-a1.jpg';

/**
 * Sofia's row for Amsterdam, as `conferenceRows` words a seat: the committee,
 * the seat with its flag, the dates and the city. Each test spreads it and
 * overrides only what it is about.
 */
function makeRow(overrides: Partial<ConferenceRowData> = {}): ConferenceRowData {
	return {
		id: 'conference-1',
		name: 'Amsterdam Open MUN 2027',
		href: '/conferences/amsterdam-open-mun-2027/committees/unhrc' as ResolvedPathname,
		bannerPath: BANNER_PATH,
		metaParts: ['UNHRC', 'Morocco', '25 – 27 Jul 2027', 'Amsterdam'],
		flagCountryCode: 'MA',
		status: { text: 'In 8 months', tone: 'neutral', hasDot: false },
		...overrides
	};
}

/** An organiser's row: no flag, and the manage list's status word. */
const organiserRow = makeRow({
	id: 'conference-2',
	name: 'BERMUN 2026',
	href: '/manage/bermun-2026' as ResolvedPathname,
	bannerPath: null,
	metaParts: ['Organiser', '25 – 29 Dec 2026', 'Berlin'],
	flagCountryCode: null,
	status: { text: 'Applications open', tone: 'success', hasDot: true }
});

/** The words of an element with the markup's line breaks squeezed to single spaces. */
function words(element: Element | null | undefined): string {
	return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('ConferenceRow', () => {
	it('is one link to the reader’s own door, with the name as a serif heading', () => {
		render(ConferenceRow, { props: { row: makeRow(), hasThumb: true } });

		const link = screen.getByRole('link');
		const heading = within(link).getByRole('heading', { level: 3 });

		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(link.getAttribute('href')).toBe('/conferences/amsterdam-open-mun-2027/committees/unhrc');
		expect(link.className).toContain('hover:bg-accent');
		expect(heading.textContent).toBe('Amsterdam Open MUN 2027');
		expect(heading.className).toContain('font-display');
	});

	it('joins the meta parts with a middle dot', () => {
		const { container } = render(ConferenceRow, {
			props: { row: organiserRow, hasThumb: false }
		});

		expect(words(container.querySelector('p'))).toBe('Organiser · 25 – 29 Dec 2026 · Berlin');
	});

	it('draws the seat’s flag between the committee and the seat’s name, silent for a screen reader', () => {
		const { container } = render(ConferenceRow, { props: { row: makeRow(), hasThumb: true } });

		const meta = container.querySelector('p');
		const flag = meta?.querySelector('img');
		const flagSlot = flag?.parentElement;

		expect(flag?.getAttribute('alt')).toBe('Morocco');
		expect(flagSlot?.getAttribute('aria-hidden')).toBe('true');
		// The committee before the flag, the seat and the rest after it.
		expect(words(flagSlot?.previousElementSibling)).toBe('UNHRC ·');
		expect(words(flagSlot?.nextElementSibling)).toBe('Morocco · 25 – 27 Jul 2027 · Amsterdam');
		expect(words(meta)).toBe('UNHRC · Morocco · 25 – 27 Jul 2027 · Amsterdam');
	});

	it('draws no flag for a seat that is not a country', () => {
		const pressSeat = makeRow({
			metaParts: ['UNHRC', 'Press', '25 – 27 Jul 2027', 'Amsterdam'],
			flagCountryCode: null
		});

		const { container } = render(ConferenceRow, { props: { row: pressSeat, hasThumb: false } });

		expect(container.querySelector('p img')).toBeNull();
		expect(words(container.querySelector('p'))).toBe(
			'UNHRC · Press · 25 – 27 Jul 2027 · Amsterdam'
		);
	});

	it('writes the status word plainly when its colour would add nothing', () => {
		render(ConferenceRow, { props: { row: makeRow(), hasThumb: true } });

		const word = screen.getByText('In 8 months');

		expect(word.className).toContain('text-small');
		expect(word.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	it('gives the status word a dot in its colour when the colour says something', () => {
		render(ConferenceRow, { props: { row: organiserRow, hasThumb: false } });

		const word = screen.getByText('Applications open');
		const dot = word.querySelector('[aria-hidden="true"]');

		expect(dot?.className).toContain('bg-success');
	});

	it('marks a conference running today with a light-blue dot', () => {
		const today = makeRow({ status: { text: 'Today', tone: 'brand', hasDot: true } });

		render(ConferenceRow, { props: { row: today, hasThumb: true } });

		expect(screen.getByText('Today').querySelector('[aria-hidden="true"]')?.className).toContain(
			'bg-ring'
		);
	});

	it('draws the banner as a thumbnail when the list has a thumbnail column', () => {
		render(ConferenceRow, { props: { row: makeRow(), hasThumb: true } });

		const thumb = screen.getByRole('link').querySelector(':scope > img');

		expect(thumb?.getAttribute('src')).toContain(BANNER_PATH);
		expect(thumb?.className).toContain('object-cover');
	});

	it('keeps an empty slot for a row without a banner, so the names line up', () => {
		render(ConferenceRow, { props: { row: organiserRow, hasThumb: true } });

		const link = screen.getByRole('link');
		const slot = link.querySelector(':scope > [aria-hidden="true"]');

		expect(link.querySelector('img')).toBeNull();
		expect(slot?.className).toContain('sm:w-24');
		expect(slot?.textContent?.trim()).toBe('');
	});

	it('leaves the thumbnail column out when no row in the list has a banner', () => {
		render(ConferenceRow, { props: { row: organiserRow, hasThumb: false } });

		const link = screen.getByRole('link');

		expect(link.querySelector('img')).toBeNull();
		expect(link.querySelector(':scope > [aria-hidden="true"]')).toBeNull();
		// Only the text block is left in the row.
		expect(link.children).toHaveLength(1);
	});
});
