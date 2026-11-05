import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ChairExpectation } from '$lib/chair-form';
import type { CaucusClockSetting } from '$lib/caucus-clock';
import { chairFrameLinks, type LiveStripRoom } from '$lib/chair-frame';
import type { RoomSeat } from '$lib/committee-room';
import { createInstantForm } from '$lib/instant-form.svelte';
import { modeEndActions } from '$lib/mode-strip';
import { roomFloor } from '$lib/room-presses';
import LiveStrip from './LiveStrip.svelte';

const NOW = new Date('2026-10-01T10:00:00Z');
const CHINA: RoomSeat = { id: 'seat-cn', name: 'China', countryCode: 'CN' };
const UNITED_KINGDOM: RoomSeat = { id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB' };

/** China speaking with 0:47 of 1:30 left, the United Kingdom waiting. */
const GSL: LiveStripRoom = {
	mode: 'formal_debate',
	timer: { totalSeconds: 90, endsAt: '2026-10-01T10:00:47Z', pausedRemainingSeconds: null },
	entries: [
		{ id: 'entry-cn', seat: CHINA, position: 1, status: 'speaking' },
		{ id: 'entry-gb', seat: UNITED_KINGDOM, position: 2, status: 'waiting' }
	],
	currentSpeakerEntryId: 'entry-cn',
	attendance: {},
	speakingTimeSeconds: 90,
	timezone: 'Europe/Amsterdam'
};

/** The strip for `live`, drawn on the Motions view, with a moderated caucus's clock when given. */
function renderStrip(live: LiveStripRoom, caucusClock?: CaucusClockSetting) {
	const form = createInstantForm<ChairExpectation>({ describeFailure: () => 'Not done.' });
	const links = chairFrameLinks('thimun-2027', 'unsc', 'motions');
	const list = {
		id: 'list-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	};

	render(LiveStrip, {
		props: {
			live,
			floor: roomFloor(list, live.entries, live, 90),
			committeeState: {
				mode: live.mode,
				activeSpeakersListId: 'list-1',
				currentSpeakerEntryId: live.currentSpeakerEntryId,
				timer: live.timer
			},
			generalListId: 'list-1',
			roomHref: links.roomHref,
			links,
			clockOffsetMs: 0,
			submitExpecting: form.submitExpecting,
			endActions: modeEndActions('thimun-2027', 'unsc', 'motions'),
			caucusClock
		}
	});
}

/** A button's words, without the hint of its key. */
function wordsOf(element: HTMLElement): string {
	const copy = element.cloneNode(true) as HTMLElement;
	copy.querySelector('kbd')?.remove();

	return copy.textContent?.trim() ?? '';
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('LiveStrip', () => {
	it('names what is live, the speaker and the clock, and leads to the live room', () => {
		renderStrip(GSL);

		const link = screen.getByRole('link');
		expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Live GSL · China · 0:47');
		expect(link.getAttribute('href')).toBe('/conferences/thimun-2027/committees/unsc/chair');
	});

	it("offers the clock, +15 s and the live view's primary, each with its key", () => {
		renderStrip(GSL);

		const buttons = screen.getAllByRole('button');
		expect(buttons.map(wordsOf)).toEqual(['Pause', '+15 s', 'Next: United Kingdom']);
		expect(buttons.map((button) => button.getAttribute('aria-keyshortcuts'))).toEqual([
			'Space',
			'Plus',
			'N'
		]);
	});

	it('posts to the live room, naming the view the chair is on', () => {
		renderStrip(GSL);

		const [pause, , next] = screen.getAllByRole('button');
		const room = '/conferences/thimun-2027/committees/unsc/chair';
		expect(pause.closest('form')?.getAttribute('action')).toBe(
			`${room}?fromView=motions&/timerPause`
		);
		expect(next.closest('form')?.getAttribute('action')).toBe(
			`${room}?fromView=motions&/nextSpeaker`
		);
	});

	it('draws only the primary filled, the one filled button of the strip (P1)', () => {
		renderStrip(GSL);

		const filled = screen
			.getAllByRole('button')
			.filter((button) => button.className.includes('bg-brand-900'));
		expect(filled.map(wordsOf)).toEqual(['Next: United Kingdom']);
	});

	it('offers "Call" alone while nobody has the floor', () => {
		renderStrip({ ...GSL, currentSpeakerEntryId: null });

		expect(screen.getByRole('link').textContent).toContain('GSL · nobody has the floor');
		expect(screen.getAllByRole('button').map(wordsOf)).toEqual(['Call United Kingdom']);
	});

	it('offers +1 min and "End caucus" for an unmoderated caucus', () => {
		renderStrip({
			...GSL,
			mode: 'unmoderated_caucus',
			timer: { totalSeconds: 900, endsAt: '2026-10-01T10:08:42Z', pausedRemainingSeconds: null },
			entries: [],
			currentSpeakerEntryId: null
		});

		expect(screen.getByRole('link').textContent).toContain('Unmod · 8:42 left · back at 12:08');
		expect(screen.getAllByRole('button').map(wordsOf)).toEqual(['Pause', '+1 min', 'End caucus']);
	});

	it('names the caucus clock after the speaker in a moderated caucus (S7)', () => {
		const caucus = {
			totalSeconds: 600,
			endsAt: '2026-10-01T10:06:12Z',
			pausedRemainingSeconds: null
		};
		renderStrip({ ...GSL, mode: 'moderated_caucus' }, caucus);

		expect(screen.getByRole('link').textContent).toContain('Mod · China · 0:47 · caucus 6:12 left');
		expect(screen.getAllByRole('button').map(wordsOf)).toEqual([
			'Pause',
			'+15 s',
			'Next: United Kingdom'
		]);
	});

	it('makes "End caucus" the primary once the caucus time is up, posting the live room’s `endCaucus`', () => {
		const caucus = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 };
		renderStrip({ ...GSL, mode: 'moderated_caucus' }, caucus);

		const end = screen.getByRole('button', { name: 'End caucus' });
		expect(end.closest('form')?.getAttribute('action')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/endCaucus'
		);
		expect(end.getAttribute('aria-keyshortcuts')).toBeNull();
	});

	it('offers "Return to GSL" once nobody waits for a single speaker (S9)', () => {
		const alone = GSL.entries.slice(0, 1);
		renderStrip({ ...GSL, mode: 'single_speaker', entries: alone });

		const back = screen.getByRole('button', { name: 'Return to GSL' });
		expect(back.closest('form')?.getAttribute('action')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/returnToGsl'
		);
	});
});
