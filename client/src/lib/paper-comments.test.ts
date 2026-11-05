import { describe, expect, it } from 'vitest';
import {
	addressedComment,
	commentBodyParts,
	commentTimeText,
	openSuggestionsText,
	plainFormSuggestionsMessage,
	quotedText,
	quotedTextOn,
	type PaperComment,
	type PaperThread
} from './paper-comments';

describe('commentBodyParts', () => {
	it('gives plain words back as one piece of text', () => {
		expect(commentBodyParts('Numbers and dates checked.')).toEqual([
			{ kind: 'text', text: 'Numbers and dates checked.' }
		]);
	});

	it('cuts a web address out as a link, leaving the full stop after it in the text', () => {
		expect(commentBodyParts('See https://www.un.org/disarmament. It helps.')).toEqual([
			{ kind: 'text', text: 'See ' },
			{ kind: 'link', href: 'https://www.un.org/disarmament' },
			{ kind: 'text', text: '. It helps.' }
		]);
	});

	it('keeps a bracket the address opened, and drops one the sentence opened', () => {
		expect(commentBodyParts('https://en.wikipedia.org/wiki/Mine_(weapon)')).toEqual([
			{ kind: 'link', href: 'https://en.wikipedia.org/wiki/Mine_(weapon)' }
		]);
		expect(commentBodyParts('(see http://example.org/a)')).toEqual([
			{ kind: 'text', text: '(see ' },
			{ kind: 'link', href: 'http://example.org/a' },
			{ kind: 'text', text: ')' }
		]);
	});

	it('links nothing but web addresses, so a comment cannot hold a script', () => {
		expect(commentBodyParts('javascript:alert(1) and <b>bold</b>')).toEqual([
			{ kind: 'text', text: 'javascript:alert(1) and <b>bold</b>' }
		]);
	});

	it('leaves an address with nothing after its scheme as text', () => {
		expect(commentBodyParts('https://.')).toEqual([{ kind: 'text', text: 'https://.' }]);
	});
});

describe('commentTimeText', () => {
	const NOW = new Date('2026-10-09T15:00:00Z');

	it('gives the time alone on the same day, in the conference timezone', () => {
		expect(commentTimeText('2026-10-09T14:12:00Z', NOW, 'Europe/London')).toBe('15:12');
	});

	it('gives the weekday and date on another day', () => {
		expect(commentTimeText('2026-10-08T16:18:00Z', NOW, 'Europe/London')).toBe('Thu 8 Oct, 17:18');
	});

	it('counts the day where the conference is, not where the server is', () => {
		// 23:30 on the 8th in London is 07:30 on the 9th in Tokyo, where it is 14:00 on the 9th now.
		const tokyoAfternoon = new Date('2026-10-09T05:00:00Z');

		expect(commentTimeText('2026-10-08T22:30:00Z', tokyoAfternoon, 'Asia/Tokyo')).toBe('07:30');
		expect(commentTimeText('2026-10-08T22:30:00Z', tokyoAfternoon, 'Europe/London')).toBe(
			'Thu 8 Oct, 23:30'
		);
	});
});

describe('quotedText and quotedTextOn', () => {
	it('quotes the words a thread is on with curly quotes', () => {
		expect(quotedText('Decides to remain actively seized of the matter;')).toBe(
			'‘Decides to remain actively seized of the matter;’'
		);
	});

	it('cuts long words short as a card does', () => {
		expect(
			quotedText('Calls upon all Member States to refrain from developing weapons systems')
		).toBe('‘Calls upon all Member States to refrain from developing…’');
	});

	it('says what a thread is on, for its card under the paper on a phone', () => {
		expect(quotedTextOn('no later than 2028')).toBe('On ‘no later than 2028’');
	});
});

describe('openSuggestionsText', () => {
	it('counts the suggestions still to decide', () => {
		expect(openSuggestionsText(1)).toBe('1 suggestion to decide');
		expect(openSuggestionsText(4)).toBe('4 suggestions to decide');
	});
});

describe('plainFormSuggestionsMessage', () => {
	it('says how many suggestions keep the plain form from saving, and why', () => {
		expect(plainFormSuggestionsMessage(1)).toBe(
			'1 suggestion is still to be decided, which needs JavaScript. Until it is, the paper cannot be saved here: saving would throw it away.'
		);
		expect(plainFormSuggestionsMessage(3)).toMatch(/^3 suggestions are still to be decided/);
	});
});

describe('addressedComment', () => {
	const mine: PaperComment = {
		id: 'comment-1',
		writerName: 'Tomás Fernández',
		seatName: 'Mexico',
		body: 'Is 2028 too soon?',
		isDeleted: false,
		writtenAt: '10:31',
		isMine: true
	};
	const theirs: PaperComment = { ...mine, id: 'comment-2', isMine: false };
	const gone: PaperComment = { ...mine, id: 'comment-3', isDeleted: true };
	const thread: PaperThread = {
		id: 'thread-1',
		fragment: 'body',
		anchorStart: null,
		anchorEnd: null,
		quotedText: null,
		suggestionId: null,
		isResolved: false,
		resolvedByName: null,
		comments: [mine, theirs, gone]
	};

	function opened(search: string) {
		return addressedComment(new URLSearchParams(search), [thread]);
	}

	it('opens the reader’s own comment to change or to delete, with its thread', () => {
		expect(opened('editComment=comment-1')).toEqual({
			action: 'edit',
			threadId: 'thread-1',
			comment: mine
		});
		expect(opened('deleteComment=comment-1')?.action).toBe('delete');
	});

	it('opens nothing for another writer’s comment, a deleted one or one not on the paper', () => {
		expect(opened('editComment=comment-2')).toBeNull();
		expect(opened('deleteComment=comment-3')).toBeNull();
		expect(opened('editComment=elsewhere')).toBeNull();
		expect(opened('')).toBeNull();
	});
});
