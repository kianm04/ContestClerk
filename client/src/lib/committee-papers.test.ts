import { describe, expect, it } from 'vitest';
import {
	COMMITTEE_PAPER_MESSAGES,
	PAPER_TITLE_MAX_LENGTH,
	authorAddedMessage,
	authorWords,
	hasPassed,
	isLoneLead,
	leadHandedMessage,
	leavePaperSentence,
	noPassedPaperSentence,
	paperKindAndNumber,
	paperLiveWriters,
	paperMetaLine,
	NO_PAPER_ACTIONS,
	paperPeopleActions,
	paperPersonLine,
	paperSaveWord,
	paperSourceLabel,
	paperSections,
	paperStatusLine,
	paperTextLabel,
	papersPageTitle,
	presetTopic,
	readChosenSeat,
	readNewPaperForm,
	readPaperDialog,
	sourcePaperMetaLine,
	startablePaperKinds,
	type PaperListItem,
	type PaperPeopleActions,
	type PaperPerson
} from './committee-papers';

/** A working paper the reader's seat is not on, still being written. */
function paper(overrides: Partial<PaperListItem> = {}): PaperListItem {
	return {
		id: 'paper-1',
		kind: 'working_paper',
		status: 'writing',
		title: 'Meaningful human control',
		topic: 'Lethal autonomous weapons systems',
		topicNumber: null,
		sequence: null,
		isOpenForSignatures: false,
		updatedAt: '2099-03-01T09:00:00.000Z',
		myRole: null,
		...overrides
	};
}

/** Austria's seat on a paper, held by Clara, who is reading. */
function person(overrides: Partial<PaperPerson> = {}): PaperPerson {
	return {
		seatId: 'seat-austria',
		seatName: 'Austria',
		countryCode: 'AT',
		holderId: 'user-clara',
		holderName: 'Clara Whitfield',
		role: 'author',
		isLead: true,
		isMine: true,
		...overrides
	};
}

describe('startablePaperKinds', () => {
	it('offers a standard committee working papers, then draft resolutions', () => {
		const committee = {
			format: 'standard',
			crisisAllowsResolutions: false,
			hasWorkingPapers: true
		} as const;

		expect(startablePaperKinds(committee)).toEqual(['working_paper', 'draft_resolution']);
	});

	it('offers only draft resolutions when blocs write them from the start', () => {
		const committee = {
			format: 'standard',
			crisisAllowsResolutions: false,
			hasWorkingPapers: false
		} as const;

		expect(startablePaperKinds(committee)).toEqual(['draft_resolution']);
	});

	it('offers a crisis committee its four kinds, and the other two only when its organiser allows', () => {
		const crisisKinds = [
			'committee_directive',
			'joint_directive',
			'personal_directive',
			'press_release'
		];
		const directivesOnly = {
			format: 'crisis',
			crisisAllowsResolutions: false,
			hasWorkingPapers: true
		} as const;

		expect(startablePaperKinds(directivesOnly)).toEqual(crisisKinds);
		expect(startablePaperKinds({ ...directivesOnly, crisisAllowsResolutions: true })).toEqual([
			...crisisKinds,
			'working_paper',
			'draft_resolution'
		]);
		expect(
			startablePaperKinds({
				...directivesOnly,
				crisisAllowsResolutions: true,
				hasWorkingPapers: false
			})
		).toEqual([...crisisKinds, 'draft_resolution']);
	});
});

describe('papersPageTitle', () => {
	it('says "Directives" in a crisis committee and "Resolutions" elsewhere', () => {
		expect(papersPageTitle('crisis')).toBe('Directives');
		expect(papersPageTitle('standard')).toBe('Resolutions');
	});
});

describe('noPassedPaperSentence', () => {
	it('speaks of resolutions, or of directives in a crisis committee', () => {
		expect(noPassedPaperSentence('standard')).toBe('No resolution has passed.');
		expect(noPassedPaperSentence('crisis')).toBe('No directive has passed.');
	});
});

