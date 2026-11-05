import { describe, expect, it } from 'vitest';
import {
	addCustomMember,
	addMember,
	addPastedNames,
	canStart,
	clearMembers,
	countryMember,
	draftOfMembers,
	emptyDraft,
	fillFromList,
	footerNote,
	isCountryChosen,
	memberCountError,
	memberFromName,
	memberFromValue,
	QUICK_SESSION_MESSAGES,
	readQuickSessionDraft,
	readQuickSessionForm,
	removeMember,
	searchMemberStates,
	type QuickSessionDraft
} from './quick-session';

/** An empty draft with these members, given by their values. */
function draftWith(
	values: string[],
	overrides: Partial<QuickSessionDraft> = {}
): QuickSessionDraft {
	const members = values.map((value) => memberFromValue(value)).filter((member) => member !== null);

	return { ...emptyDraft(), ...overrides, members };
}

/** The names of a draft's members, in the order the draft holds them. */
function memberNames(draft: QuickSessionDraft): string[] {
	return draft.members.map((member) => member.name);
}

/** A form as the setup page posts it. */
function postedForm(fields: Record<string, string>, members: string[] = []): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	for (const member of members) formData.append('member', member);

	return formData;
}

describe('emptyDraft', () => {
	it('opens with no name, no agenda, 1:30, no members and no search', () => {
		expect(emptyDraft()).toEqual({
			name: '',
			agenda: '',
			speakingTime: '1:30',
			timezone: '',
			search: '',
			members: []
		});
	});
});

describe('draftOfMembers', () => {
	it('opens an empty draft holding the members, alphabetically, each once', () => {
		const amnesty = memberFromName('Amnesty International');
		const members = [countryMember('FR'), amnesty, countryMember('BR'), countryMember('FR')];
		const usableMembers = members.filter((member) => member !== null);

		expect(draftOfMembers(usableMembers)).toEqual({
			...emptyDraft(),
			members: [amnesty, countryMember('BR'), countryMember('FR')]
		});
	});

	it('opens on no members when the committee has none shown', () => {
		expect(draftOfMembers([])).toEqual(emptyDraft());
	});
});

describe('memberFromValue and memberFromName', () => {
	it('reads a country by its code and any other member by its name', () => {
		expect(memberFromValue('country:FR')).toEqual({
			value: 'country:FR',
			name: 'France',
			countryCode: 'FR'
		});
		expect(memberFromValue('name:Amnesty International')).toEqual({
			value: 'name:Amnesty International',
			name: 'Amnesty International',
			countryCode: null
		});
	});

	it('turns a typed country name into that country, in any capitals', () => {
		expect(memberFromName('  france ')).toEqual(countryMember('FR'));
		expect(memberFromValue('name:GERMANY')).toEqual(countryMember('DE'));
	});

	it('refuses an unknown code, an empty name, a name over 80 characters and anything else', () => {
		expect(memberFromValue('country:XX')).toBeNull();
		expect(memberFromValue('country:fr')).toBeNull();
		expect(memberFromValue('name:   ')).toBeNull();
		expect(memberFromValue(`name:${'a'.repeat(81)}`)).toBeNull();
		expect(memberFromValue('France')).toBeNull();
		expect(memberFromName('a'.repeat(80))?.name).toHaveLength(80);
	});
});

describe('readQuickSessionDraft', () => {
	it('reads the fields, the search and one member per hidden field, alphabetically', () => {
		const formData = postedForm(
			{
				name: 'Thursday practice',
				agenda: 'Climate finance',
				speakingTime: '1:30',
				timezone: 'Europe/Paris',
				q: 'ger'
			},
			['country:FR', 'name:Amnesty International', 'country:BR']
		);

		expect(readQuickSessionDraft(formData)).toEqual({
			name: 'Thursday practice',
			agenda: 'Climate finance',
			speakingTime: '1:30',
			timezone: 'Europe/Paris',
			search: 'ger',
			members: [
				memberFromValue('name:Amnesty International'),
				countryMember('BR'),
				countryMember('FR')
			]
		});
	});

	it('keeps a member sent twice once, and drops a value it cannot read', () => {
		const formData = postedForm({}, ['country:FR', 'name:france', 'country:ZZ', 'nonsense']);

		expect(memberNames(readQuickSessionDraft(formData))).toEqual(['France']);
	});

	it('reads missing fields as empty, as on the Edit delegations page', () => {
		const draft = readQuickSessionDraft(postedForm({}, ['country:FR']));

		expect(draft.name).toBe('');
		expect(draft.speakingTime).toBe('');
		expect(draft.search).toBe('');
	});
});

