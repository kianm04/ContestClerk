import { describe, expect, it } from 'vitest';
import type { Announcement } from './announcements';
import { announcementAudienceText, announcementMetaLine } from './announcement-meta';

const NOW = new Date('2026-11-12T20:00:00Z');

/** An announcement with every field filled in, which the tests below change one field of. */
const ANNOUNCEMENT: Announcement = {
	id: 'announcement-1',
	title: 'Registration opens at 09:00',
	body: 'Bring a photo ID.',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null,
	delegationId: null,
	delegationName: null,
	isPinned: false,
	publishedAt: '2026-11-12T17:00:00Z',
	authorId: 'author-1',
	authorName: 'Eleanor Whitfield'
};

describe('announcementAudienceText', () => {
	it('names the audiences that are not one group', () => {
		expect(announcementAudienceText(ANNOUNCEMENT)).toBe('To everyone');
		expect(announcementAudienceText({ ...ANNOUNCEMENT, audience: 'delegates' })).toBe(
			'To delegates'
		);
		expect(announcementAudienceText({ ...ANNOUNCEMENT, audience: 'staff' })).toBe('To staff');
	});

	it('names the committee or the delegation it went to', () => {
		const toCommittee = { ...ANNOUNCEMENT, audience: 'committee' as const };
		const toDelegation = { ...ANNOUNCEMENT, audience: 'delegation' as const };

		expect(announcementAudienceText({ ...toCommittee, committeeAbbreviation: 'DISEC' })).toBe(
			'To DISEC'
		);
		expect(announcementAudienceText({ ...toDelegation, delegationName: 'Delft High School' })).toBe(
			'To Delft High School'
		);
	});

	it('falls back to the audience when the group has no name to give', () => {
		expect(announcementAudienceText({ ...ANNOUNCEMENT, audience: 'committee' })).toBe(
			'To one committee'
		);
		expect(announcementAudienceText({ ...ANNOUNCEMENT, audience: 'delegation' })).toBe(
			'To one delegation'
		);
	});
});

describe('announcementMetaLine', () => {
	it('says whom it went to, who wrote it and when', () => {
		expect(announcementMetaLine(ANNOUNCEMENT, NOW, 'Europe/London')).toBe(
			'To everyone · Eleanor Whitfield · 3 hours ago'
		);
	});

	it('starts with "Pinned" when the announcement is pinned', () => {
		const pinned = { ...ANNOUNCEMENT, isPinned: true };

		expect(announcementMetaLine(pinned, NOW, 'Europe/London')).toMatch(/^Pinned · To everyone · /);
	});

	it('names an author whose profile could not be read', () => {
		const anonymous = { ...ANNOUNCEMENT, authorName: null };

		expect(announcementMetaLine(anonymous, NOW, 'Europe/London')).toContain('Unknown author');
	});
});
