import { describe, expect, it } from 'vitest';
import {
	audienceChoiceForReader,
	committeesPermitting,
	mayAddress,
	mayChangeAnnouncement
} from './programme-access';
import { NO_PERMISSIONS, type MyPermissions, type Permission } from './permissions';

/** One conference-wide role holding these permissions. */
function holding(...keys: Permission[]): MyPermissions {
	return {
		held: keys.map((permission) => ({ permission, scope: 'conference' })),
		committeeIds: [],
		rank: 1
	};
}

/** A role per committee holding these permissions, assigned to committee `unsc`. */
function chairing(...keys: Permission[]): MyPermissions {
	return {
		held: keys.map((permission) => ({ permission, scope: 'committees' })),
		committeeIds: ['unsc'],
		rank: 2
	};
}

const TO_EVERYONE = { audience: 'everyone', committeeId: null };
const TO_UNSC = { audience: 'committee', committeeId: 'unsc' };
const TO_WHO = { audience: 'committee', committeeId: 'who' };

describe('mayAddress', () => {
	it('lets a conference-wide holder address anybody', () => {
		const press = holding('send_announcements');

		expect(mayAddress(press, TO_EVERYONE, 'send_announcements')).toBe(true);
		expect(mayAddress(press, TO_WHO, 'send_announcements')).toBe(true);
		expect(mayAddress(holding('administrator'), TO_EVERYONE, 'edit_schedule')).toBe(true);
	});

	it('lets a holder per committee address only their own committees', () => {
		const chair = chairing('send_announcements');

		expect(mayAddress(chair, TO_UNSC, 'send_announcements')).toBe(true);
		expect(mayAddress(chair, TO_WHO, 'send_announcements')).toBe(false);
		expect(mayAddress(chair, TO_EVERYONE, 'send_announcements')).toBe(false);
	});

	it('asks for the permission named, and refuses a committee left blank', () => {
		const chair = chairing('send_announcements');

		expect(mayAddress(chair, TO_UNSC, 'edit_schedule')).toBe(false);
		expect(
			mayAddress(chair, { audience: 'committee', committeeId: '' }, 'send_announcements')
		).toBe(false);
		expect(mayAddress(NO_PERMISSIONS, TO_UNSC, 'send_announcements')).toBe(false);
	});
});

describe('committeesPermitting', () => {
	const committees = [{ id: 'unsc' }, { id: 'who' }];

	it('gives a conference-wide holder every committee', () => {
		expect(committeesPermitting(holding('edit_schedule'), committees, 'edit_schedule')).toEqual(
			committees
		);
	});

	it('gives a holder per committee their own', () => {
		expect(committeesPermitting(chairing('edit_schedule'), committees, 'edit_schedule')).toEqual([
			{ id: 'unsc' }
		]);
		expect(committeesPermitting(chairing('run_room'), committees, 'edit_schedule')).toEqual([]);
	});
});

describe('mayChangeAnnouncement', () => {
	it('lets a conference-wide announcer change anybody’s', () => {
		const announcement = { ...TO_UNSC, authorId: 'somebody-else' };

		expect(mayChangeAnnouncement(holding('send_announcements'), announcement, 'me')).toBe(true);
	});

	it('lets an author change theirs while they may still address its audience', () => {
		const mine = { ...TO_UNSC, authorId: 'me' };

		expect(mayChangeAnnouncement(chairing('send_announcements'), mine, 'me')).toBe(true);
		expect(mayChangeAnnouncement(chairing('run_room'), mine, 'me')).toBe(false);
	});

	it('does not let a chair change another author’s announcement to their room', () => {
		const theirs = { ...TO_UNSC, authorId: 'co-chair' };

		expect(mayChangeAnnouncement(chairing('send_announcements'), theirs, 'me')).toBe(false);
	});
});

describe('audienceChoiceForReader', () => {
	const toEveryone = { audience: 'everyone', committeeId: '', delegationId: '' };

	it('keeps the choice of a conference-wide announcer', () => {
		expect(audienceChoiceForReader(toEveryone, holding('send_announcements'))).toEqual(toEveryone);
	});

	it('starts a chair on "One committee"', () => {
		expect(audienceChoiceForReader(toEveryone, chairing('send_announcements'))).toEqual({
			...toEveryone,
			audience: 'committee'
		});
	});
});