describe('addMember', () => {
	it('adds a member state in its alphabetical place', () => {
		const draft = addMember(draftWith(['country:FR', 'country:BR']), 'country:CA');

		expect(memberNames(draft)).toEqual(['Brazil', 'Canada', 'France']);
	});

	it('never adds a country twice, and ignores a value it cannot read', () => {
		const draft = draftWith(['country:FR']);

		expect(addMember(draft, 'country:FR').members).toHaveLength(1);
		expect(addMember(draft, 'country:QQ')).toBe(draft);
	});
});

describe('addCustomMember', () => {
	it('adds what is typed as a member of its own and empties the search', () => {
		const change = addCustomMember(
			draftWith(['country:FR'], { search: ' Amnesty International ' })
		);

		expect(change.errors).toEqual({});
		expect(change.draft.search).toBe('');
		expect(change.draft.members).toContainEqual({
			value: 'name:Amnesty International',
			name: 'Amnesty International',
			countryCode: null
		});
	});

	it('adds a typed country name as that country', () => {
		const change = addCustomMember(draftWith([], { search: 'france' }));

		expect(change.draft.members).toEqual([countryMember('FR')]);
	});

	it('adds a name in other capitals only once', () => {
		const draft = draftWith(['name:Secretary-General'], { search: 'secretary-general' });

		expect(addCustomMember(draft).draft.members).toHaveLength(1);
	});

	it('refuses a name over 80 characters and keeps it in the box', () => {
		const draft = draftWith([], { search: 'a'.repeat(81) });
		const change = addCustomMember(draft);

		expect(change.errors).toEqual({ custom: QUICK_SESSION_MESSAGES.memberNameTooLong });
		expect(change.draft).toBe(draft);
	});

	it('does nothing with an empty search', () => {
		const draft = draftWith([], { search: '   ' });

		expect(addCustomMember(draft)).toEqual({ draft, errors: {} });
	});
});

describe('removeMember and clearMembers', () => {
	it('"×" removes one member by its value', () => {
		const draft = removeMember(draftWith(['country:FR', 'name:Press']), 'name:Press');

		expect(memberNames(draft)).toEqual(['France']);
	});

	it('"Clear all" removes every member and keeps the rest of the draft', () => {
		const draft = clearMembers(draftWith(['country:FR', 'country:DE'], { name: 'GA' }));

		expect(draft.members).toEqual([]);
		expect(draft.name).toBe('GA');
	});
});

describe('fillFromList', () => {
	it('fills 193, 15 or 27 members, alphabetical, replacing what was there', () => {
		const chosen = draftWith(['name:Amnesty International']);
		const united = fillFromList(chosen, 'un_members');
		const council = fillFromList(chosen, 'security_council');
		const union = fillFromList(chosen, 'eu_members');

		expect(united.members).toHaveLength(193);
		expect(council.members).toHaveLength(15);
		expect(union.members).toHaveLength(27);
		expect(memberNames(council)).toEqual(
			[...memberNames(council)].sort((a, b) => a.localeCompare(b))
		);
		expect(memberNames(council)).not.toContain('Amnesty International');
		expect(memberNames(council)[0]).toBe('Bahrain');
	});

	it('changes nothing for a list it does not know', () => {
		const draft = draftWith(['country:FR']);

		expect(fillFromList(draft, 'nato')).toBe(draft);
	});
});