describe('presetTopic', () => {
	const topics = ['Lethal autonomous weapons systems', 'Small arms and light weapons'];

	it('starts on the topic on the agenda', () => {
		expect(presetTopic({ topics, agendaTopic: 'Small arms and light weapons' })).toBe(
			'Small arms and light weapons'
		);
	});

	it('leaves the delegate to pick when nothing is on the agenda', () => {
		expect(presetTopic({ topics, agendaTopic: null })).toBeNull();
	});

	it('ignores an agenda topic that is no longer one of the committee’s', () => {
		expect(presetTopic({ topics, agendaTopic: 'Outer space' })).toBeNull();
	});

	it('starts on a committee’s only topic', () => {
		expect(presetTopic({ topics: ['Outer space'], agendaTopic: null })).toBe('Outer space');
	});

	it('has nothing to start on in a committee with no topics', () => {
		expect(presetTopic({ topics: [], agendaTopic: null })).toBeNull();
	});
});

describe('paperKindAndNumber', () => {
	it('names the kind before the dais numbers the paper', () => {
		expect(paperKindAndNumber(paper())).toBe('Working paper');
	});

	it('adds the topic and the paper’s place on it once numbered', () => {
		const numbered = paper({ kind: 'draft_resolution', topicNumber: 1, sequence: 2 });

		expect(paperKindAndNumber(numbered)).toBe('Draft resolution 1.2');
	});
});

describe('paperTextLabel', () => {
	it('names the text after the kind of paper', () => {
		expect(paperTextLabel('working_paper')).toBe("The working paper's text");
		expect(paperTextLabel('draft_resolution')).toBe("The draft resolution's text");
	});
});

describe('paperMetaLine', () => {
	it('gives the kind, the topic and how the text stands, kept from breaking before a dot', () => {
		expect(paperMetaLine(paper(), 'Saved')).toBe(
			'Working paper · Lethal autonomous weapons systems · Saved'
		);
	});

	it('leaves out a topic the committee does not have, and a save word nothing gives', () => {
		expect(paperMetaLine(paper({ topic: null }), null)).toBe('Working paper');
	});

	it('says who may see a draft in place of the topic its heading names', () => {
		expect(paperMetaLine(paper(), 'Saved', 'Private to the authors')).toBe(
			'Working paper · Private to the authors · Saved'
		);
	});
});

describe('paperSaveWord', () => {
	it('says the text is saving while a save waits or is on its way', () => {
		expect(paperSaveWord('waiting')).toBe('Saving…');
		expect(paperSaveWord('saving')).toBe('Saving…');
	});

	it('says it is not saved once a save failed or met another', () => {
		expect(paperSaveWord('failed')).toBe('Not saved');
		expect(paperSaveWord('conflict')).toBe('Not saved');
	});

	it('says it is saved otherwise', () => {
		expect(paperSaveWord('saved')).toBe('Saved');
	});
});

describe('hasPassed', () => {
	it('is true for a passed paper and false for a failed or introduced one', () => {
		expect(hasPassed({ kind: 'draft_resolution', status: 'passed' })).toBe(true);
		expect(hasPassed({ kind: 'draft_resolution', status: 'failed' })).toBe(false);
		expect(hasPassed({ kind: 'draft_resolution', status: 'introduced' })).toBe(false);
	});

	it('keeps a committee directive passed once the crisis staff have answered it', () => {
		expect(hasPassed({ kind: 'committee_directive', status: 'carried_out' })).toBe(true);
		expect(hasPassed({ kind: 'committee_directive', status: 'refused' })).toBe(true);
		expect(hasPassed({ kind: 'working_paper', status: 'refused' })).toBe(false);
	});
});

