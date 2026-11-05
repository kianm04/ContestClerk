/**
 * The words the interface uses for every database enum value, and the colour
 * each one is shown in.
 *
 * Postgres stores short codes such as `waitlisted` or `changes_requested`.
 * People should never see those. Every page asks this file instead, so the same
 * status is worded the same way everywhere and a change of wording is a change
 * in one place. The words come from `specs/03-design/writing-style.md`.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

import type { Database } from '$lib/database.types';

/** The five colours a `Badge` can be. See `specs/03-design/components.md`. */
export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Every enum in the database, as `{ application_status: 'draft' | 'submitted' | ... }`.
 *
 * `database.types.ts` is generated from the real schema by `pnpm db:types`, so
 * this follows the database automatically. That is the point: the table below
 * has to name every enum and every one of its values, and if a migration adds a
 * value and nobody writes a word for it, `pnpm check` fails rather than the page
 * showing `changes_requested` to a delegate.
 */
type StatusEnums = Database['public']['Enums'];

/** The name of one enum, such as `application_status`. */
export type StatusEnumName = keyof StatusEnums;

/** How one value is shown: the words, and the colour behind them. */
type StatusWord = {
	label: string;
	tone: BadgeTone;
};

/**
 * The words, grouped by the enum they belong to.
 *
 * They are grouped rather than being one long list because the same value means
 * different things in different enums: an application that is `submitted` is
 * "Under review", but a position paper that is `submitted` is "Awaiting review",
 * and a conference that is `draft` says so more loudly than an application does.
 */
