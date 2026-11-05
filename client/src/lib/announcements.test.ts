import { describe, expect, it } from 'vitest';
import {
	ANNOUNCEMENT_PREVIEW_LENGTH,
	announcementAuthorLine,
	announcementBadgeLabel,
	announcementBadgeTone,
	announcementPageCount,
	announcementPreview,
	formatPublishedAt,
	peopleCount,
	publishedMessage,
	readAnnouncementLink,
	readAnnouncementsPage,
	recipientCountLine,
	showsReaderBadge,
	type Announcement
} from './announcements';

const AMSTERDAM = 'Europe/Amsterdam';

/** An announcement to everyone, which the tests below change one field of. */
function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
	return {
		id: 'announcement-1',
		title: 'Dress code reminder',
		body: 'Western business attire in every session.',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null,
		delegationId: null,
		delegationName: null,
		isPinned: false,
		publishedAt: '2026-02-12T08:10:00Z',
		authorId: 'user-1',
		authorName: 'Sara Lind',
		...overrides
	};
}

const committeeAnnouncement = makeAnnouncement({
	audience: 'committee',
	committeeId: 'committee-1',
	committeeAbbreviation: 'UNSC'
});

const delegationAnnouncement = makeAnnouncement({
	audience: 'delegation',
	delegationId: 'delegation-1',
	delegationName: 'Delft High School'
});

describe('the audience badge', () => {
	it('names the committee or the delegation, and the audience otherwise', () => {
		expect(announcementBadgeLabel(committeeAnnouncement)).toBe('UNSC');
		expect(announcementBadgeLabel(delegationAnnouncement)).toBe('Delft High School');
		expect(announcementBadgeLabel(makeAnnouncement({ audience: 'staff' }))).toBe('Staff');
	});

	it('falls back to the audience when a committee has no short name', () => {
		const withoutAbbreviation = { ...committeeAnnouncement, committeeAbbreviation: null };

		expect(announcementBadgeLabel(withoutAbbreviation)).toBe('Committee');
	});

	it('stands out for one committee or delegation and is quiet for the rest', () => {
		expect(announcementBadgeTone(committeeAnnouncement)).toBe('brand');
		expect(announcementBadgeTone(delegationAnnouncement)).toBe('brand');
		expect(announcementBadgeTone(makeAnnouncement())).toBe('neutral');
	});

	it('is shown to a reader only for a committee or delegation announcement', () => {
		expect(showsReaderBadge(committeeAnnouncement)).toBe(true);
		expect(showsReaderBadge(delegationAnnouncement)).toBe(true);
		expect(showsReaderBadge(makeAnnouncement())).toBe(false);
		expect(showsReaderBadge(makeAnnouncement({ audience: 'delegates' }))).toBe(false);
	});
});

describe('announcementAuthorLine', () => {
	it('names a chair of the committee as a chair', () => {
		expect(announcementAuthorLine('Anna Chen', true)).toBe('Anna Chen (Chair)');
	});

	it('speaks for the Secretariat otherwise', () => {
		expect(announcementAuthorLine('Sara Lind', false)).toBe('Secretariat');
	});

	it('speaks for the Secretariat when a chair’s name cannot be read', () => {
		expect(announcementAuthorLine(null, true)).toBe('Secretariat');
	});
});

describe('formatPublishedAt', () => {
	const now = new Date('2026-02-12T12:00:00Z');

	it('counts back for the last 48 hours', () => {
		expect(formatPublishedAt('2026-02-12T09:00:00Z', now, AMSTERDAM)).toBe('3 hours ago');
		expect(formatPublishedAt('2026-02-10T13:00:00Z', now, AMSTERDAM)).toBe('1 day ago');
	});

	it('gives the date after that, in the conference’s timezone', () => {
		expect(formatPublishedAt('2026-02-10T11:00:00Z', now, AMSTERDAM)).toBe('10 Feb 2026');
		// 23:30 UTC on the 1st is already the 2nd in Amsterdam.
		expect(formatPublishedAt('2026-02-01T23:30:00Z', now, AMSTERDAM)).toBe('2 Feb 2026');
	});
});

describe('announcementPreview', () => {
	it('keeps a short body as it is', () => {
		expect(announcementPreview('Short.')).toBe('Short.');
	});

	it('cuts a long body to the preview length, ending in an ellipsis', () => {
		const preview = announcementPreview('a'.repeat(400));

		expect(preview).toHaveLength(ANNOUNCEMENT_PREVIEW_LENGTH);
		expect(preview.endsWith('…')).toBe(true);
	});

	it('does not leave a space before the ellipsis', () => {
		const body = `${'a'.repeat(ANNOUNCEMENT_PREVIEW_LENGTH - 2)} and more`;

		expect(announcementPreview(body)).toBe(`${'a'.repeat(ANNOUNCEMENT_PREVIEW_LENGTH - 2)}…`);
	});
});

describe('the recipient wording', () => {
	it('says one person and several people', () => {
		expect(peopleCount(1)).toBe('1 person');
		expect(peopleCount(0)).toBe('0 people');
		expect(peopleCount(212)).toBe('212 people');
	});

	it('writes the preview line and the published message', () => {
		expect(recipientCountLine(212)).toBe('Will notify 212 people');
		expect(publishedMessage(1)).toBe('Published and sent to 1 person.');
	});
});

describe('the delegate’s pages', () => {
	it('counts at least one page, and 20 announcements to a page', () => {
		expect(announcementPageCount(0)).toBe(1);
		expect(announcementPageCount(20)).toBe(1);
		expect(announcementPageCount(21)).toBe(2);
	});

	it('reads the page from the address, and page 1 for anything odd', () => {
		expect(readAnnouncementsPage('3')).toBe(3);
		expect(readAnnouncementsPage(null)).toBe(1);
		expect(readAnnouncementsPage('0')).toBe(1);
		expect(readAnnouncementsPage('-2')).toBe(1);
		expect(readAnnouncementsPage('1.5')).toBe(1);
		expect(readAnnouncementsPage('two')).toBe(1);
	});
});

describe('readAnnouncementLink', () => {
	it('reads the conference and the announcement from a notification’s link', () => {
		expect(
			readAnnouncementLink('/conferences/delftmun-2026/announcements?announcement=a-1')
		).toEqual({ conferenceSlug: 'delftmun-2026', announcementId: 'a-1' });
	});

	it('answers null for an announcement link written before it named the announcement', () => {
		expect(readAnnouncementLink('/conferences/delftmun-2026/announcements')).toBeNull();
	});

	it('answers null for any other link', () => {
		expect(readAnnouncementLink('/applications/1?announcement=a-1')).toBeNull();
		expect(readAnnouncementLink('/conferences/delftmun-2026/schedule')).toBeNull();
	});

	it('answers null for a link to another website', () => {
		expect(
			readAnnouncementLink('//evil.example/conferences/x/announcements?announcement=a-1')
		).toBeNull();
	});

	it('answers null, rather than throwing, for a link that does not parse', () => {
		expect(readAnnouncementLink('//')).toBeNull();
		expect(readAnnouncementLink('///')).toBeNull();
	});
});
