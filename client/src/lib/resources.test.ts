import { describe, expect, it } from 'vitest';
import {
	fileTypeIcon,
	fileTypeLabel,
	groupResourcesByConference,
	resourceConferenceOptions,
	type ResourceListItem
} from './resources';

/** A conference-level resource of "DelftMUN 2027". */
const RULES_OF_PROCEDURE: ResourceListItem = {
	id: 'doc-1',
	title: 'Rules of Procedure',
	fileName: 'rop.pdf',
	fileSizeBytes: 1200,
	mimeType: 'application/pdf',
	kind: 'resource',
	conferenceId: 'conf-a',
	conferenceName: 'DelftMUN 2027',
	conferenceSlug: 'delftmun-2027',
	conferenceLogoPath: 'conf-a/logo.png',
	committeeLabel: null,
	downloadUrl: 'https://signed/rop.pdf'
};

/** A second file of the same conference: a background guide with a committee. */
const UNSC_GUIDE: ResourceListItem = {
	...RULES_OF_PROCEDURE,
	id: 'doc-2',
	title: 'UNSC Background Guide',
	kind: 'background_guide',
	committeeLabel: 'UNSC',
	downloadUrl: 'https://signed/unsc.pdf'
};

/** A file of a second conference, "LSE MUN 2027". */
const TEMPLATE: ResourceListItem = {
	...RULES_OF_PROCEDURE,
	id: 'doc-3',
	title: 'Position Paper Template',
	conferenceId: 'conf-b',
	conferenceName: 'LSE MUN 2027',
	conferenceSlug: 'lse-mun-2027',
	conferenceLogoPath: null,
	downloadUrl: 'https://signed/template.pdf'
};

describe('groupResourcesByConference', () => {
	it('folds every file into one group per conference, keeping the given order', () => {
		const groups = groupResourcesByConference([RULES_OF_PROCEDURE, UNSC_GUIDE, TEMPLATE]);

		expect(groups.map((group) => group.conferenceName)).toEqual(['DelftMUN 2027', 'LSE MUN 2027']);
		expect(groups[0].resources).toEqual([RULES_OF_PROCEDURE, UNSC_GUIDE]);
		expect(groups[1].resources).toEqual([TEMPLATE]);
	});

	it('carries the conference logo onto its group', () => {
		const groups = groupResourcesByConference([RULES_OF_PROCEDURE]);

		expect(groups[0].conferenceLogoPath).toBe('conf-a/logo.png');
	});

	it('answers with nothing for an empty list', () => {
		expect(groupResourcesByConference([])).toEqual([]);
	});
});

describe('resourceConferenceOptions', () => {
	it('puts "All conferences" first, then one option per group', () => {
		const groups = groupResourcesByConference([RULES_OF_PROCEDURE, TEMPLATE]);

		expect(resourceConferenceOptions(groups)).toEqual([
			{ value: '', label: 'All conferences' },
			{ value: 'delftmun-2027', label: 'DelftMUN 2027' },
			{ value: 'lse-mun-2027', label: 'LSE MUN 2027' }
		]);
	});

	it('is "All conferences" alone when there is nothing to group', () => {
		expect(resourceConferenceOptions([])).toEqual([{ value: '', label: 'All conferences' }]);
	});
});

describe('fileTypeLabel', () => {
	it.each([
		['application/pdf', 'PDF'],
		['image/jpeg', 'JPG'],
		['image/png', 'PNG'],
		['image/webp', 'WEBP'],
		['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX']
	])('reads %s as %s', (mimeType, label) => {
		expect(fileTypeLabel(mimeType)).toBe(label);
	});

	it('falls back to "FILE" for a type it does not know', () => {
		expect(fileTypeLabel('application/zip')).toBe('FILE');
	});
});

describe('fileTypeIcon', () => {
	it('gives a picture icon to every image type', () => {
		expect(fileTypeIcon('image/png')).toBe(fileTypeIcon('image/jpeg'));
		expect(fileTypeIcon('image/png')).not.toBe(fileTypeIcon('application/pdf'));
	});

	it('gives the same page icon to a PDF and a Word document', () => {
		expect(fileTypeIcon('application/pdf')).toBe(
			fileTypeIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
		);
	});

	it('falls back to a plain file icon for a type it does not know', () => {
		expect(fileTypeIcon('application/zip')).not.toBe(fileTypeIcon('application/pdf'));
		expect(fileTypeIcon('application/zip')).not.toBe(fileTypeIcon('image/png'));
	});
});