const STATUS_WORDS: { [Name in StatusEnumName]: Record<StatusEnums[Name], StatusWord> } = {
	// What an amendment does to the clause it points at.
	amendment_action: {
		add: { label: 'Add a clause', tone: 'neutral' },
		change: { label: 'Change a clause', tone: 'neutral' },
		strike: { label: 'Strike a clause', tone: 'neutral' }
	},

	// The first four are still waiting for somebody; the rest are how it ended
	// (`docs/committee-papers.md`, section 3, rule 9).
	amendment_status: {
		awaiting_sponsors: { label: 'Awaiting the sponsors', tone: 'warning' },
		collecting_support: { label: 'Collecting support', tone: 'warning' },
		with_the_dais: { label: 'With the dais', tone: 'warning' },
		approved: { label: 'Approved', tone: 'success' },
		written_in: { label: 'Written in', tone: 'success' },
		passed: { label: 'Passed', tone: 'success' },
		failed: { label: 'Failed', tone: 'danger' },
		out_of_order: { label: 'Out of order', tone: 'danger' },
		withdrawn: { label: 'Withdrawn', tone: 'neutral' },
		lapsed: { label: 'Lapsed', tone: 'neutral' }
	},

	application_close_rule: {
		relative: { label: 'Before the conference', tone: 'neutral' },
		fixed: { label: 'On a chosen date', tone: 'neutral' }
	},

	application_open_mode: {
		manual: { label: 'Opened by hand', tone: 'neutral' },
		on_publish: { label: 'When published', tone: 'neutral' },
		scheduled: { label: 'On a chosen date', tone: 'neutral' }
	},

	application_status: {
		draft: { label: 'Draft', tone: 'neutral' },
		submitted: { label: 'Under review', tone: 'warning' },
		accepted: { label: 'Accepted', tone: 'success' },
		rejected: { label: 'Not accepted', tone: 'danger' },
		waitlisted: { label: 'Waitlisted', tone: 'warning' },
		withdrawn: { label: 'Withdrawn', tone: 'neutral' }
	},

	attendance_status: {
		absent: { label: 'Absent', tone: 'neutral' },
		present: { label: 'Present', tone: 'success' },
		present_and_voting: { label: 'Present and voting', tone: 'success' }
	},

	audience: {
		everyone: { label: 'Everyone', tone: 'neutral' },
		delegates: { label: 'Delegates', tone: 'neutral' },
		staff: { label: 'Staff', tone: 'neutral' },
		committee: { label: 'One committee', tone: 'neutral' },
		delegation: { label: 'One delegation', tone: 'neutral' }
	},

	award_kind: {
		best_delegate: { label: 'Best delegate', tone: 'brand' },
		outstanding_delegate: { label: 'Outstanding delegate', tone: 'brand' },
		honourable_mention: { label: 'Honourable mention', tone: 'brand' },
		verbal_commendation: { label: 'Verbal commendation', tone: 'brand' },
		best_position_paper: { label: 'Best position paper', tone: 'brand' },
		custom: { label: 'Special award', tone: 'brand' }
	},

	award_status: {
		proposed: { label: 'Proposed', tone: 'warning' },
		confirmed: { label: 'Confirmed', tone: 'success' }
	},

	committee_format: {
		standard: { label: 'Standard', tone: 'neutral' },
		crisis: { label: 'Crisis', tone: 'neutral' }
	},

	committee_mode: {
		idle: { label: 'Not in session', tone: 'neutral' },
		formal_debate: { label: 'Formal debate', tone: 'brand' },
		moderated_caucus: { label: 'Moderated caucus', tone: 'brand' },
		unmoderated_caucus: { label: 'Unmoderated caucus', tone: 'brand' },
		voting: { label: 'Voting', tone: 'warning' },
		suspended: { label: 'Suspended', tone: 'neutral' },
		single_speaker: { label: 'Single speaker', tone: 'brand' }
	},

	conference_kind: {
		conference: { label: 'Conference', tone: 'neutral' },
		quick_session: { label: 'Quick session', tone: 'neutral' }
	},

	conference_level: {
		high_school: { label: 'High school', tone: 'neutral' },
		university: { label: 'University', tone: 'neutral' },
		mixed: { label: 'High school and university', tone: 'neutral' }
	},

	conference_status: {
		draft: { label: 'Draft', tone: 'neutral' },
		published: { label: 'Published', tone: 'success' },
		archived: { label: 'Archived', tone: 'neutral' }
	},

	creation_step: {
		basics: { label: 'Basics', tone: 'neutral' },
		when: { label: 'When', tone: 'neutral' },
		setup: { label: 'Setup', tone: 'neutral' },
		launch: { label: 'Launch', tone: 'neutral' }
	},

	delegation_role: {
		head: { label: 'Delegation head', tone: 'brand' },
		member: { label: 'Member', tone: 'neutral' }
	},

	delegation_status: {
		draft: { label: 'Draft', tone: 'neutral' },
		submitted: { label: 'Under review', tone: 'warning' },
		accepted: { label: 'Accepted', tone: 'success' },
		rejected: { label: 'Not accepted', tone: 'danger' },
		withdrawn: { label: 'Withdrawn', tone: 'neutral' }
	},

	document_kind: {
		position_paper: { label: 'Position paper', tone: 'neutral' },
		background_guide: { label: 'Background guide', tone: 'neutral' },
		resource: { label: 'Resource', tone: 'neutral' },
		working_paper: { label: 'Working paper', tone: 'neutral' },
		draft_resolution: { label: 'Draft resolution', tone: 'neutral' }
	},

	experience_level: {
		none: { label: 'No experience yet', tone: 'neutral' },
		beginner: { label: 'Beginner', tone: 'neutral' },
		intermediate: { label: 'Intermediate', tone: 'neutral' },
		advanced: { label: 'Advanced', tone: 'neutral' }
	},

	fee_status: {
		free: { label: 'Free', tone: 'neutral' },
		paid: { label: 'Paid', tone: 'neutral' },
		undecided: { label: 'Not decided', tone: 'neutral' }
	},

	fee_applies_to: {
		individual: { label: 'Individual delegates', tone: 'neutral' },
		delegation_member: { label: 'Delegation members', tone: 'neutral' }
	},

	invite_kind: {
		organization_member: { label: 'Organisation', tone: 'neutral' },
		conference_staff: { label: 'Conference team', tone: 'neutral' }
	},

	invoice_status: {
		unpaid: { label: 'Unpaid', tone: 'warning' },
		paid: { label: 'Paid', tone: 'success' },
		waived: { label: 'Waived', tone: 'neutral' },
		refunded: { label: 'Refunded', tone: 'neutral' },
		void: { label: 'Cancelled', tone: 'neutral' }
	},

	known_or_tba: {
		known: { label: 'Known', tone: 'neutral' },
		tba: { label: 'To be announced', tone: 'neutral' }
	},

	location_mode: {
		in_person: { label: 'In person', tone: 'neutral' },
		online: { label: 'Online', tone: 'neutral' },
		hybrid: { label: 'Hybrid', tone: 'neutral' }
	},

	majority_type: {
		simple: { label: 'Simple majority', tone: 'neutral' },
		two_thirds: { label: 'Two-thirds majority', tone: 'neutral' }
	},

	motion_kind: {
		moderated_caucus: { label: 'Moderated caucus', tone: 'neutral' },
		unmoderated_caucus: { label: 'Unmoderated caucus', tone: 'neutral' },
		extend_caucus: { label: 'Extend the caucus', tone: 'neutral' },
		suspend_meeting: { label: 'Suspend the meeting', tone: 'neutral' },
		adjourn_meeting: { label: 'Adjourn the meeting', tone: 'neutral' },
		close_debate: { label: 'Close debate', tone: 'neutral' },
		introduce_document: { label: 'Introduce a document', tone: 'neutral' },
		other: { label: 'Other motion', tone: 'neutral' }
	},

	motion_status: {
		proposed: { label: 'Proposed', tone: 'warning' },
		passed: { label: 'Passed', tone: 'success' },
		failed: { label: 'Failed', tone: 'danger' },
		withdrawn: { label: 'Withdrawn', tone: 'neutral' },
		dropped: { label: 'Dropped', tone: 'neutral' }
	},

	notification_kind: {
		application_decided: { label: 'Application decided', tone: 'neutral' },
		seat_allocated: { label: 'Seat allocated', tone: 'neutral' },
		delegation_decided: { label: 'Delegation decided', tone: 'neutral' },
		delegation_seat_assigned: { label: 'Seat assigned', tone: 'neutral' },
		invoice_created: { label: 'New invoice', tone: 'neutral' },
		invoice_paid: { label: 'Invoice paid', tone: 'neutral' },
		announcement: { label: 'Announcement', tone: 'neutral' },
		document_reviewed: { label: 'Paper reviewed', tone: 'neutral' },
		award_published: { label: 'Award published', tone: 'neutral' },
		invite_received: { label: 'Invitation', tone: 'neutral' },
		schedule_changed: { label: 'Schedule changed', tone: 'neutral' },
		paper_author_added: { label: 'Added as an author', tone: 'neutral' },
		paper_returned: { label: 'Paper returned', tone: 'neutral' },
		paper_approved: { label: 'Paper approved', tone: 'neutral' },
		paper_introduced: { label: 'Paper introduced', tone: 'neutral' },
		paper_comment_reply: { label: 'Reply to a comment', tone: 'neutral' },
		paper_comment_thread: { label: 'New comment', tone: 'neutral' },
		amendment_awaits_answer: { label: 'Amendment to answer', tone: 'neutral' },
		amendment_decided: { label: 'Amendment decided', tone: 'neutral' },
		directive_answered: { label: 'Directive answered', tone: 'neutral' }
	},

	organization_role: {
		owner: { label: 'Owner', tone: 'brand' },
		admin: { label: 'Admin', tone: 'neutral' },
		member: { label: 'Member', tone: 'neutral' }
	},

	// The kinds of paper a committee writes (`docs/committee-papers.md`,
	// section 4).
	paper_kind: {
		working_paper: { label: 'Working paper', tone: 'neutral' },
		draft_resolution: { label: 'Draft resolution', tone: 'neutral' },
		committee_directive: { label: 'Committee directive', tone: 'neutral' },
		joint_directive: { label: 'Joint directive', tone: 'neutral' },
		personal_directive: { label: 'Personal directive', tone: 'neutral' },
		press_release: { label: 'Press release', tone: 'neutral' }
	},

	// The people on a paper. A committee may call them by THIMUN's words
	// instead (`paper_words`); the screens choose the words, not this table.
	paper_seat_role: {
		author: { label: 'Author', tone: 'neutral' },
		signatory: { label: 'Signatory', tone: 'neutral' }
	},

	// Introduced is on the floor, which is live, so it has the signal colour.
	paper_status: {
		writing: { label: 'Being written', tone: 'neutral' },
		submitted: { label: 'Submitted', tone: 'warning' },
		approved: { label: 'Approved', tone: 'success' },
		introduced: { label: 'Introduced', tone: 'brand' },
		passed: { label: 'Passed', tone: 'success' },
		failed: { label: 'Failed', tone: 'danger' },
		withdrawn: { label: 'Withdrawn', tone: 'neutral' },
		carried_out: { label: 'Carried out', tone: 'success' },
		refused: { label: 'Refused', tone: 'danger' },
		published: { label: 'Published', tone: 'success' }
	},

	paper_words: {
		sponsors_and_signatories: { label: 'Sponsors and signatories', tone: 'neutral' },
		submitters: { label: 'Main submitter and co-submitters', tone: 'neutral' }
	},

	// The switches a conference role can hold, worded as the catalogue in
	// `docs/roles-and-permissions.md` words them. None is a state, so none has
	// a colour of its own.
	permission: {
		administrator: { label: 'Administrator', tone: 'neutral' },
		edit_conference: { label: 'Edit the conference', tone: 'neutral' },
		manage_team: { label: 'Manage the team', tone: 'neutral' },
		manage_roles: { label: 'Manage roles', tone: 'neutral' },
		manage_committees: { label: 'Edit committees', tone: 'neutral' },
		run_room: { label: 'Run the committee room', tone: 'neutral' },
		review_papers: { label: 'Review position papers', tone: 'neutral' },
		write_chair_notes: { label: 'Keep chair notes', tone: 'neutral' },
		propose_awards: { label: 'Propose awards', tone: 'neutral' },
		confirm_awards: { label: 'Confirm awards', tone: 'neutral' },
		answer_directives: { label: 'Answer directives', tone: 'neutral' },
		read_applications: { label: 'Read applications', tone: 'neutral' },
		decide_applications: { label: 'Decide applications', tone: 'neutral' },
		read_participants: { label: 'See the participants', tone: 'neutral' },
		read_contact_details: { label: 'See contact details', tone: 'neutral' },
		read_welfare_details: { label: 'See welfare details', tone: 'neutral' },
		read_invoices: { label: 'See invoices', tone: 'neutral' },
		manage_invoices: { label: 'Manage invoices', tone: 'neutral' },
		edit_schedule: { label: 'Edit the programme', tone: 'neutral' },
		send_announcements: { label: 'Send announcements', tone: 'neutral' },
		manage_documents: { label: 'Manage documents', tone: 'neutral' }
	},

	question_type: {
		short_text: { label: 'Short answer', tone: 'neutral' },
		long_text: { label: 'Long answer', tone: 'neutral' },
		single_choice: { label: 'Pick one', tone: 'neutral' },
		multiple_choice: { label: 'Pick several', tone: 'neutral' },
		checkbox: { label: 'Tick box', tone: 'neutral' }
	},

	review_status: {
		submitted: { label: 'Awaiting review', tone: 'warning' },
		approved: { label: 'Approved', tone: 'success' },
		changes_requested: { label: 'Changes requested', tone: 'danger' }
	},

	// Where a conference role's permissions apply.
	role_scope: {
		conference: { label: 'Whole conference', tone: 'neutral' },
		committees: { label: 'Assigned committees', tone: 'neutral' }
	},

	seat_kind: {
		country: { label: 'Country', tone: 'neutral' },
		character: { label: 'Character', tone: 'neutral' },
		observer: { label: 'Observer', tone: 'neutral' },
		other: { label: 'Other', tone: 'neutral' }
	},

	session_status: {
		scheduled: { label: 'Scheduled', tone: 'neutral' },
		in_progress: { label: 'In progress', tone: 'success' },
		ended: { label: 'Ended', tone: 'neutral' }
	},

	speaker_status: {
		waiting: { label: 'Waiting', tone: 'neutral' },
		speaking: { label: 'Speaking', tone: 'success' },
		spoken: { label: 'Spoken', tone: 'neutral' },
		removed: { label: 'Removed', tone: 'neutral' }
	},

	speakers_list_kind: {
		general: { label: "General Speakers' List", tone: 'neutral' },
		caucus: { label: 'Moderated caucus', tone: 'neutral' },
		single: { label: 'Single speaker', tone: 'neutral' }
	},

	// How a committee counts the support a paper or an amendment needs.
	support_unit: {
		seats: { label: 'Seats', tone: 'neutral' },
		percent: { label: 'Per cent of the seats', tone: 'neutral' }
	},

	vote_choice: {
		for: { label: 'For', tone: 'success' },
		against: { label: 'Against', tone: 'danger' },
		abstain: { label: 'Abstain', tone: 'neutral' }
	},

	vote_kind: {
		procedural: { label: 'Procedural', tone: 'neutral' },
		substantive: { label: 'Substantive', tone: 'neutral' }
	},

	vote_method: {
		show_of_hands: { label: 'Show of hands', tone: 'neutral' },
		roll_call: { label: 'Roll call', tone: 'neutral' }
	},

	vote_status: {
		open: { label: 'Open', tone: 'warning' },
		closed: { label: 'Closed', tone: 'neutral' }
	}
};

/** Look one value up. Both exported helpers below need the same two steps. */
function statusWord<Name extends StatusEnumName>(
	enumName: Name,
	value: StatusEnums[Name]
): StatusWord {
	// The enum name picks the group; the value picks the row inside it. The
	// second step is written as a plain `Record<string, ...>` because the
	// compiler cannot follow an index into a type that depends on `Name`.
	const wordsForEnum: Record<string, StatusWord> = STATUS_WORDS[enumName];

	return wordsForEnum[value];
}

/**
 * The words to show for one enum value, such as
 * `statusLabel('application_status', 'waitlisted')` giving "Waitlisted".
 *
 * The enum name comes first because the same value appears in several enums and
 * does not always mean the same thing.
 */
export function statusLabel<Name extends StatusEnumName>(
	enumName: Name,
	value: StatusEnums[Name]
): string {
	return statusWord(enumName, value).label;
}

/** The colour a `Badge` shows that value in. Takes the enum name for the same reason. */
export function statusBadgeTone<Name extends StatusEnumName>(
	enumName: Name,
	value: StatusEnums[Name]
): BadgeTone {
	return statusWord(enumName, value).tone;
}
