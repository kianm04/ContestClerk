import { describe, expect, it } from 'vitest';
import {
	cleanTopics,
	COMMITTEE_LEVEL_OPTIONS,
	committeeSlugFromName,
	EMPTY_COMMITTEE_FORM,
	hasCommitteeErrors,
	readCommitteeForm,
	validateCommitteeForm,
	withExtraTopic,
	withoutTopicAt,
	type CommitteeFormContext,
	type CommitteeFormValues
} from './committee-details';

/** A committee the form could really have been filled in with, so a test can change one field of it. */
function committeeValues(changes: Partial<CommitteeFormValues> = {}): CommitteeFormValues {
	return {
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		slug: 'unsc',
		description: 'The council that keeps international peace and security.',
		level: 'advanced',
		room: 'Committee Room 1',
		defaultSpeakingTimeSeconds: '90',
		topics: ['Climate finance'],
		...changes
	};
}

/** A draft conference with no other committee in it, which is the easiest case to check against. */
const DRAFT_CONFERENCE: CommitteeFormContext = {
	isConferencePublished: false,
	takenSlugs: []
};

describe('EMPTY_COMMITTEE_FORM', () => {
	it('starts a new committee with one empty topic row to type into', () => {
		expect(EMPTY_COMMITTEE_FORM.topics).toEqual(['']);
	});

	it('starts a new committee at the ninety seconds the database would have chosen', () => {
		expect(EMPTY_COMMITTEE_FORM.defaultSpeakingTimeSeconds).toBe('90');
	});
});

describe('COMMITTEE_LEVEL_OPTIONS', () => {
	it('offers the three levels a committee can have', () => {
		const values = COMMITTEE_LEVEL_OPTIONS.map((option) => option.value);

		expect(values).toEqual(['beginner', 'intermediate', 'advanced']);
	});

	it('leaves out "none", because a committee is never "no experience yet"', () => {
		const values = COMMITTEE_LEVEL_OPTIONS.map((option) => option.value);

		expect(values).not.toContain('none');
	});

	it('takes its words from the ones the rest of the app shows', () => {
		expect(COMMITTEE_LEVEL_OPTIONS[0].label).toBe('Beginner');
	});
});

describe('readCommitteeForm', () => {
	/** The form the committee editor posts, with the topic rows appended one by one. */
	function committeeForm(fields: Record<string, string>, topics: string[] = []): FormData {
		const formData = new FormData();

		for (const fieldName of Object.keys(fields)) {
			formData.set(fieldName, fields[fieldName]);
		}

		// Every topic row is named `topics[]`, so they are appended rather than set.
		for (const topic of topics) {
			formData.append('topics[]', topic);
		}

		return formData;
	}

	it('reads every field the form asks for', () => {
		const formData = committeeForm(
			{
				name: 'United Nations Security Council',
				abbreviation: 'UNSC',
				slug: 'unsc',
				description: 'Peace and security.',
				level: 'advanced',
				room: 'Committee Room 1',
				defaultSpeakingTimeSeconds: '90'
			},
			['Climate finance', 'Peacekeeping mandates']
		);

		expect(readCommitteeForm(formData)).toEqual({
			name: 'United Nations Security Council',
			abbreviation: 'UNSC',
			slug: 'unsc',
			description: 'Peace and security.',
			level: 'advanced',
			room: 'Committee Room 1',
			defaultSpeakingTimeSeconds: '90',
			topics: ['Climate finance', 'Peacekeeping mandates']
		});
	});

	it('counts a field the form left out as empty text', () => {
		const values = readCommitteeForm(committeeForm({ name: 'Historical Crisis' }));

		expect(values.abbreviation).toBe('');
		expect(values.room).toBe('');
		expect(values.topics).toEqual([]);
	});

	it('drops the spaces around what somebody typed', () => {
		const values = readCommitteeForm(committeeForm({ name: '  Historical Crisis  ' }));

		expect(values.name).toBe('Historical Crisis');
	});

	it('leaves the slug exactly as it was typed, so capitals are answered rather than hidden', () => {
		const values = readCommitteeForm(committeeForm({ slug: 'UNSC' }));

		expect(values.slug).toBe('UNSC');
	});

	it('keeps the empty topic rows, so a refused form draws what the organiser sees', () => {
		const formData = committeeForm({ name: 'UNSC' }, ['Climate finance', '', 'Peacekeeping']);

		expect(readCommitteeForm(formData).topics).toEqual(['Climate finance', '', 'Peacekeeping']);
	});
});