describe('paperSections', () => {
	it('lists the reader’s papers first, most recently changed first, whatever their status', () => {
		const older = paper({ id: 'older', myRole: 'author', updatedAt: '2099-03-01T09:00:00.000Z' });
		const newer = paper({
			id: 'newer',
			myRole: 'signatory',
			updatedAt: '2099-03-01T10:00:00.000Z'
		});
		const passed = paper({ id: 'passed', myRole: 'author', status: 'passed' });

		const sections = paperSections([older, passed, newer]);

		expect(sections.yours.map((listed) => listed.id)).toEqual(['newer', 'older', 'passed']);
	});

	it('lists other seats’ papers open for signatures, and never one the reader is on', () => {
		const open = paper({ id: 'open', isOpenForSignatures: true });
		const mine = paper({ id: 'mine', isOpenForSignatures: true, myRole: 'author' });
		const closed = paper({ id: 'closed' });

		const sections = paperSections([open, mine, closed]);

		expect(sections.openForSignatures.map((listed) => listed.id)).toEqual(['open']);
	});

	it('does not list a paper open for signatures once it has gone to the dais', () => {
		const submitted = paper({ isOpenForSignatures: true, status: 'submitted' });

		expect(paperSections([submitted]).openForSignatures).toEqual([]);
	});

	it('lists introduced papers by topic, kind and number, the reader’s own among them', () => {
		const draft = paper({
			id: 'draft 1.1',
			kind: 'draft_resolution',
			status: 'introduced',
			topicNumber: 1,
			sequence: 1
		});
		const second = paper({ id: 'wp 1.2', status: 'introduced', topicNumber: 1, sequence: 2 });
		const first = paper({
			id: 'wp 1.1',
			status: 'introduced',
			topicNumber: 1,
			sequence: 1,
			myRole: 'author'
		});
		const otherTopic = paper({ id: 'wp 2.1', status: 'introduced', topicNumber: 2, sequence: 1 });

		const sections = paperSections([otherTopic, draft, second, first]);

		expect(sections.introduced.map((listed) => listed.id)).toEqual([
			'wp 1.1',
			'wp 1.2',
			'draft 1.1',
			'wp 2.1'
		]);
	});

	it('keeps a passed committee directive among the passed once the crisis staff answer it', () => {
		const carriedOut = paper({ id: 'carried', kind: 'committee_directive', status: 'carried_out' });
		const refused = paper({ id: 'refused', kind: 'committee_directive', status: 'refused' });
		const personal = paper({ id: 'personal', kind: 'personal_directive', status: 'carried_out' });

		const sections = paperSections([carriedOut, refused, personal]);

		expect(sections.passed.map((listed) => listed.id).sort()).toEqual(['carried', 'refused']);
	});

	it('lists passed resolutions by number', () => {
		const second = paper({ id: '1.2', status: 'passed', topicNumber: 1, sequence: 2 });
		const first = paper({ id: '1.1', status: 'passed', topicNumber: 1, sequence: 1 });

		expect(paperSections([second, first]).passed.map((listed) => listed.id)).toEqual([
			'1.1',
			'1.2'
		]);
	});

	it('leaves out papers being written that are not open, and papers that failed', () => {
		const sections = paperSections([paper(), paper({ status: 'failed' })]);

		expect(sections).toEqual({ yours: [], openForSignatures: [], introduced: [], passed: [] });
	});
});

describe('paperStatusLine', () => {
	it('says a paper its authors have opened is open for signatures', () => {
		expect(paperStatusLine(paper({ isOpenForSignatures: true }))).toEqual({
			text: 'Open for signatures',
			tone: 'neutral'
		});
	});

	it('says the status of any other paper, in its colour', () => {
		expect(paperStatusLine(paper())).toEqual({ text: 'Being written', tone: 'neutral' });
		expect(paperStatusLine(paper({ status: 'introduced' }))).toEqual({
			text: 'Introduced',
			tone: 'brand'
		});
	});

	it('goes by the status once a paper opened for signatures has gone to the dais', () => {
		expect(paperStatusLine(paper({ status: 'submitted', isOpenForSignatures: true }))).toEqual({
			text: 'Submitted',
			tone: 'warning'
		});
	});
});

