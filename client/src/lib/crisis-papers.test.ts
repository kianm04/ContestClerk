import { describe, expect, it } from 'vitest';
import type { PaperListItem } from './committee-papers';
import {
	CRISIS_ANSWER_MAX_LENGTH,
	CRISIS_STAFF_KINDS,
	CRISIS_UPDATE_MAX_LENGTH,
	CRISIS_WITHDRAW_TEXT,
	answerChoices,
	answeredMessage,
	crisisDeskMetaLine,
	crisisDeskSections,
	crisisPanel,
	crisisPaperMetaLine,
	crisisProgressWord,
	crisisUpdateLabel,
	crisisUpdateSentMessage,
	goesToCrisisStaff,
	isAnsweredByCrisisStaff,
	isWaitingForCrisisStaff,
	isWithCrisisStaff,
	paperStandingWord,
	publishedPressReleases,
	readAnswerForm,
	readCrisisUpdateForm,
	sendConfirmText,
	submitWords,
	type CrisisAnswer,
	type CrisisDeskItem
} from './crisis-papers';

// London keeps Greenwich time in the middle of March, so these read as written.
const LONDON = 'Europe/London';

const SENT_AT = '2099-03-15T09:12:00Z';

const CARRIED_OUT: CrisisAnswer = {
	outcome: 'carried_out',
	text: 'The fleet sails at dawn.',
	answeredAt: '2099-03-15T10:02:00Z'
};

/** A personal directive on the crisis staff's page, with `overrides` on top. */
function deskItem(overrides: Partial<CrisisDeskItem> = {}): CrisisDeskItem {
	return {
		id: 'paper-1',
		kind: 'personal_directive',
		status: 'submitted',
		title: 'Seize the ports',
		characters: ['Minister of Defence'],
		sentAt: SENT_AT,
		answeredAt: null,
		...overrides
	};
}

/** A paper on the committee's list, with `overrides` on top. */
function listItem(overrides: Partial<PaperListItem> = {}): PaperListItem {
	return {
		id: 'paper-1',
		kind: 'press_release',
		status: 'published',
		title: 'The government stands firm',
		topic: null,
		topicNumber: null,
		sequence: null,
		isOpenForSignatures: false,
		updatedAt: '2099-03-15T09:00:00Z',
		myRole: null,
		...overrides
	};
}

