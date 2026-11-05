import { describe, expect, it } from 'vitest';
import {
	approvedMessage,
	countPaperStatuses,
	documentsTabs,
	filterPaperSeats,
	hasResourceFormErrors,
	paperStatusTone,
	parseDocumentsTab,
	readDocumentsView,
	resourceAddedText,
	reviewCommentProblem,
	totalPaperCounts,
	uploadedPaperCount,
	validateResourceForm,
	type PaperCommitteeRow,
	type PaperSeatRow
} from './documents-page';

/** A filled seat whose paper has `status`, with everything else filled in. */
function makeSeat(seatId: string, status: PaperSeatRow['status']): PaperSeatRow {
	return {
		seatId,
		seatName: seatId,
		countryCode: null,
		delegateName: 'A delegate',
		delegateAvatarPath: null,
		status,
		paper: null
	};
}

/** A committee row with `filled` seats of which `missing` have no paper. */
function makeCommitteeRow(filled: number, missing: number): PaperCommitteeRow {
	return {
		committeeId: 'unsc',
		committeeSlug: 'unsc',
		committeeHeading: 'UNSC',
		filledSeatCount: filled,
		counts: { missing, submitted: filled - missing, approved: 0, changes_requested: 0 }
	};
}

/** A PDF of `size` bytes, as `validateResourceForm` sees a file. */
function pdf(size = 1000) {
	return { type: 'application/pdf', size };
}

describe('parseDocumentsTab', () => {
	it('opens the tab the address names, and the resources for anything else', () => {
		expect(parseDocumentsTab('guides')).toBe('guides');
		expect(parseDocumentsTab('papers')).toBe('papers');
		expect(parseDocumentsTab('awards')).toBe('resources');
		expect(parseDocumentsTab(null)).toBe('resources');
	});
});

describe('readDocumentsView', () => {
	it('reads the committee, filter and review form on the papers tab', () => {
		const params = new URLSearchParams('tab=papers&committee=unsc&paper=missing&review=paper-1');

		expect(readDocumentsView(params)).toEqual({
			tab: 'papers',
			committeeId: 'unsc',
			paper: 'missing',
			reviewDocumentId: 'paper-1'
		});
	});

	it('drops them on the other tabs, which have no committee to choose', () => {
		const params = new URLSearchParams('tab=guides&committee=unsc&review=paper-1');

		expect(readDocumentsView(params)).toEqual({
			tab: 'guides',
			committeeId: null,
			paper: null,
			reviewDocumentId: null
		});
	});
});

describe('countPaperStatuses and uploadedPaperCount', () => {
	it('counts each status, starting every one at zero', () => {
		expect(countPaperStatuses(['missing', 'approved', 'approved'])).toEqual({
			missing: 1,
			submitted: 0,
			approved: 2,
			changes_requested: 0
		});
	});

	it('counts as uploaded every filled seat that is not missing', () => {
		expect(uploadedPaperCount(makeCommitteeRow(15, 3))).toBe(12);
	});
});

describe('filterPaperSeats', () => {
	const seats = [makeSeat('a', 'missing'), makeSeat('b', 'approved'), makeSeat('c', 'missing')];

	it('keeps the seats with the chosen status', () => {
		expect(filterPaperSeats(seats, 'missing').map((seat) => seat.seatId)).toEqual(['a', 'c']);
	});

	it('keeps every seat for no filter or an unknown one', () => {
		expect(filterPaperSeats(seats, null)).toHaveLength(3);
		expect(filterPaperSeats(seats, 'lost')).toHaveLength(3);
	});
});

describe('paperStatusTone', () => {
	it('is grey for a missing paper and the review colour otherwise', () => {
		expect(paperStatusTone('missing')).toBe('neutral');
		expect(paperStatusTone('approved')).toBe('success');
		expect(paperStatusTone('changes_requested')).toBe('danger');
	});
});

describe('validateResourceForm', () => {
	it('accepts a titled file with a known audience', () => {
		const errors = validateResourceForm({ title: 'Map', audience: 'everyone' }, pdf(), true);

		expect(errors).toEqual({});
		expect(hasResourceFormErrors(errors)).toBe(false);
	});

	it('asks for a title, a file and an audience', () => {
		const errors = validateResourceForm({ title: '', audience: '' }, null, false);

		expect(errors).toEqual({
			title: 'Please give the file a title.',
			file: 'Choose a file to upload.',
			audience: 'Please say who the file is for.'
		});
		expect(hasResourceFormErrors(errors)).toBe(true);
	});

	it('refuses a title over 120 characters', () => {
		const errors = validateResourceForm({ title: 'x'.repeat(121), audience: 'staff' }, pdf(), true);

		expect(errors.title).toBe('Please keep the title under 120 characters.');
	});

	it('refuses a file over 20 MB and a file of the wrong type', () => {
		const values = { title: 'Map', audience: 'staff' };

		expect(validateResourceForm(values, pdf(21 * 1024 * 1024), true).file).toBe(
			'The file is larger than 20 MB.'
		);
		expect(validateResourceForm(values, { type: 'application/zip', size: 10 }, true).file).toBe(
			'Resources can be a PDF, an image or a Word document.'
		);
	});
});

describe('reviewCommentProblem', () => {
	it('refuses an empty comment with the stated message', () => {
		expect(reviewCommentProblem('')).toBe('Tell the delegate what to change.');
	});

	it('refuses a comment over 1000 characters and accepts one within', () => {
		expect(reviewCommentProblem('x'.repeat(1001))).toBe(
			'Please keep the comment under 1000 characters.'
		);
		expect(reviewCommentProblem('Cite your sources.')).toBeNull();
	});
});

describe('approvedMessage', () => {
	it('says "Approved." for one paper and counts several', () => {
		expect(approvedMessage(1)).toBe('Approved.');
		expect(approvedMessage(5)).toBe('5 papers approved.');
	});
});

describe('documentsTabs and totalPaperCounts', () => {
	it('counts beside the three labels and marks the open tab', () => {
		const totals = totalPaperCounts([makeCommitteeRow(15, 3), makeCommitteeRow(5, 5)]);
		const tabs = documentsTabs('thimun-2027', 'guides', {
			resourceCount: 4,
			guideCount: 6,
			committeeCount: 8,
			...totals
		});

		expect(tabs.map((tab) => tab.label)).toEqual([
			'Shared files',
			'Background guides',
			'Position papers'
		]);
		expect(tabs.map((tab) => tab.count)).toEqual([4, '6 of 8', '12 of 20']);
		expect(tabs.map((tab) => tab.isActive)).toEqual([false, true, false]);
		expect(tabs[2].href).toBe('/manage/thimun-2027/documents?tab=papers');
	});
});

describe('resourceAddedText', () => {
	const resource = { uploaderName: 'Eleanor Whitfield', createdAt: '2026-10-01T09:00:00Z' };

	it('names the uploader and the day', () => {
		expect(resourceAddedText(resource, 'Europe/Amsterdam')).toBe('Eleanor Whitfield · 1 Oct');
	});

	it('gives only the day when the uploader cannot be read', () => {
		const anonymous = { ...resource, uploaderName: null };

		expect(resourceAddedText(anonymous, 'Europe/Amsterdam')).toBe('1 Oct');
	});

	it('reads the day in the conference timezone', () => {
		const lateEvening = { ...resource, createdAt: '2026-09-30T23:30:00Z' };

		expect(resourceAddedText(lateEvening, 'Europe/Amsterdam')).toBe('Eleanor Whitfield · 1 Oct');
	});
});