describe('addPastedNames', () => {
	it('adds one member per line, countries with their flag, each name once, to what was there', () => {
		const change = addPastedNames(
			draftWith(['country:FR']),
			'Germany\n\n  Amnesty International\namnesty international\nfrance\nSecretary-General'
		);

		expect(change.errors).toEqual({});
		expect(memberNames(change.draft)).toEqual([
			'Amnesty International',
			'France',
			'Germany',
			'Secretary-General'
		]);
		expect(change.draft.members.find((member) => member.name === 'Germany')?.countryCode).toBe(
			'DE'
		);
	});

	it('refuses more than 300 lines and adds nothing', () => {
		const lines = Array.from({ length: 301 }, (_, index) => `Member ${index}`).join('\n');
		const draft = draftWith(['country:FR']);
		const change = addPastedNames(draft, lines);

		expect(change.errors).toEqual({ paste: QUICK_SESSION_MESSAGES.pasteTooLong });
		expect(change.draft).toBe(draft);
	});

	it('accepts exactly 300 lines', () => {
		const lines = Array.from({ length: 300 }, (_, index) => `Member ${index}`).join('\n');

		expect(addPastedNames(emptyDraft(), lines).draft.members).toHaveLength(300);
	});

	it('refuses a line over 80 characters and adds nothing', () => {
		const change = addPastedNames(emptyDraft(), `Germany\n${'a'.repeat(81)}`);

		expect(change.errors).toEqual({ paste: QUICK_SESSION_MESSAGES.memberNameTooLong });
		expect(change.draft.members).toEqual([]);
	});
});

describe('searchMemberStates', () => {
	it('lists all 193 member states, alphabetically, while nothing is typed', () => {
		const codes = searchMemberStates('  ');

		expect(codes).toHaveLength(193);
		expect(codes.slice(0, 3)).toEqual(['AF', 'AL', 'DZ']);
	});

	it('matches the start of any word of a name, ignoring capitals', () => {
		expect(searchMemberStates('king')).toContain('GB');
		expect(searchMemberStates('KING')).toContain('GB');
		expect(searchMemberStates('united k')).toEqual(['GB']);
		expect(searchMemberStates('ance')).not.toContain('FR');
	});

	it('ignores accents in a name', () => {
		const ivoryCoast = searchMemberStates('cote');

		expect(ivoryCoast).toContain('CI');
	});

	it('finds nothing for a name that is not a member state', () => {
		expect(searchMemberStates('Amnesty')).toEqual([]);
	});
});

describe('isCountryChosen and canStart', () => {
	it('says whether a country is already in the committee', () => {
		const draft = draftWith(['country:FR']);

		expect(isCountryChosen(draft, 'FR')).toBe(true);
		expect(isCountryChosen(draft, 'DE')).toBe(false);
	});

	it('lets a session start from two members, not one', () => {
		expect(canStart(draftWith(['country:FR']))).toBe(false);
		expect(canStart(draftWith(['country:FR', 'country:DE']))).toBe(true);
	});
});

describe('footerNote', () => {
	it('says what the button does, or why it cannot be pressed yet', () => {
		const one = draftWith(['country:FR']);
		const two = draftWith(['country:FR', 'country:DE']);

		expect(footerNote(two, 'start')).toBe(
			'Opens Session 1 straight away. The committee is kept for next time.'
		);
		expect(footerNote(one, 'start')).toBe('Add at least two members to start');
		expect(footerNote(two, 'save')).toBe(
			'Removing a delegation keeps it in the record of earlier sessions.'
		);
		expect(footerNote(one, 'save')).toBe('Add at least two members to save');
	});
});