describe('committeeSlugFromName', () => {
	it('makes the link out of the name the way every slug is made', () => {
		expect(committeeSlugFromName('Historical Security Council')).toBe(
			'historical-security-council'
		);
	});

	it('falls back to "committee" for a name no link can be made from, which the database would refuse empty', () => {
		// Cyrillic and Chinese names have no a-z or 0-9 for `slugify` to keep, and
		// `committees_slug_shape` refuses an empty slug, so there is always a word.
		expect(committeeSlugFromName('Совет Безопасности')).toBe('committee');
		expect(committeeSlugFromName('安全理事会')).toBe('committee');
		expect(committeeSlugFromName('!!!')).toBe('committee');
	});
});

describe('validateCommitteeForm', () => {
	it('accepts a committee that is filled in properly', () => {
		const errors = validateCommitteeForm(committeeValues(), DRAFT_CONFERENCE);

		expect(errors).toEqual({});
	});

	it('asks for a name when there is none', () => {
		const errors = validateCommitteeForm(committeeValues({ name: '' }), DRAFT_CONFERENCE);

		expect(errors.name).toBe("Please enter the committee's name.");
	});

	it('refuses a name longer than 120 characters', () => {
		const tooLong = 'a'.repeat(121);
		const errors = validateCommitteeForm(committeeValues({ name: tooLong }), DRAFT_CONFERENCE);

		expect(errors.name).toBe("Please enter the committee's name.");
	});

	it('accepts no abbreviation at all, since it is optional', () => {
		const errors = validateCommitteeForm(committeeValues({ abbreviation: '' }), DRAFT_CONFERENCE);

		expect(errors.abbreviation).toBeUndefined();
	});

	it('refuses an abbreviation longer than 12 characters', () => {
		const tooLong = 'a'.repeat(13);
		const errors = validateCommitteeForm(
			committeeValues({ abbreviation: tooLong }),
			DRAFT_CONFERENCE
		);

		expect(errors.abbreviation).toBe('Please keep the abbreviation under 12 characters.');
	});

	it('accepts an empty slug, because the page fills it in from the name before saving', () => {
		const errors = validateCommitteeForm(committeeValues({ slug: '' }), DRAFT_CONFERENCE);

		expect(errors.slug).toBeUndefined();
	});

	it('refuses a slug with capitals in it', () => {
		const errors = validateCommitteeForm(committeeValues({ slug: 'UNSC' }), DRAFT_CONFERENCE);

		expect(errors.slug).toBe('Please use only lowercase letters, digits and hyphens.');
	});

	it('refuses a slug with spaces or punctuation in it', () => {
		const errors = validateCommitteeForm(
			committeeValues({ slug: 'security council!' }),
			DRAFT_CONFERENCE
		);

		expect(errors.slug).toBe('Please use only lowercase letters, digits and hyphens.');
	});

	it('accepts a slug of lowercase letters, digits and hyphens', () => {
		const errors = validateCommitteeForm(committeeValues({ slug: 'unsc-2027' }), DRAFT_CONFERENCE);

		expect(errors.slug).toBeUndefined();
	});

	it('refuses a hyphen at either end or two in a row, which the database refuses as well', () => {
		for (const slug of ['-unsc', 'unsc-', 'un--sc']) {
			const errors = validateCommitteeForm(committeeValues({ slug }), DRAFT_CONFERENCE);

			expect(errors.slug, slug).toBe('Please use only lowercase letters, digits and hyphens.');
		}
	});

	it('refuses a slug over 100 characters, which the database refuses as well, and takes one of 100', () => {
		const atTheBound = 'a'.repeat(100);

		expect(
			validateCommitteeForm(committeeValues({ slug: atTheBound }), DRAFT_CONFERENCE).slug
		).toBeUndefined();
		expect(
			validateCommitteeForm(committeeValues({ slug: atTheBound + 'a' }), DRAFT_CONFERENCE).slug
		).toBe('Please keep the link to 100 characters or fewer.');
	});

	it('refuses a slug another committee of the conference already uses', () => {
		const context: CommitteeFormContext = {
			isConferencePublished: false,
			takenSlugs: ['unsc', 'ga1']
		};
		const errors = validateCommitteeForm(committeeValues({ slug: 'unsc' }), context);

		expect(errors.slug).toBe('Another committee already uses this link.');
	});

	it('refuses a description longer than 4000 characters', () => {
		const tooLong = 'a'.repeat(4001);
		const errors = validateCommitteeForm(
			committeeValues({ description: tooLong }),
			DRAFT_CONFERENCE
		);

		expect(errors.description).toBe('Please keep the description under 4000 characters.');
	});

	it('asks for a level when none was picked', () => {
		const errors = validateCommitteeForm(committeeValues({ level: '' }), DRAFT_CONFERENCE);

		expect(errors.level).toBe('Please pick a level.');
	});

	it('refuses "none" as a level, which is a person\'s experience and not a committee\'s', () => {
		const errors = validateCommitteeForm(committeeValues({ level: 'none' }), DRAFT_CONFERENCE);

		expect(errors.level).toBe('Please pick a level.');
	});

	it('refuses a room longer than 60 characters', () => {
		const tooLong = 'a'.repeat(61);
		const errors = validateCommitteeForm(committeeValues({ room: tooLong }), DRAFT_CONFERENCE);

		expect(errors.room).toBe('Please keep the room under 60 characters.');
	});

	it('accepts the shortest and the longest speaking time', () => {
		const shortest = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '30' }),
			DRAFT_CONFERENCE
		);
		const longest = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '600' }),
			DRAFT_CONFERENCE
		);

		expect(shortest.defaultSpeakingTimeSeconds).toBeUndefined();
		expect(longest.defaultSpeakingTimeSeconds).toBeUndefined();
	});

	it('refuses a speaking time below 30 seconds', () => {
		const errors = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '29' }),
			DRAFT_CONFERENCE
		);

		expect(errors.defaultSpeakingTimeSeconds).toBe(
			'Please enter a speaking time between 30 and 600 seconds.'
		);
	});

	it('refuses a speaking time above 600 seconds', () => {
		const errors = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '601' }),
			DRAFT_CONFERENCE
		);

		expect(errors.defaultSpeakingTimeSeconds).toBe(
			'Please enter a speaking time between 30 and 600 seconds.'
		);
	});

	it('refuses a speaking time that is not a whole number of seconds', () => {
		const errors = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '90.5' }),
			DRAFT_CONFERENCE
		);

		expect(errors.defaultSpeakingTimeSeconds).toBe(
			'Please enter a speaking time between 30 and 600 seconds.'
		);
	});

	it('asks for a speaking time when the field is empty', () => {
		const errors = validateCommitteeForm(
			committeeValues({ defaultSpeakingTimeSeconds: '' }),
			DRAFT_CONFERENCE
		);

		expect(errors.defaultSpeakingTimeSeconds).toBe(
			'Please enter a speaking time between 30 and 600 seconds.'
		);
	});

	it('lets a draft conference save a committee with no topics yet', () => {
		const errors = validateCommitteeForm(committeeValues({ topics: ['', ''] }), DRAFT_CONFERENCE);

		expect(errors.topics).toBeUndefined();
	});

	it('refuses a topic longer than 200 characters, or more than 50 topics', () => {
		const longTopic = validateCommitteeForm(
			committeeValues({ topics: ['Climate finance', 'a'.repeat(201)] }),
			DRAFT_CONFERENCE
		);
		const manyTopics = validateCommitteeForm(
			committeeValues({ topics: Array.from({ length: 51 }, (_, index) => `Topic ${index}`) }),
			DRAFT_CONFERENCE
		);
		const longestAllowed = validateCommitteeForm(
			committeeValues({ topics: ['a'.repeat(200)] }),
			DRAFT_CONFERENCE
		);

		expect(longTopic.topics).toBe('Please keep each topic under 200 characters.');
		expect(manyTopics.topics).toBe('Please keep to 50 topics or fewer.');
		expect(longestAllowed.topics).toBeUndefined();
	});

	it('asks a published conference for at least one topic', () => {
		const context: CommitteeFormContext = { isConferencePublished: true, takenSlugs: [] };
		const errors = validateCommitteeForm(committeeValues({ topics: ['', '  '] }), context);

		expect(errors.topics).toBe('Please add at least one topic.');
	});

	it('counts one filled row as a topic on a published conference', () => {
		const context: CommitteeFormContext = { isConferencePublished: true, takenSlugs: [] };
		const errors = validateCommitteeForm(
			committeeValues({ topics: ['', 'Climate finance'] }),
			context
		);

		expect(errors.topics).toBeUndefined();
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const broken = committeeValues({
			name: '',
			slug: 'UNSC',
			level: '',
			defaultSpeakingTimeSeconds: '5'
		});
		const errors = validateCommitteeForm(broken, DRAFT_CONFERENCE);

		expect(Object.keys(errors).sort()).toEqual([
			'defaultSpeakingTimeSeconds',
			'level',
			'name',
			'slug'
		]);
	});
});

