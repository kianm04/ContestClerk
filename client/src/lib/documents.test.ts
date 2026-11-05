import { describe, expect, it } from 'vitest';
import {
	backgroundGuidePath,
	canRemovePositionPaper,
	canUploadPositionPaper,
	DOCUMENT_MAX_SIZE_MB,
	documentAudienceLabel,
	formatFileSize,
	GUIDE_AUDIENCE_OPTIONS,
	isAllowedFile,
	isDocumentAudience,
	isGuideAudience,
	isPaperStatus,
	isPastPaperDeadline,
	isReviewStatus,
	paperStatus,
	paperStatusLabel,
	PDF_ACCEPTED_TYPES,
	pdfFileProblem,
	positionPaperPath,
	resourcePath
} from './documents';

// This file covers everything `$lib/documents.ts` exports: the checks a chosen
// file has to pass, the audiences a guide and a resource may have, the paths
// files are stored under, the size shown beside a name, and the position paper
// rules.

/** The bucket's limit in bytes, so a test can describe a file exactly at it or one byte over. */
const DOCUMENT_MAX_SIZE_BYTES = DOCUMENT_MAX_SIZE_MB * 1024 * 1024;

describe('pdfFileProblem', () => {
	it('accepts an ordinary PDF', () => {
		expect(pdfFileProblem({ type: 'application/pdf', size: 200_000 })).toBeNull();
	});

	it('refuses a file that is not a PDF', () => {
		expect(pdfFileProblem({ type: 'image/png', size: 200_000 })).toBe('Please upload a PDF.');
	});

	it('takes a file of exactly twenty megabytes', () => {
		expect(pdfFileProblem({ type: 'application/pdf', size: DOCUMENT_MAX_SIZE_BYTES })).toBeNull();
	});

	it('refuses a file one byte over the limit', () => {
		expect(pdfFileProblem({ type: 'application/pdf', size: DOCUMENT_MAX_SIZE_BYTES + 1 })).toBe(
			'The file must be under 20 MB.'
		);
	});

	// The type is looked at first, so somebody who chose the wrong kind of file
	// is told that rather than being sent away to make it smaller.
	it('tells a thirty megabyte Word document it is the wrong kind of file, not too big a one', () => {
		expect(pdfFileProblem({ type: 'application/msword', size: 30 * 1024 * 1024 })).toBe(
			'Please upload a PDF.'
		);
	});

	it('offers PDFs and nothing else to the file picker', () => {
		expect(PDF_ACCEPTED_TYPES).toBe('application/pdf');
	});
});

describe('isGuideAudience', () => {
	it('accepts the two words the panel can send', () => {
		expect(isGuideAudience('everyone')).toBe(true);
		expect(isGuideAudience('delegates')).toBe(true);
	});

	// Anybody can post anything to a form action, so a word the panel never
	// offers has to be refused rather than saved.
	it('refuses a word the panel never offers', () => {
		expect(isGuideAudience('chairs')).toBe(false);
	});
});

describe('GUIDE_AUDIENCE_OPTIONS', () => {
	it('offers everyone first and delegates only second', () => {
		const values = GUIDE_AUDIENCE_OPTIONS.map((option) => option.value);

		expect(values).toEqual(['everyone', 'delegates']);
	});

	it('gives every choice a label and a sentence saying who can download the guide', () => {
		for (const option of GUIDE_AUDIENCE_OPTIONS) {
			expect(option.label).not.toBe('');
			expect(option.description).not.toBe('');
		}
	});
});

/**
 * The path `02-architecture/storage.md` lays down, for the ids the test below
 * uses: the conference's folder, then `background-guides`, then the committee's
 * id, a dash, a uuid and `.pdf`.
 */
const BACKGROUND_GUIDE_PATH =
	/^conference-1\/background-guides\/committee-1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

describe('backgroundGuidePath', () => {
	it('puts the guide in the conference folder, under the committee it belongs to', () => {
		expect(backgroundGuidePath('conference-1', 'committee-1')).toMatch(BACKGROUND_GUIDE_PATH);
	});

	// The uuid is why replacing a guide never serves the old one from a cache:
	// the new file is at an address no browser has seen before.
	it('answers a different path every time, because of the uuid in the name', () => {
		const first = backgroundGuidePath('conference-1', 'committee-1');
		const second = backgroundGuidePath('conference-1', 'committee-1');

		expect(first).not.toBe(second);
	});
});

