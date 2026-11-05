/**
 * The crisis staff's side of a crisis committee (`docs/committee-papers.md`,
 * section 6, "For the crisis staff"): the papers they answer, their answers,
 * and the crisis update they send to the room.
 *
 * Who may do each is the database's to decide: `answer_directive` and
 * `send_crisis_update` refuse anybody without `answer_directives` in the
 * committee, and Row Level Security (`may_read_paper`) shows the crisis staff
 * the directives and press releases sent to them and nothing still being
 * written. The pages only ask these, and say what the database answered.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperKind, PaperStatus } from '$lib/committee-papers';
import {
	isAnsweredByCrisisStaff,
	type CrisisAnswer,
	type CrisisDeskItem,
	type CrisisOutcome,
	type CrisisUpdate
} from '$lib/crisis-papers';
import { requireCommitteePermission, type ChairAccess } from './access';
import { readCommitteeFormat } from './committee-papers';

/** The codes the crisis functions refuse with: not allowed, or not possible now. */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** The kinds the crisis staff's page lists. */
const DESK_KINDS: PaperKind[] = [
	'committee_directive',
	'joint_directive',
	'personal_directive',
	'press_release'
];

/** The statuses the crisis staff's page lists: waiting for them, or answered by them. */
const DESK_STATUSES: PaperStatus[] = ['submitted', 'passed', 'carried_out', 'refused', 'published'];

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type CrisisChange = { refusal: string | null };

/**
 * The signed-in reader, the conference and the committee, for one of the
 * crisis staff's pages: somebody with `answer_directives` in a crisis
 * committee. Anybody else, and any committee that is not a crisis one, gets
 * the same 404 as a committee that does not exist. A form action is its own
 * request, so every action asks this again. `error` works by throwing, so
 * this either returns or never returns at all.
 */
export async function requireCrisisStaff(
	locals: App.Locals,
	url: URL,
	params: { slug: string; committeeSlug: string }
): Promise<ChairAccess> {
	const access = await requireCommitteePermission(
		locals,
		url,
		params.slug,
		params.committeeSlug,
		'answer_directives'
	);
	const format = await readCommitteeFormat(locals.supabase, access.committee.id);

	if (format !== 'crisis') {
		error(404, 'This page does not exist.');
	}

	return access;
}

/**
 * Whether the reader holds `answer_directives` in this committee, which
 * offers the way to the crisis staff's page. A failed question answers
 * `false`: the worst that does is hide a link.
 */
export async function mayAnswerDirectives(
	supabase: SupabaseClient,
	committeeId: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('has_committee_permission', {
		committee_id: committeeId,
		permission: 'answer_directives'
	});

	return error === null && data === true;
}

/** A paper as the crisis staff's list reads it, with the seats on it. */
type DeskRow = {
	id: string;
	kind: PaperKind;
	status: PaperStatus;
	title: string;
	submitted_at: string | null;
	decided_at: string | null;
	lead_seat_id: string | null;
	seats: { seat_id: string; role: string; seat: { name: string } | null }[];
};

/** The characters who wrote the paper, the lead first; signatories are left out. */
function characterNames(row: DeskRow): string[] {
	return row.seats
		.filter((seat) => seat.role === 'author')
		.sort(
			(first, second) =>
				Number(second.seat_id === row.lead_seat_id) - Number(first.seat_id === row.lead_seat_id)
		)
		.map((seat) => seat.seat?.name ?? '')
		.filter((name) => name !== '');
}

/**
 * Every directive and press release of the committee the crisis staff
 * answer or have answered. `crisisDeskSections` in `$lib/crisis-papers.ts`
 * sorts them into the page's two lists.
 */
export async function listCrisisDesk(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CrisisDeskItem[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		// `seats:committee_paper_seats(…)` brings each paper's seats along, and each seat's name with it.
		.select(
			'id, kind, status, title, submitted_at, decided_at, lead_seat_id, seats:committee_paper_seats(seat_id, role, seat:seats(name))'
		)
		.eq('committee_id', committeeId)
		.in('kind', DESK_KINDS)
		.in('status', DESK_STATUSES)
		.overrideTypes<DeskRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the directives: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		kind: row.kind,
		status: row.status,
		title: row.title,
		characters: characterNames(row),
		// A committee directive was submitted to the dais first, and that is the time it keeps.
		sentAt: row.submitted_at,
		answeredAt: isAnsweredByCrisisStaff(row.status) ? row.decided_at : null
	}));
}

/** The columns of a paper that hold the crisis staff's answer. */
type AnswerRow = {
	status: PaperStatus;
	answer_markdown: string | null;
	decided_at: string | null;
};

/** The crisis staff's answer to the paper, or `null` while they have not answered it. */
export async function readCrisisAnswer(
	supabase: SupabaseClient,
	paperId: string
): Promise<CrisisAnswer | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select('status, answer_markdown, decided_at')
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<AnswerRow, { merge: false }>();

	if (error) throw new Error(`Could not read the crisis staff's answer: ${error.message}`);

	if (!data || data.decided_at === null || !isAnsweredByCrisisStaff(data.status)) return null;

	return { outcome: data.status, text: data.answer_markdown, answeredAt: data.decided_at };
}

/** "Carry out", "Publish" or "Refuse", with the answer typed, which may be empty. */
export async function answerDirective(
	supabase: SupabaseClient,
	paperId: string,
	outcome: CrisisOutcome,
	answer: string
): Promise<CrisisChange> {
	const { error } = await supabase.rpc('answer_directive', {
		paper_id: paperId,
		outcome,
		answer
	});

	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`Could not answer the paper: ${error.message}`);
}

/** The columns of `committee_state` that hold the crisis update. */
type UpdateRow = { crisis_update: string | null; crisis_update_at: string | null };

/** The crisis update the room shows now, or `null` when there is none. */
export async function readCrisisUpdate(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CrisisUpdate | null> {
	const { data, error } = await supabase
		.from('committee_state')
		.select('crisis_update, crisis_update_at')
		.eq('committee_id', committeeId)
		.maybeSingle()
		.overrideTypes<UpdateRow, { merge: false }>();

	if (error) throw new Error(`Could not read the crisis update: ${error.message}`);

	if (!data || data.crisis_update === null || data.crisis_update_at === null) return null;

	return { message: data.crisis_update, sentAt: data.crisis_update_at };
}

/**
 * The crisis update for the room's own screens, the live view and the
 * projector: `null` in a committee that is not a crisis one, so one left from
 * before its format changed is never shown.
 */
export async function readRoomCrisisUpdate(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CrisisUpdate | null> {
	const [format, update] = await Promise.all([
		readCommitteeFormat(supabase, committeeId),
		readCrisisUpdate(supabase, committeeId)
	]);

	return format === 'crisis' ? update : null;
}

/** "Send update": the room's screens show it until the next one. An empty one takes it down. */
export async function sendCrisisUpdate(
	supabase: SupabaseClient,
	committeeId: string,
	message: string
): Promise<CrisisChange> {
	const { error } = await supabase.rpc('send_crisis_update', {
		committee_id: committeeId,
		message
	});

	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`Could not send the crisis update: ${error.message}`);
}