/** A form as the browser would send it. */
function formWith(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

describe('goesToCrisisStaff and CRISIS_STAFF_KINDS', () => {
	it('sends joint and personal directives and press releases to the crisis staff', () => {
		expect(CRISIS_STAFF_KINDS).toEqual(['joint_directive', 'personal_directive', 'press_release']);
		for (const kind of CRISIS_STAFF_KINDS) expect(goesToCrisisStaff(kind)).toBe(true);
	});

	it('sends a committee directive, like a draft resolution, to the dais', () => {
		expect(goesToCrisisStaff('committee_directive')).toBe(false);
		expect(goesToCrisisStaff('draft_resolution')).toBe(false);
	});
});

describe('isAnsweredByCrisisStaff', () => {
	it('is true for carried out, refused and published alone', () => {
		expect(isAnsweredByCrisisStaff('carried_out')).toBe(true);
		expect(isAnsweredByCrisisStaff('refused')).toBe(true);
		expect(isAnsweredByCrisisStaff('published')).toBe(true);
		expect(isAnsweredByCrisisStaff('passed')).toBe(false);
		expect(isAnsweredByCrisisStaff('submitted')).toBe(false);
	});
});

describe('isWithCrisisStaff', () => {
	it('talks of the crisis staff for their kinds, and for a committee directive they answered', () => {
		expect(isWithCrisisStaff({ kind: 'press_release', status: 'writing' })).toBe(true);
		expect(isWithCrisisStaff({ kind: 'committee_directive', status: 'carried_out' })).toBe(true);
		expect(isWithCrisisStaff({ kind: 'committee_directive', status: 'passed' })).toBe(false);
	});
});

describe('submitWords', () => {
	it('submits to the dais', () => {
		const words = submitWords('draft_resolution');

		expect(words.button).toBe('Submit to the dais');
		expect(words.question('Ports')).toBe('Submit “Ports” to the dais?');
		expect(words.done('Ports')).toBe('“Ports” is with the dais.');
	});

	it('sends a directive or a press release to the crisis staff', () => {
		const words = submitWords('personal_directive');

		expect(words.button).toBe('Send to the crisis staff');
		expect(words.question('Ports')).toBe('Send “Ports” to the crisis staff?');
		expect(words.done('Ports')).toBe('“Ports” is with the crisis staff.');
		expect(submitWords('committee_directive').button).toBe('Submit to the dais');
	});
});

describe('sendConfirmText and CRISIS_WITHDRAW_TEXT', () => {
	it('says what the crisis staff will do, and that the text is frozen', () => {
		expect(sendConfirmText('joint_directive')).toContain('carry it out or refuse it');
		expect(sendConfirmText('press_release')).toContain('publish it to the committee or refuse it');
		expect(sendConfirmText('press_release')).toContain('Nobody can change it once it is sent.');
		expect(CRISIS_WITHDRAW_TEXT).toContain('The crisis staff no longer answer it.');
	});
});

describe('crisisProgressWord', () => {
	it('says when it was sent while the crisis staff have it', () => {
		const paper = { kind: 'personal_directive' as const, status: 'submitted' as const };

		expect(crisisProgressWord({ ...paper, submittedAt: SENT_AT }, null, LONDON)).toBe(
			'Sent 15 March, 09:12 · With the crisis staff'
		);
		expect(crisisProgressWord({ ...paper, submittedAt: null }, null, LONDON)).toBe(
			'With the crisis staff'
		);
	});

	it('says what they answered, and when', () => {
		const paper = { kind: 'joint_directive' as const, status: 'carried_out' as const };

		expect(crisisProgressWord({ ...paper, submittedAt: SENT_AT }, CARRIED_OUT, LONDON)).toBe(
			'Carried out 15 March, 10:02'
		);
		expect(crisisProgressWord({ ...paper, submittedAt: SENT_AT }, null, LONDON)).toBe(
			'Carried out'
		);
	});

	it('says nothing while it is being written, or for a submitted committee directive', () => {
		expect(
			crisisProgressWord(
				{ kind: 'press_release', status: 'writing', submittedAt: null },
				null,
				LONDON
			)
		).toBeNull();
		expect(
			crisisProgressWord(
				{ kind: 'committee_directive', status: 'submitted', submittedAt: SENT_AT },
				null,
				LONDON
			)
		).toBeNull();
	});
});

describe('paperStandingWord', () => {
	it('speaks of the crisis staff for their kinds and of the dais for the rest', () => {
		expect(
			paperStandingWord(
				{ kind: 'personal_directive', status: 'submitted', submittedAt: SENT_AT },
				null,
				null,
				LONDON
			)
		).toBe('Sent 15 March, 09:12 · With the crisis staff');
		expect(
			paperStandingWord(
				{ kind: 'draft_resolution', status: 'submitted', submittedAt: SENT_AT },
				null,
				null,
				LONDON
			)
		).toBe('Submitted 15 March, 09:12 · With the dais');
	});

	it('says how the vote went on a paper the committee voted on', () => {
		const vote = {
			passed: true,
			counts: { for: 31, against: 6, abstain: 7 },
			closedAt: '2027-03-16T16:40:00Z'
		};

		expect(
			paperStandingWord(
				{ kind: 'draft_resolution', status: 'passed', submittedAt: SENT_AT, vote },
				null,
				null,
				LONDON
			)
		).toBe('Passed 16 March, 16:40 · 31 for · 6 against · 7 abstentions');
	});
});

describe('crisisPanel', () => {
	const sent = { kind: 'press_release' as const, status: 'submitted' as const };
	const answered = { kind: 'joint_directive' as const, status: 'carried_out' as const };

	it('tells the authors the crisis staff have it, and nobody else', () => {
		expect(crisisPanel(sent, null, true, LONDON)).toEqual({
			title: 'With the crisis staff',
			sentence:
				'The crisis staff will publish it to the committee or refuse it. Until then the text is frozen.',
			byline: null
		});
		expect(crisisPanel(sent, null, false, LONDON)).toBeNull();
	});

	it('shows the answer to the authors, with who wrote it and when', () => {
		expect(crisisPanel(answered, CARRIED_OUT, true, LONDON)).toEqual({
			title: 'Carried out',
			sentence: 'The fleet sails at dawn.',
			byline: 'Crisis staff · 15 March, 10:02'
		});
		expect(crisisPanel(answered, CARRIED_OUT, false, LONDON)).toBeNull();
	});

	it('says what was done when the crisis staff wrote nothing back', () => {
		const silent = { ...CARRIED_OUT, outcome: 'refused' as const, text: null };

		expect(crisisPanel({ ...answered, status: 'refused' }, silent, true, LONDON)).toEqual({
			title: 'Refused',
			sentence: 'The crisis staff refused it on 15 March, 10:02.',
			byline: null
		});
	});

	it("shows a committee directive's answer to every reader, since it is the committee's", () => {
		const directive = { kind: 'committee_directive' as const, status: 'carried_out' as const };

		expect(crisisPanel(directive, CARRIED_OUT, false, LONDON)?.title).toBe('Carried out');
		expect(crisisPanel({ ...directive, status: 'passed' }, null, false, LONDON)).toBeNull();
	});
});

describe('isWaitingForCrisisStaff', () => {
	it('waits for a sent directive or press release, and a passed committee directive', () => {
		expect(isWaitingForCrisisStaff({ kind: 'joint_directive', status: 'submitted' })).toBe(true);
		expect(isWaitingForCrisisStaff({ kind: 'committee_directive', status: 'passed' })).toBe(true);
		expect(isWaitingForCrisisStaff({ kind: 'committee_directive', status: 'submitted' })).toBe(
			false
		);
		expect(isWaitingForCrisisStaff({ kind: 'press_release', status: 'published' })).toBe(false);
	});
});

describe('crisisDeskSections', () => {
	it('lists what waits oldest first, and what was answered latest first', () => {
		const later = deskItem({ id: 'later', sentAt: '2099-03-15T09:30:00Z' });
		const earlier = deskItem({ id: 'earlier', sentAt: '2099-03-15T09:00:00Z' });
		const answeredFirst = deskItem({
			id: 'answered-first',
			status: 'refused',
			answeredAt: '2099-03-15T09:40:00Z'
		});
		const answeredLast = deskItem({
			id: 'answered-last',
			status: 'carried_out',
			answeredAt: '2099-03-15T10:00:00Z'
		});

		const sections = crisisDeskSections([later, answeredFirst, earlier, answeredLast]);

		expect(sections.waiting.map((item) => item.id)).toEqual(['earlier', 'later']);
		expect(sections.answered.map((item) => item.id)).toEqual(['answered-last', 'answered-first']);
	});
});

describe('crisisDeskMetaLine', () => {
	it('names the kind, the characters and the time it was sent, or answered', () => {
		expect(crisisDeskMetaLine(deskItem(), LONDON)).toBe(
			'Personal directive · Minister of Defence · 09:12'
		);
		expect(
			crisisDeskMetaLine(
				deskItem({
					kind: 'joint_directive',
					characters: ['Minister of Defence', 'Foreign Minister'],
					status: 'carried_out',
					answeredAt: '2099-03-15T10:02:00Z'
				}),
				LONDON
			)
		).toBe('Joint directive · Minister of Defence, Foreign Minister · 10:02');
	});

	it('leaves out what it does not know', () => {
		expect(crisisDeskMetaLine(deskItem({ characters: [], sentAt: null }), LONDON)).toBe(
			'Personal directive'
		);
	});
});

describe('crisisPaperMetaLine', () => {
	it('names the kind, the characters and where it stands', () => {
		const paper = { kind: 'personal_directive' as const, status: 'submitted' as const };

		expect(
			crisisPaperMetaLine({ ...paper, submittedAt: SENT_AT }, ['Minister of Defence'], null, LONDON)
		).toBe(
			'Personal directive · Minister of Defence · Sent 15 March, 09:12 · With the crisis staff'
		);
	});

	it('says a committee directive passed while it waits', () => {
		const paper = { kind: 'committee_directive' as const, status: 'passed' as const };

		expect(crisisPaperMetaLine({ ...paper, submittedAt: SENT_AT }, [], null, LONDON)).toBe(
			'Committee directive · Passed'
		);
	});
});

describe('answerChoices', () => {
	it('carries out or refuses a directive, and publishes or refuses a press release', () => {
		expect(answerChoices('joint_directive')).toEqual([
			{ outcome: 'carried_out', label: 'Carry out' },
			{ outcome: 'refused', label: 'Refuse' }
		]);
		expect(answerChoices('press_release')).toEqual([
			{ outcome: 'published', label: 'Publish' },
			{ outcome: 'refused', label: 'Refuse' }
		]);
	});
});

describe('answeredMessage', () => {
	it('says what became of the paper', () => {
		expect(answeredMessage('carried_out', 'Seize the ports')).toBe(
			'“Seize the ports” carried out.'
		);
		expect(answeredMessage('published', 'We stand firm')).toBe('“We stand firm” published.');
	});
});

describe('readAnswerForm', () => {
	it('reads the button pressed and the answer typed, which may be empty', () => {
		expect(
			readAnswerForm(formWith({ outcome: 'refused', answer: '  Not today. ' }), 'joint_directive')
		).toEqual({ outcome: 'refused', answer: 'Not today.', error: null });
		expect(readAnswerForm(formWith({ outcome: 'carried_out' }), 'personal_directive')).toEqual({
			outcome: 'carried_out',
			answer: '',
			error: null
		});
	});

	it('refuses an outcome the kind does not allow', () => {
		expect(readAnswerForm(formWith({ outcome: 'published' }), 'joint_directive').error).toBe(
			'Choose how to answer it.'
		);
		expect(readAnswerForm(formWith({ outcome: 'carried_out' }), 'press_release').error).toBe(
			'Choose how to answer it.'
		);
	});

	it('refuses an answer over the longest the database takes', () => {
		const answer = 'a'.repeat(CRISIS_ANSWER_MAX_LENGTH + 1);

		expect(readAnswerForm(formWith({ outcome: 'refused', answer }), 'joint_directive').error).toBe(
			'An answer is at most 100,000 characters.'
		);
	});
});

describe('readCrisisUpdateForm', () => {
	it('reads the update typed, and an empty one that takes it down', () => {
		expect(readCrisisUpdateForm(formWith({ message: ' The fleet has left port. ' }))).toEqual({
			message: 'The fleet has left port.',
			error: null
		});
		expect(readCrisisUpdateForm(formWith({}))).toEqual({ message: '', error: null });
	});

	it('refuses an update over the longest the database takes', () => {
		const message = 'a'.repeat(CRISIS_UPDATE_MAX_LENGTH + 1);

		expect(readCrisisUpdateForm(formWith({ message })).error).toBe(
			'A crisis update is at most 1,000 characters.'
		);
	});
});

describe('crisisUpdateLabel', () => {
	it('says when the update was sent', () => {
		const update = { message: 'The fleet has left port.', sentAt: '2099-03-15T14:07:00Z' };

		expect(crisisUpdateLabel(update, LONDON)).toBe('Crisis update · 14:07');
	});
});

describe('crisisUpdateSentMessage', () => {
	it('says the update went to the room, or was taken down', () => {
		expect(crisisUpdateSentMessage('The fleet has left port.')).toBe(
			'Crisis update sent to the room.'
		);
		expect(crisisUpdateSentMessage('')).toBe('The crisis update is taken down.');
	});
});

describe('publishedPressReleases', () => {
	it('lists the published press releases, the latest first, and nothing else', () => {
		const older = listItem({ id: 'older', updatedAt: '2099-03-15T09:00:00Z' });
		const newer = listItem({ id: 'newer', updatedAt: '2099-03-15T10:00:00Z' });
		const refused = listItem({ id: 'refused', status: 'refused' });
		const directive = listItem({ id: 'directive', kind: 'joint_directive', status: 'carried_out' });

		expect(publishedPressReleases([older, refused, newer, directive]).map((p) => p.id)).toEqual([
			'newer',
			'older'
		]);
	});
});