describe('authorWords', () => {
	it('says authors and lead by default', () => {
		expect(authorWords('sponsors_and_signatories')).toEqual({
			heading: 'Authors',
			lead: 'Lead',
			anAuthor: 'an author',
			makeLead: 'Make lead',
			add: 'Add an author'
		});
	});

	it('says submitters and main submitter with THIMUN’s words', () => {
		expect(authorWords('submitters')).toEqual({
			heading: 'Submitters',
			lead: 'Main submitter',
			anAuthor: 'a co-submitter',
			makeLead: 'Make main submitter',
			add: 'Add a co-submitter'
		});
	});

	it('calls the authors of a draft resolution or a directive its sponsors', () => {
		expect(authorWords('sponsors_and_signatories', 'draft_resolution')).toMatchObject({
			heading: 'Sponsors',
			anAuthor: 'a sponsor',
			add: 'Add a sponsor'
		});
		expect(authorWords('sponsors_and_signatories', 'committee_directive').heading).toBe('Sponsors');
		expect(authorWords('submitters', 'draft_resolution').heading).toBe('Submitters');
	});
});

describe('authorAddedMessage', () => {
	it('names the seat added, in the committee’s own words', () => {
		expect(authorAddedMessage('Mexico', authorWords('sponsors_and_signatories'))).toBe(
			'Mexico is now an author.'
		);
		expect(authorAddedMessage('Mexico', authorWords('submitters'))).toBe(
			'Mexico is now a co-submitter.'
		);
	});
});

describe('leadHandedMessage', () => {
	it('names the new lead, in the committee’s own words', () => {
		expect(leadHandedMessage('Mexico', authorWords('sponsors_and_signatories'))).toBe(
			'Mexico is now the lead.'
		);
		expect(leadHandedMessage('Mexico', authorWords('submitters'))).toBe(
			'Mexico is now the main submitter.'
		);
	});
});

describe('paperPersonLine', () => {
	const words = authorWords('sponsors_and_signatories');

	it('names the reader and says they lead', () => {
		expect(paperPersonLine(person(), words)).toBe('Clara Whitfield (you) · Lead');
	});

	it('names another author on their own', () => {
		const daniel = person({ holderName: 'Daniel Okafor', isLead: false, isMine: false });

		expect(paperPersonLine(daniel, words)).toBe('Daniel Okafor');
	});

	it('says only the lead for a seat nobody holds now', () => {
		expect(paperPersonLine(person({ holderName: null, isMine: false }), words)).toBe('Lead');
	});

	it('uses the committee’s word for the lead', () => {
		expect(paperPersonLine(person(), authorWords('submitters'))).toBe(
			'Clara Whitfield (you) · Main submitter'
		);
	});
});

describe('leavePaperSentence', () => {
	const leaving =
		'Your seat stops writing this paper, and you can no longer open it while it is being written.';

	it('tells an author that their seat stops writing the paper', () => {
		expect(leavePaperSentence(false, authorWords('sponsors_and_signatories'))).toBe(leaving);
	});

	it('tells the lead who leads next, in the committee’s own words', () => {
		expect(leavePaperSentence(true, authorWords('sponsors_and_signatories'))).toBe(
			`${leaving} Of the other authors, the one who joined first becomes the lead.`
		);
		expect(leavePaperSentence(true, authorWords('submitters'))).toBe(
			`${leaving} Of the other submitters, the one who joined first becomes the main submitter.`
		);
	});
});

describe('isLoneLead', () => {
	it('is true for the reader’s seat leading a paper alone', () => {
		expect(isLoneLead([person()])).toBe(true);
	});

	it('is false once another seat writes the paper too', () => {
		const daniel = person({ seatId: 'seat-mexico', isLead: false, isMine: false });

		expect(isLoneLead([person(), daniel])).toBe(false);
	});

	it('does not count the paper’s signatories as authors', () => {
		const signatory = person({
			seatId: 'seat-chile',
			role: 'signatory',
			isLead: false,
			isMine: false
		});

		expect(isLoneLead([person(), signatory])).toBe(true);
	});

	it('is false for a reader who does not lead the paper', () => {
		expect(isLoneLead([person({ isMine: false })])).toBe(false);
	});
});