describe('formatFileSize', () => {
	it('counts a small file in bytes', () => {
		expect(formatFileSize(0)).toBe('0 bytes');
		expect(formatFileSize(1023)).toBe('1023 bytes');
	});

	it('switches to kilobytes at exactly one kilobyte', () => {
		expect(formatFileSize(1024)).toBe('1 KB');
	});

	it('gives kilobytes as whole numbers', () => {
		expect(formatFileSize(812 * 1024)).toBe('812 KB');
		expect(formatFileSize(1536)).toBe('2 KB');
	});

	it('switches to megabytes at exactly one megabyte, with one decimal place', () => {
		expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
		expect(formatFileSize(1_258_291)).toBe('1.2 MB');
	});

	it('describes the largest file the bucket takes', () => {
		expect(formatFileSize(DOCUMENT_MAX_SIZE_BYTES)).toBe('20.0 MB');
	});
});

describe('isDocumentAudience and documentAudienceLabel', () => {
	it('accepts the three audiences a resource can have and nothing else', () => {
		expect(isDocumentAudience('everyone')).toBe(true);
		expect(isDocumentAudience('delegates')).toBe(true);
		expect(isDocumentAudience('staff')).toBe(true);
		expect(isDocumentAudience('committee')).toBe(false);
		expect(isDocumentAudience('')).toBe(false);
	});

	it('names each audience, and reads anything else as the delegates', () => {
		expect(documentAudienceLabel('everyone')).toBe('Everyone');
		expect(documentAudienceLabel('staff')).toBe('Staff');
		expect(documentAudienceLabel('committee')).toBe('Delegates');
	});
});

describe('isAllowedFile', () => {
	const MEGABYTE = 1024 * 1024;

	it('asks for a file when the box was left empty', () => {
		expect(isAllowedFile({ type: 'application/octet-stream', size: 0 }, 'position_paper')).toBe(
			'Please choose a file.'
		);
		expect(isAllowedFile({ type: '', size: 0 }, 'resource')).toBe('Choose a file to upload.');
	});

	it('takes only a PDF as a position paper or a background guide', () => {
		const wordDocument = {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			size: MEGABYTE
		};

		expect(isAllowedFile(wordDocument, 'position_paper')).toBe('Please upload a PDF.');
		expect(isAllowedFile(wordDocument, 'background_guide')).toBe(
			'Background guides must be a PDF.'
		);
		expect(isAllowedFile({ type: 'application/pdf', size: MEGABYTE }, 'position_paper')).toBeNull();
	});

	it('takes a PDF, a picture or a Word document as a resource', () => {
		expect(isAllowedFile({ type: 'image/png', size: MEGABYTE }, 'resource')).toBeNull();
		expect(
			isAllowedFile(
				{
					type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
					size: MEGABYTE
				},
				'resource'
			)
		).toBeNull();
		expect(isAllowedFile({ type: 'text/csv', size: MEGABYTE }, 'resource')).toBe(
			'Resources can be a PDF, an image or a Word document.'
		);
	});

	it('refuses a file over 20 MB and accepts one of exactly 20 MB', () => {
		expect(isAllowedFile({ type: 'application/pdf', size: 20 * MEGABYTE + 1 }, 'resource')).toBe(
			'The file is larger than 20 MB.'
		);
		expect(
			isAllowedFile({ type: 'application/pdf', size: 20 * MEGABYTE + 1 }, 'position_paper')
		).toBe('The file must be smaller than 20 MB.');
		expect(isAllowedFile({ type: 'application/pdf', size: 20 * MEGABYTE }, 'resource')).toBeNull();
	});

	it('names the wrong type before the size', () => {
		expect(isAllowedFile({ type: 'text/csv', size: 30 * MEGABYTE }, 'resource')).toBe(
			'Resources can be a PDF, an image or a Word document.'
		);
	});
});