describe('memberCountError', () => {
	it('refuses fewer than two and more than 300 members', () => {
		const one = draftWith(['country:FR']).members;
		const two = draftWith(['country:FR', 'country:DE']).members;
		const many = Array.from({ length: 301 }, (_, index) => ({
			value: `name:Member ${index}`,
			name: `Member ${index}`,
			countryCode: null
		}));

		expect(memberCountError(one, QUICK_SESSION_MESSAGES.tooFewToStart)).toBe(
			'Add at least two members to start.'
		);
		expect(memberCountError(two, QUICK_SESSION_MESSAGES.tooFewToStart)).toBeUndefined();
		expect(memberCountError(many, QUICK_SESSION_MESSAGES.tooFewToStart)).toBe(
			'A quick session holds at most 300 delegations.'
		);
	});
});

describe('readQuickSessionForm', () => {
	const MEMBERS = ['country:FR', 'country:DE', 'name:Amnesty International'];

	it('hands over a checked start, the agenda trimmed and the time in seconds', () => {
		const form = readQuickSessionForm(
			postedForm(
				{ name: ' Thursday practice ', agenda: '', speakingTime: '2', timezone: 'Europe/Paris' },
				MEMBERS
			)
		);

		expect(form.errors).toEqual({});
		expect(form.start).toEqual({
			committeeName: 'Thursday practice',
			agenda: null,
			speakingTimeSeconds: 120,
			timezone: 'Europe/Paris',
			members: form.draft.members
		});
		expect(form.start?.members.map((member) => member.name)).toEqual([
			'Amnesty International',
			'France',
			'Germany'
		]);
	});

	it('reads "1:30", "90s" and "2" as motion times are', () => {
		const seconds = ['1:30', '90s', '2'].map(
			(speakingTime) =>
				readQuickSessionForm(postedForm({ name: 'GA', speakingTime }, MEMBERS)).start
					?.speakingTimeSeconds
		);

		expect(seconds).toEqual([90, 90, 120]);
	});

	it('falls back to the database default for a timezone it does not know', () => {
		const form = readQuickSessionForm(
			postedForm({ name: 'GA', speakingTime: '1:30', timezone: 'Mars/Olympus' }, MEMBERS)
		);

		expect(form.start?.timezone).toBeNull();
	});

	it('refuses every field by the table, and keeps the whole draft', () => {
		const form = readQuickSessionForm(
			postedForm({ name: '   ', agenda: 'a'.repeat(201), speakingTime: '0:20', q: 'ger' }, [
				'country:FR'
			])
		);

		expect(form.start).toBeNull();
		expect(form.errors).toEqual({
			name: "Please enter the committee's name.",
			agenda: 'Please keep the agenda under 200 characters.',
			speakingTime: 'Please enter a speaking time between 0:30 and 10:00.',
			members: 'Add at least two members to start.'
		});
		expect(form.draft.search).toBe('ger');
		expect(form.draft.agenda).toHaveLength(201);
		expect(memberNames(form.draft)).toEqual(['France']);
	});

	it('refuses a name over 120 characters and a time over 10:00 or that is not a time', () => {
		const long = readQuickSessionForm(
			postedForm({ name: 'a'.repeat(121), speakingTime: '10:01' }, MEMBERS)
		);
		const nonsense = readQuickSessionForm(
			postedForm({ name: 'GA', speakingTime: 'soon' }, MEMBERS)
		);

		expect(long.errors.name).toBe('Please keep the name under 120 characters.');
		expect(long.errors.speakingTime).toBe('Please enter a speaking time between 0:30 and 10:00.');
		expect(nonsense.errors).toEqual({
			speakingTime: 'Please enter a speaking time between 0:30 and 10:00.'
		});
	});

	it('accepts the edges: a 120-character name, a 200-character agenda, 0:30 and 10:00', () => {
		const shortest = readQuickSessionForm(
			postedForm({ name: 'a'.repeat(120), agenda: 'b'.repeat(200), speakingTime: '0:30' }, MEMBERS)
		);
		const longest = readQuickSessionForm(
			postedForm({ name: 'GA', speakingTime: '10:00' }, MEMBERS)
		);

		expect(shortest.errors).toEqual({});
		expect(longest.start?.speakingTimeSeconds).toBe(600);
	});
});
