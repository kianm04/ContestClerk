import { describe, expect, it } from 'vitest';
import {
	ANNOUNCEMENT_BODY_MAX_LENGTH,
	ANNOUNCEMENT_TITLE_MAX_LENGTH,
	announcementFormValues,
	audienceChoiceLabel,
	hasAnnouncementErrors,
	isAnnouncementAudience,
	newAnnouncementForm,
	readAnnouncementForm,
	readAudienceFromUrl,
	toAnnouncementInput,
	toAudienceInput,
	validateAnnouncementForm,
	validateAudienceChoice,
	type AnnouncementFormValues
} from './announcement-form';
import type { Announcement } from './announcements';

/** A form ready to publish to everyone, which the tests below change one field of. */
function makeValues(overrides: Partial<AnnouncementFormValues> = {}): AnnouncementFormValues {
	return {
		announcementId: '',
		title: 'Dress code reminder',
		body: 'Western business attire in every session.',
		audience: 'everyone',
		committeeId: '',
		delegationId: '',
		isPinned: false,
		...overrides
	};
}

/** A submitted form holding these fields. */
function makeFormData(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

const COMMITTEES = [{ id: 'committee-1', name: 'Security Council' }];
const DELEGATIONS = [{ id: 'delegation-1', name: 'Delft High School' }];

describe('isAnnouncementAudience', () => {
	it('knows the five audiences and nothing else', () => {
		expect(isAnnouncementAudience('committee')).toBe(true);
		expect(isAnnouncementAudience('volunteers')).toBe(false);
	});
});

describe('readAudienceFromUrl', () => {
	it('reads the audience and both ids from the address', () => {
		const params = new URLSearchParams('audience=committee&committee=committee-1');

		expect(readAudienceFromUrl(params)).toEqual({
			audience: 'committee',
			committeeId: 'committee-1',
			delegationId: ''
		});
	});

	it('starts with everyone when the audience is missing or unknown', () => {
		expect(readAudienceFromUrl(new URLSearchParams()).audience).toBe('everyone');
		expect(readAudienceFromUrl(new URLSearchParams('audience=aliens')).audience).toBe('everyone');
	});
});

describe('the form’s starting values', () => {
	it('starts a new announcement empty, addressed to the choice', () => {
		const choice = { audience: 'staff', committeeId: '', delegationId: '' };

		expect(newAnnouncementForm(choice)).toEqual(
			makeValues({ title: '', body: '', audience: 'staff' })
		);
	});

	it('opens a published announcement with everything it holds', () => {
		const announcement: Announcement = {
			id: 'announcement-1',
			title: 'Room change',
			body: 'Session I moves to room 2.',
			audience: 'committee',
			committeeId: 'committee-1',
			committeeAbbreviation: 'UNSC',
			delegationId: null,
			delegationName: null,
			isPinned: true,
			publishedAt: '2026-02-11T19:40:00Z',
			authorId: 'user-1',
			authorName: 'Sara Lind'
		};

		expect(announcementFormValues(announcement)).toEqual({
			announcementId: 'announcement-1',
			title: 'Room change',
			body: 'Session I moves to room 2.',
			audience: 'committee',
			committeeId: 'committee-1',
			delegationId: '',
			isPinned: true
		});
	});
});

describe('readAnnouncementForm', () => {
	it('reads every field without surrounding spaces', () => {
		const formData = makeFormData({
			title: '  Room change ',
			body: 'Room 2.',
			audience: 'committee',
			committeeId: 'committee-1',
			isPinned: 'on'
		});

		expect(readAnnouncementForm(formData)).toEqual({
			announcementId: '',
			title: 'Room change',
			body: 'Room 2.',
			audience: 'committee',
			committeeId: 'committee-1',
			delegationId: '',
			isPinned: true
		});
	});

	it('reads an unticked pin box as not pinned', () => {
		expect(readAnnouncementForm(makeFormData({ title: 'x' })).isPinned).toBe(false);
	});
});

describe('validateAnnouncementForm', () => {
	it('accepts a complete form', () => {
		expect(validateAnnouncementForm(makeValues(), false)).toEqual({});
	});

	it('asks for a title and a body', () => {
		const errors = validateAnnouncementForm(makeValues({ title: '', body: '' }), false);

		expect(errors.title).toBe('Please give the announcement a title.');
		expect(errors.body).toBe('Write the announcement first.');
	});

	it('refuses a title or a body that is too long', () => {
		const values = makeValues({
			title: 'a'.repeat(ANNOUNCEMENT_TITLE_MAX_LENGTH + 1),
			body: 'a'.repeat(ANNOUNCEMENT_BODY_MAX_LENGTH + 1)
		});
		const errors = validateAnnouncementForm(values, false);

		expect(errors.title).toBe('Please keep the title under 120 characters.');
		expect(errors.body).toBe('Please keep the announcement under 4000 characters.');
	});

	it('asks for the committee or the delegation the audience needs', () => {
		const committee = validateAnnouncementForm(makeValues({ audience: 'committee' }), false);
		const delegation = validateAnnouncementForm(makeValues({ audience: 'delegation' }), false);

		expect(committee).toEqual({ committeeId: 'Pick the committee.' });
		expect(delegation).toEqual({ delegationId: 'Pick the delegation.' });
	});

	it('refuses an audience that is not one of the five', () => {
		const errors = validateAnnouncementForm(makeValues({ audience: 'aliens' }), false);

		expect(errors).toEqual({ audience: 'Choose who the announcement is for.' });
	});

	it('leaves the audience alone while editing, because it cannot change', () => {
		expect(validateAnnouncementForm(makeValues({ audience: '' }), true)).toEqual({});
	});
});

describe('validateAudienceChoice', () => {
	it('checks the audience only, so a preview needs no title', () => {
		const choice = makeValues({ title: '', audience: 'committee', committeeId: 'committee-1' });

		expect(validateAudienceChoice(choice)).toEqual({});
		expect(
			hasAnnouncementErrors(validateAudienceChoice(makeValues({ audience: 'committee' })))
		).toBe(true);
	});
});

describe('toAudienceInput and toAnnouncementInput', () => {
	it('drops an id that does not belong to the chosen audience', () => {
		const values = makeValues({ committeeId: 'committee-1', delegationId: 'delegation-1' });

		expect(toAudienceInput(values)).toEqual({
			audience: 'everyone',
			committeeId: null,
			delegationId: null
		});
	});

	it('keeps the committee of a committee announcement', () => {
		const values = makeValues({
			audience: 'committee',
			committeeId: 'committee-1',
			isPinned: true
		});

		expect(toAnnouncementInput(values)).toEqual({
			audience: 'committee',
			committeeId: 'committee-1',
			delegationId: null,
			title: 'Dress code reminder',
			body: 'Western business attire in every session.',
			isPinned: true
		});
	});
});

describe('audienceChoiceLabel', () => {
	it('names the committee or the delegation that was counted', () => {
		const committee = {
			audience: 'committee' as const,
			committeeId: 'committee-1',
			delegationId: null
		};
		const delegation = {
			audience: 'delegation' as const,
			committeeId: null,
			delegationId: 'delegation-1'
		};

		expect(audienceChoiceLabel(committee, COMMITTEES, DELEGATIONS)).toBe('Security Council');
		expect(audienceChoiceLabel(delegation, COMMITTEES, DELEGATIONS)).toBe('Delft High School');
	});

	it('names any other audience the way the radio buttons do', () => {
		const staff = { audience: 'staff' as const, committeeId: null, delegationId: null };

		expect(audienceChoiceLabel(staff, COMMITTEES, DELEGATIONS)).toBe('Staff');
	});
});
