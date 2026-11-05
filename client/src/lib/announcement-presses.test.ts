import { describe, expect, it } from 'vitest';
import type { AnnouncementFormValues } from '$lib/announcement-form';
import type { Announcement, AnnouncementGroup } from '$lib/announcements';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
import type { PressedForm } from '$lib/row-changes';
import {
	announcementsInListOrder,
	deleteAnnouncementPress,
	describeAnnouncementFailure,
	expectAnnouncementRowChange,
	publishAnnouncementPress,
	togglePinAnnouncementPress,
	updateAnnouncementPress,
	type AnnouncementPress
} from './announcement-presses';

/** A complete, valid form addressed to everyone, so each test only changes what it needs to. */
function makeValues(overrides: Partial<AnnouncementFormValues> = {}): AnnouncementFormValues {
	return {
		announcementId: '',
		title: 'Dress code',
		body: 'Western business attire.',
		audience: 'everyone',
		committeeId: '',
		delegationId: '',
		isPinned: false,
		...overrides
	};
}

/** An announcement already on the page, so a test only changes what it needs to. */
function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
	return {
		id: 'row-1',
		title: 'Room change',
		body: 'Session I moves to room 2.',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null,
		delegationId: null,
		delegationName: null,
		isPinned: false,
		publishedAt: '2027-01-20T10:00:00Z',
		authorId: 'user-1',
		authorName: 'Sara Lind',
		...overrides
	};
}

/** A press of `action`, with the fields in `fields`, as `use:enhance` hands it over. */
function pressInput(action: string, fields: Record<string, string> = {}): PressedForm {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		action: new URL(`http://localhost/manage/riverside-mun-2027/announcements${action}`),
		formData
	};
}

const DELEGATIONS: AnnouncementGroup[] = [{ id: 'delegation-delft', name: 'Delft High School' }];

const PRESSED = new Date('2027-01-21T10:00:00Z');

describe('publishAnnouncementPress', () => {
	it('builds the new row under the id the browser chose', () => {
		const change = publishAnnouncementPress(makeValues(), 'row-1', DELEGATIONS, PRESSED);

		expect(change).toEqual([
			{
				id: 'row-1',
				added: {
					id: 'row-1',
					title: 'Dress code',
					body: 'Western business attire.',
					audience: 'everyone',
					committeeId: null,
					committeeAbbreviation: null,
					delegationId: null,
					delegationName: null,
					isPinned: false,
					publishedAt: '2027-01-21T10:00:00.000Z',
					authorId: '',
					authorName: null
				}
			}
		]);
	});

	it('looks up the delegation addressed by name', () => {
		const values = makeValues({ audience: 'delegation', delegationId: 'delegation-delft' });

		const change = publishAnnouncementPress(values, 'row-1', DELEGATIONS, PRESSED);

		expect(change?.[0].added?.delegationName).toBe('Delft High School');
	});

	it('answers null for a form the server would refuse: no title', () => {
		const change = publishAnnouncementPress(
			makeValues({ title: '' }),
			'row-1',
			DELEGATIONS,
			PRESSED
		);

		expect(change).toBeNull();
	});

	it('answers null for a committee audience with no committee chosen', () => {
		const values = makeValues({ audience: 'committee', committeeId: '' });

		expect(publishAnnouncementPress(values, 'row-1', DELEGATIONS, PRESSED)).toBeNull();
	});
});

describe('updateAnnouncementPress', () => {
	it('changes the title, body and pin state only', () => {
		const values = makeValues({
			title: 'Room change (again)',
			body: 'Room 3 now.',
			isPinned: true
		});

		expect(updateAnnouncementPress('row-1', values)).toEqual([
			{
				id: 'row-1',
				changes: { title: 'Room change (again)', body: 'Room 3 now.', isPinned: true }
			}
		]);
	});

	it('answers null for a form the server would refuse: no body', () => {
		expect(updateAnnouncementPress('row-1', makeValues({ body: '' }))).toBeNull();
	});
});