describe('paperLiveWriters', () => {
	it('names the people holding the seats that write the paper, by their seats', () => {
		const people = [
			person(),
			person({
				seatId: 'seat-brazil',
				seatName: 'Brazil',
				holderId: 'user-ana',
				holderName: 'Ana Souza',
				role: 'author',
				isMine: false,
				isLead: false
			}),
			// A signatory signs but does not type, and a seat nobody holds has no writer.
			person({
				seatId: 'seat-chile',
				seatName: 'Chile',
				holderId: 'user-lu',
				holderName: 'Lu Fernandez',
				role: 'signatory',
				isMine: false,
				isLead: false
			}),
			person({
				seatId: 'seat-peru',
				seatName: 'Peru',
				holderId: null,
				holderName: null,
				isMine: false,
				isLead: false
			})
		];

		expect(paperLiveWriters(people)).toEqual([
			{ id: 'user-clara', name: 'Clara Whitfield', seatName: 'Austria' },
			{ id: 'user-ana', name: 'Ana Souza', seatName: 'Brazil' }
		]);
	});
});

describe('paperPeopleActions', () => {
	const daniel = person({ seatId: 'seat-mexico', holderName: 'Daniel Osei', isLead: false });
	const neverSubmitted = { status: 'writing' as const, submittedAt: null };
	const returned = { status: 'writing' as const, submittedAt: '2099-03-01T09:12:00.000Z' };

	it('offers nothing to somebody who may not write the paper', () => {
		expect(paperPeopleActions([person()], neverSubmitted, false)).toEqual(NO_PAPER_ACTIONS);
		expect(Object.values(NO_PAPER_ACTIONS).every((may) => may === false)).toBe(true);
	});

	it('lets the lead add, hand the lead on and leave while another author remains', () => {
		const others = { ...daniel, isMine: false };

		expect(paperPeopleActions([person(), others], neverSubmitted, true)).toEqual({
			canAdd: true,
			canHandLead: true,
			canLeave: true,
			canDelete: false,
			canSubmit: true,
			canWithdraw: false
		});
	});

	it('lets another author add and leave, but not hand on a lead that is not theirs', () => {
		const clara = person({ isMine: false });
		const actions = paperPeopleActions([clara, daniel], neverSubmitted, true);

		expect(actions.canHandLead).toBe(false);
		expect(actions.canLeave).toBe(true);
	});

	it('lets the only author delete, in place of leaving, until the paper is submitted', () => {
		expect(paperPeopleActions([person()], neverSubmitted, true)).toMatchObject({
			canLeave: false,
			canDelete: true
		});
		expect(paperPeopleActions([person()], returned, true)).toMatchObject({
			canLeave: false,
			canDelete: false
		});
	});

	it('never offers to add an author to a personal directive, which is one character’s own', () => {
		const directive = { ...neverSubmitted, kind: 'personal_directive' as const };
		const joint = { ...neverSubmitted, kind: 'joint_directive' as const };

		expect(paperPeopleActions([person()], directive, true).canAdd).toBe(false);
		expect(paperPeopleActions([person()], joint, true).canAdd).toBe(true);
	});

	it('lets an author withdraw a paper that has been to the dais, until it is introduced', () => {
		const submitted = { ...returned, status: 'submitted' as const };
		const approved = { ...returned, status: 'approved' as const };
		const introduced = { ...returned, status: 'introduced' as const };
		const signatory = person({ role: 'signatory' });

		expect(paperPeopleActions([person()], returned, true).canWithdraw).toBe(true);
		expect(paperPeopleActions([person()], submitted, false)).toMatchObject({
			canSubmit: false,
			canWithdraw: true
		});
		expect(paperPeopleActions([person()], approved, false).canWithdraw).toBe(true);
		expect(paperPeopleActions([person()], introduced, false).canWithdraw).toBe(false);
		expect(paperPeopleActions([person()], neverSubmitted, true).canWithdraw).toBe(false);
		expect(paperPeopleActions([signatory], submitted, false).canWithdraw).toBe(false);
	});
});

