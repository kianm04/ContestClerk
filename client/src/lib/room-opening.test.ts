import { describe, expect, it } from 'vitest';
import { openingBandLinks, openingRollCall, rollCallDoneText } from './room-opening';

const ROOM = '/conferences/thimun/committees/unsc/chair';

describe('rollCallDoneText', () => {
	it('counts the seats present and says whether the room has a quorum, in the same plain words', () => {
		expect(rollCallDoneText({ presentCount: 6, availableSeats: 6, hasQuorum: true })).toBe(
			'6 of 6 present · quorum met'
		);
		expect(rollCallDoneText({ presentCount: 1, availableSeats: 6, hasQuorum: false })).toBe(
			'1 of 6 present · no quorum'
		);
	});
});

describe('openingRollCall', () => {
	it('is null before the session’s first roll call, when the row offers "Mark all present"', () => {
		expect(openingRollCall({ presentCount: null, availableSeats: 6, hasQuorum: false })).toBeNull();
	});

	it('carries the counts once a roll call exists, or is on its way', () => {
		expect(openingRollCall({ presentCount: 4, availableSeats: 6, hasQuorum: true })).toEqual({
			presentCount: 4,
			availableSeats: 6,
			hasQuorum: true
		});
	});
});

describe('openingBandLinks', () => {
	it('posts "Mark all present" to the roll call view and the agenda to the live room', () => {
		expect(openingBandLinks('thimun', 'unsc', 'chair')).toEqual({
			markAllPresentAction: `${ROOM}/roll-call?/markAllPresent`,
			rollCallHref: `${ROOM}/roll-call`,
			setAgendaAction: `${ROOM}?/setAgenda`
		});
	});

	it('names the GSL view when the band is drawn there, so the chair stays on it', () => {
		const links = openingBandLinks('thimun', 'unsc', 'gsl');

		expect(links.rollCallHref).toBe(`${ROOM}/roll-call?from=gsl`);
		expect(links.setAgendaAction).toBe(`${ROOM}?fromView=gsl&/setAgenda`);
	});
});