describe('resourcePath and positionPaperPath', () => {
	const CONFERENCE_ID = '11111111-1111-4111-8111-111111111111';
	const SEAT_ID = '22222222-2222-4222-8222-222222222222';

	it('files a resource under the conference with the extension of its type', () => {
		expect(resourcePath(CONFERENCE_ID, 'image/jpeg')).toMatch(
			new RegExp(`^${CONFERENCE_ID}/resources/[0-9a-f-]{36}\\.jpg$`)
		);
	});

	it('files a position paper under its seat, with a fresh name each time', () => {
		const first = positionPaperPath(CONFERENCE_ID, SEAT_ID);
		const second = positionPaperPath(CONFERENCE_ID, SEAT_ID);

		expect(first).toMatch(
			new RegExp(`^${CONFERENCE_ID}/position-papers/${SEAT_ID}-[0-9a-f-]{36}\\.pdf$`)
		);
		expect(first).not.toBe(second);
	});
});

describe('paperStatus and paperStatusLabel', () => {
	it('calls a seat with no paper missing', () => {
		expect(paperStatus(null)).toBe('missing');
		expect(paperStatusLabel('missing')).toBe('Missing');
	});

	it('names each review in the words the badges use', () => {
		expect(paperStatusLabel(paperStatus('submitted'))).toBe('Awaiting review');
		expect(paperStatusLabel(paperStatus('approved'))).toBe('Approved');
		expect(paperStatusLabel(paperStatus('changes_requested'))).toBe('Changes requested');
	});

	it('checks a status read from the address', () => {
		expect(isPaperStatus('missing')).toBe(true);
		expect(isPaperStatus('changes_requested')).toBe(true);
		expect(isPaperStatus('rejected')).toBe(false);
		expect(isReviewStatus('missing')).toBe(false);
	});
});

describe('canUploadPositionPaper and canRemovePositionPaper', () => {
	const conference = {
		positionPaperDeadline: '2027-01-20T22:59:00Z',
		timezone: 'Europe/Amsterdam'
	};
	const BEFORE_DEADLINE = new Date('2027-01-10T12:00:00Z');
	const AT_DEADLINE = new Date('2027-01-20T22:59:00Z');
	const AFTER_DEADLINE = new Date('2027-01-21T12:00:00Z');

	it('lets a delegate upload a first paper or replace a waiting one before the deadline', () => {
		expect(canUploadPositionPaper(conference, null, BEFORE_DEADLINE)).toBeNull();
		expect(canUploadPositionPaper(conference, 'submitted', BEFORE_DEADLINE)).toBeNull();
		expect(canUploadPositionPaper(conference, 'submitted', AT_DEADLINE)).toBeNull();
	});

	it('closes the upload after the deadline and names the deadline', () => {
		expect(canUploadPositionPaper(conference, null, AFTER_DEADLINE)).toBe(
			'The deadline was 20 Jan 2027, 23:59. Ask your chair if you still need to upload.'
		);
	});

	it('reopens the upload after the deadline when the chair asked for changes', () => {
		expect(canUploadPositionPaper(conference, 'changes_requested', AFTER_DEADLINE)).toBeNull();
	});

	it('closes the upload once the paper is approved, deadline or not', () => {
		expect(canUploadPositionPaper(conference, 'approved', BEFORE_DEADLINE)).toBe(
			'Your paper was approved. It can no longer be changed.'
		);
	});

	it('never closes the upload when the conference set no deadline', () => {
		const noDeadline = { positionPaperDeadline: null, timezone: 'Europe/Amsterdam' };

		expect(canUploadPositionPaper(noDeadline, null, AFTER_DEADLINE)).toBeNull();
		expect(isPastPaperDeadline(noDeadline, AFTER_DEADLINE)).toBe(false);
	});

	it('lets a delegate remove only a waiting paper, and only before the deadline', () => {
		expect(canRemovePositionPaper(conference, 'submitted', BEFORE_DEADLINE)).toBe(true);
		expect(canRemovePositionPaper(conference, 'submitted', AFTER_DEADLINE)).toBe(false);
		expect(canRemovePositionPaper(conference, 'changes_requested', BEFORE_DEADLINE)).toBe(false);
		expect(canRemovePositionPaper(conference, null, BEFORE_DEADLINE)).toBe(false);
	});
});