describe('readPaperDialog', () => {
	const everything: PaperPeopleActions = {
		canAdd: true,
		canHandLead: true,
		canLeave: true,
		canDelete: true,
		canSubmit: true,
		canWithdraw: true
	};

	it('opens the dialog the address asks for', () => {
		expect(readPaperDialog(new URLSearchParams('add=1'), everything)).toBe('add');
		expect(readPaperDialog(new URLSearchParams('leave=1'), everything)).toBe('leave');
		expect(readPaperDialog(new URLSearchParams('delete=1'), everything)).toBe('delete');
		expect(readPaperDialog(new URLSearchParams('submit=1'), everything)).toBe('submit');
		expect(readPaperDialog(new URLSearchParams('withdraw=1'), everything)).toBe('withdraw');
	});

	it('opens none for an address without one', () => {
		expect(readPaperDialog(new URLSearchParams(''), everything)).toBeNull();
	});

	it('never opens a dialog the reader may not use', () => {
		const onlyLeave = {
			...everything,
			canAdd: false,
			canDelete: false,
			canSubmit: false,
			canWithdraw: false
		};

		expect(readPaperDialog(new URLSearchParams('add=1'), onlyLeave)).toBeNull();
		expect(readPaperDialog(new URLSearchParams('delete=1'), onlyLeave)).toBeNull();
		expect(readPaperDialog(new URLSearchParams('submit=1'), onlyLeave)).toBeNull();
		expect(readPaperDialog(new URLSearchParams('withdraw=1'), onlyLeave)).toBeNull();
	});
});

describe('the limits and messages', () => {
	it('keeps titles to what start_paper accepts', () => {
		expect(PAPER_TITLE_MAX_LENGTH).toBe(200);
	});

	it('tells a committee paper’s writer to save again, never to upload a PDF', () => {
		expect(COMMITTEE_PAPER_MESSAGES.tooLong).not.toContain('PDF');
		expect(COMMITTEE_PAPER_MESSAGES.conflict).toContain('"Save changes"');
	});
});

describe('readNewPaperForm', () => {
	const TOPICS = ['Lethal autonomous weapons systems', 'Small arms and light weapons'];
	const KINDS = ['working_paper', 'draft_resolution'] as const;
	const KIND_LIST = [...KINDS];
	const CONTROL_ID = '0b9e2c3a-1d4f-4a5b-8c6d-7e8f9a0b1c2d';
	const REGISTRY_ID = '1c0f3d4b-2e5a-4b6c-9d7e-8f9a0b1c2d3e';

	/** The form as a browser sends it; a list sends the field once for each value. */
	function formOf(fields: Record<string, string | string[]>): FormData {
		const formData = new FormData();
		for (const [name, value] of Object.entries(fields)) {
			for (const one of [value].flat()) formData.append(name, one);
		}
		return formData;
	}

	it('reads the kind, the title, tidied, and the topic', () => {
		const form = formOf({
			kind: 'working_paper',
			title: '  Meaningful human control ',
			topic: TOPICS[1]
		});

		expect(readNewPaperForm(form, TOPICS, KIND_LIST)).toEqual({
			values: {
				kind: 'working_paper',
				title: 'Meaningful human control',
				topic: TOPICS[1],
				sourcePaperIds: []
			},
			errors: {}
		});
	});

	it('reads the working papers a draft resolution is based on, each once', () => {
		const form = formOf({
			kind: 'draft_resolution',
			title: 'Meaningful human control',
			topic: TOPICS[0],
			sourcePaperIds: [CONTROL_ID, REGISTRY_ID.toUpperCase(), CONTROL_ID, 'Working paper 1.1']
		});

		expect(readNewPaperForm(form, TOPICS, KIND_LIST).values.sourcePaperIds).toEqual([
			CONTROL_ID,
			REGISTRY_ID
		]);
	});

	it('drops the ticked working papers for any other kind, as the form sends them without JavaScript', () => {
		const form = formOf({
			kind: 'working_paper',
			title: 'Meaningful human control',
			topic: TOPICS[0],
			sourcePaperIds: [CONTROL_ID]
		});

		expect(readNewPaperForm(form, TOPICS, KIND_LIST).values.sourcePaperIds).toEqual([]);
	});

	it('asks for a kind the committee writes, keeping one it does on the form', () => {
		const form = formOf({ kind: 'press_release', title: 'Export controls', topic: TOPICS[0] });

		const { values, errors } = readNewPaperForm(form, TOPICS, KIND_LIST);

		expect(errors).toEqual({ kind: 'Choose the kind of paper.' });
		expect(values.kind).toBe('working_paper');
	});

	it('asks for a title', () => {
		const form = formOf({ kind: 'working_paper', title: ' ', topic: TOPICS[0] });

		expect(readNewPaperForm(form, TOPICS, KIND_LIST).errors).toEqual({
			title: 'Give the paper a title.'
		});
	});

	it('refuses a title longer than start_paper allows', () => {
		const longest = 'a'.repeat(PAPER_TITLE_MAX_LENGTH);
		const fits = formOf({ kind: 'working_paper', title: longest, topic: TOPICS[0] });
		const tooLong = formOf({ kind: 'working_paper', title: `${longest}b`, topic: TOPICS[0] });

		expect(readNewPaperForm(fits, TOPICS, KIND_LIST).errors).toEqual({});
		expect(readNewPaperForm(tooLong, TOPICS, KIND_LIST).errors).toEqual({
			title: 'The title can be at most 200 characters.'
		});
	});

	it('asks for one of the committee’s topics', () => {
		const none = readNewPaperForm(
			formOf({ kind: 'working_paper', title: 'Export controls' }),
			TOPICS,
			KIND_LIST
		);
		const other = readNewPaperForm(
			formOf({ kind: 'working_paper', title: 'Export controls', topic: 'Space' }),
			TOPICS,
			KIND_LIST
		);

		expect(none.errors).toEqual({ topic: 'Choose the topic the paper is on.' });
		expect(none.values.topic).toBeNull();
		expect(other.errors).toEqual({ topic: 'Choose the topic the paper is on.' });
	});

	it('gives a paper no topic in a committee that has none', () => {
		const form = formOf({ kind: 'working_paper', title: 'Export controls', topic: 'Space' });

		expect(readNewPaperForm(form, [], KIND_LIST)).toEqual({
			values: { kind: 'working_paper', title: 'Export controls', topic: null, sourcePaperIds: [] },
			errors: {}
		});
	});
});