describe('hasCommitteeErrors', () => {
	it('answers false when nothing needs fixing', () => {
		expect(hasCommitteeErrors({})).toBe(false);
	});

	it('answers true when one field needs fixing', () => {
		expect(hasCommitteeErrors({ level: 'Please pick a level.' })).toBe(true);
	});
});

describe('withExtraTopic', () => {
	it('adds one empty row on the end', () => {
		expect(withExtraTopic(['Climate finance'])).toEqual(['Climate finance', '']);
	});

	it('gives a first row to a committee with no topics at all', () => {
		expect(withExtraTopic([])).toEqual(['']);
	});

	it('leaves the list it was given alone', () => {
		const topics = ['Climate finance'];

		withExtraTopic(topics);

		expect(topics).toEqual(['Climate finance']);
	});
});

describe('withoutTopicAt', () => {
	it('removes the row that was asked for and keeps the order of the rest', () => {
		const topics = ['Climate finance', 'Peacekeeping', 'Sanctions'];

		expect(withoutTopicAt(topics, 1)).toEqual(['Climate finance', 'Sanctions']);
	});

	it('leaves an empty list when the only row is removed', () => {
		expect(withoutTopicAt(['Climate finance'], 0)).toEqual([]);
	});

	it('changes nothing for an index that is not a row', () => {
		const topics = ['Climate finance'];

		expect(withoutTopicAt(topics, 4)).toEqual(['Climate finance']);
	});

	it('leaves the list it was given alone', () => {
		const topics = ['Climate finance', 'Peacekeeping'];

		withoutTopicAt(topics, 0);

		expect(topics).toEqual(['Climate finance', 'Peacekeeping']);
	});
});

describe('cleanTopics', () => {
	it('drops the empty rows', () => {
		expect(cleanTopics(['Climate finance', '', 'Peacekeeping'])).toEqual([
			'Climate finance',
			'Peacekeeping'
		]);
	});

	it('drops a row holding nothing but spaces', () => {
		expect(cleanTopics(['   '])).toEqual([]);
	});

	it('drops the spaces around a topic somebody typed', () => {
		expect(cleanTopics(['  Climate finance  '])).toEqual(['Climate finance']);
	});

	it('keeps the topics in the order the organiser put them', () => {
		expect(cleanTopics(['Sanctions', 'Climate finance'])).toEqual(['Sanctions', 'Climate finance']);
	});
});