describe('togglePinAnnouncementPress', () => {
	it('flips what the page already shows', () => {
		expect(togglePinAnnouncementPress('row-1', true)).toEqual([
			{ id: 'row-1', changes: { isPinned: false } }
		]);
		expect(togglePinAnnouncementPress('row-1', false)).toEqual([
			{ id: 'row-1', changes: { isPinned: true } }
		]);
	});
});

describe('deleteAnnouncementPress', () => {
	it('takes the row off the list', () => {
		expect(deleteAnnouncementPress('row-1')).toEqual([{ id: 'row-1', isDeleted: true }]);
	});
});

describe('announcementsInListOrder', () => {
	it('puts pinned rows first, then the newest first, as `load` does', () => {
		// The two spellings of a moment: the database's, and `toISOString()`'s.
		const older = makeAnnouncement({ id: 'older', publishedAt: '2026-05-01T09:00:00+00:00' });
		const newer = makeAnnouncement({ id: 'newer', publishedAt: '2026-05-02T09:00:00.000Z' });
		const pinnedOlder = { ...older, isPinned: true };

		expect(announcementsInListOrder([older, newer]).map((row) => row.id)).toEqual([
			'newer',
			'older'
		]);
		expect(announcementsInListOrder([newer, pinnedOlder]).map((row) => row.id)).toEqual([
			'older',
			'newer'
		]);
	});
});

describe('expectAnnouncementRowChange', () => {
	it('publishes the new row under the id already put in the form', () => {
		const input = pressInput('?/publish', {
			title: 'Dress code',
			body: 'Western business attire.',
			audience: 'everyone',
			[NEW_ROW_ID_FIELD]: 'a0000000-0000-4000-8000-000000000099'
		});

		const change = expectAnnouncementRowChange(input, [], DELEGATIONS, PRESSED);

		expect(change?.[0]).toMatchObject({ id: 'a0000000-0000-4000-8000-000000000099' });
	});

	it('answers null for a publish with no id, such as one made without JavaScript', () => {
		const input = pressInput('?/publish', {
			title: 'Dress code',
			body: 'Western business attire.',
			audience: 'everyone'
		});

		expect(expectAnnouncementRowChange(input, [], DELEGATIONS, PRESSED)).toBeNull();
	});

	it('saves an edit', () => {
		const input = pressInput('?/update', {
			announcementId: 'row-1',
			title: 'Room change (again)',
			body: 'Room 3 now.'
		});

		const change = expectAnnouncementRowChange(input, [makeAnnouncement()], DELEGATIONS, PRESSED);

		expect(change).toEqual([
			{
				id: 'row-1',
				changes: { title: 'Room change (again)', body: 'Room 3 now.', isPinned: false }
			}
		]);
	});

	it('pins a row named in the address, by what the page already shows', () => {
		const input = pressInput('?/togglePin&announcementId=row-1');

		const change = expectAnnouncementRowChange(
			input,
			[makeAnnouncement({ isPinned: false })],
			DELEGATIONS,
			PRESSED
		);

		expect(change).toEqual([{ id: 'row-1', changes: { isPinned: true } }]);
	});

	it('deletes the row named in the form', () => {
		const input = pressInput('?/delete', { announcementId: 'row-1' });

		expect(expectAnnouncementRowChange(input, [makeAnnouncement()], DELEGATIONS, PRESSED)).toEqual([
			{ id: 'row-1', isDeleted: true }
		]);
	});
});

describe('describeAnnouncementFailure', () => {
	/** A press whose action is all `describeAnnouncementFailure` reads. */
	function pressOf(action: string): AnnouncementPress {
		return {
			id: 1,
			formData: new FormData(),
			action: new URL(`http://localhost/manage/riverside-mun-2027/announcements${action}`),
			expected: null
		};
	}

	it('names what did not happen for each action', () => {
		expect(describeAnnouncementFailure(pressOf('?/publish'))).toBe(
			'The announcement was not published.'
		);
		expect(describeAnnouncementFailure(pressOf('?/update'))).toBe(
			'The announcement was not saved.'
		);
		expect(describeAnnouncementFailure(pressOf('?/togglePin'))).toBe(
			'The announcement was not updated.'
		);
		expect(describeAnnouncementFailure(pressOf('?/delete'))).toBe(
			'The announcement was not deleted.'
		);
	});
});