describe('readChosenSeat', () => {
	/** The form with just the chosen seat. */
	function formWithSeat(seatId?: string): FormData {
		const formData = new FormData();
		if (seatId !== undefined) formData.set('seatId', seatId);
		return formData;
	}

	it('reads the id of the chosen seat', () => {
		const id = '0B9E2C3A-1D4F-4A5B-8C6D-7E8F9A0B1C2D';

		expect(readChosenSeat(formWithSeat(` ${id} `))).toBe(id.toLowerCase());
	});

	it('is null when no seat was chosen, or the form sent something that is no id', () => {
		expect(readChosenSeat(formWithSeat())).toBeNull();
		expect(readChosenSeat(formWithSeat(''))).toBeNull();
		expect(readChosenSeat(formWithSeat('Mexico'))).toBeNull();
	});
});

describe('paperSourceLabel', () => {
	it('names the working paper by its number and its title', () => {
		const source = {
			id: 'working-paper-1',
			kind: 'working_paper',
			topicNumber: 1,
			sequence: 1,
			title: 'Meaningful human control'
		} as const;

		expect(paperSourceLabel(source)).toBe('Working paper 1.1 · Meaningful human control');
	});
});

describe('sourcePaperMetaLine', () => {
	it('names the authors in order, then the day it was introduced where the conference is', () => {
		expect(
			sourcePaperMetaLine(['Austria', 'Costa Rica'], '2027-03-14T23:30:00Z', 'Europe/London')
		).toBe('Austria, Costa Rica · Introduced 14 March');
		expect(sourcePaperMetaLine(['Austria'], '2027-03-14T23:30:00Z', 'Europe/Vienna')).toBe(
			'Austria · Introduced 15 March'
		);
	});

	it('leaves out what it has nothing to say about', () => {
		expect(sourcePaperMetaLine([], '2027-03-14T09:00:00Z', 'UTC')).toBe('Introduced 14 March');
		expect(sourcePaperMetaLine(['Austria'], null, 'UTC')).toBe('Austria');
	});
});
