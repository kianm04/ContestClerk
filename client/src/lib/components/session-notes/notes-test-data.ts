/**
 * The notes the session notes component tests draw, written once so every
 * test file tells the same story.
 */
import type { SessionNotes } from '$lib/session-notes';

/** Notes Sara saved, with a heading and a bold word, and the HTML the server made of them. */
export const SARAS_NOTES: SessionNotes = {
	body: '### Opening\n\nGhana **yields**',
	bodyHtml: '<h3>Opening</h3>\n<p>Ghana <strong>yields</strong></p>\n',
	revision: 4,
	updatedById: 'sara-id',
	updatedByName: 'Sara Mensah',
	updatedAt: '2026-09-26T10:00:00Z'
};
