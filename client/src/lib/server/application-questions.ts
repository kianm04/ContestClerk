/**
 * The custom questions one conference adds to its application form: listing
 * them, reading one, adding, saving, reordering and deleting.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read and
 * write: anybody who may see the conference reads its questions, and only
 * somebody who can manage it adds, changes, reorders or deletes one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationQuestion, QuestionType } from '$lib/application-questions';

/** What a question is made of, as the form hands it over. */
export type ApplicationQuestionInput = {
	label: string;
	helpText: string | null;
	type: QuestionType;
	/** The choices for a choice type; an empty list for every other type. */
	options: string[];
	isRequired: boolean;
};

/** The question columns the organiser's page asks for. */
const APPLICATION_QUESTION_COLUMNS = 'id, label, help_text, type, options, is_required, position';

/** One `application_questions` row, under the database's own column names. */
type ApplicationQuestionRow = {
	id: string;
	label: string;
	/** The quiet line under the label, or `null` when the organiser left it empty. */
	help_text: string | null;
	type: QuestionType;
	/** The choices of a choice question. Empty for every other type. */
	options: string[];
	is_required: boolean;
	position: number;
};

/** Turn a database row (snake_case names) into the shape the pages use. */
function toApplicationQuestion(row: ApplicationQuestionRow): ApplicationQuestion {
	return {
		id: row.id,
		label: row.label,
		helpText: row.help_text,
		type: row.type,
		options: row.options,
		isRequired: row.is_required,
		position: row.position
	};
}

/**
 * Every custom question of one conference, in the organiser's own order.
 *
 * This is the list the organiser's page shows with its move arrows, and the
 * same list the apply form asks people to fill in, so both see the questions in
 * one order.
 */
export async function listApplicationQuestions(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ApplicationQuestion[]> {
	const { data, error } = await supabase
		.from('application_questions')
		.select(APPLICATION_QUESTION_COLUMNS)
		.eq('conference_id', conferenceId)
		// `position` is the order the organiser put the questions in. Two questions
		// are allowed to share one, so `id` decides between them and the list comes
		// out the same way round on every refresh, exactly as `listFees` orders fees.
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		// Replaces Supabase's guess at the rows' shape with ours. It has to come last.
		.overrideTypes<ApplicationQuestionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the questions: ${error.message}`);
	}

	const rows: ApplicationQuestionRow[] = data ?? [];

	return rows.map(toApplicationQuestion);
}

/**
 * One question of one conference, or `null` when this conference has no
 * question with that id.
 *
 * The conference is part of the question and not only the question's id, so
 * that a `questionId` typed into somebody's address bar cannot reach a question
 * of another conference. It is the same guard `getFee` in `./fees.ts` puts on a
 * fee id.
 */
export async function getApplicationQuestion(
	supabase: SupabaseClient,
	conferenceId: string,
	questionId: string
): Promise<ApplicationQuestion | null> {
	const { data, error } = await supabase
		.from('application_questions')
		.select(APPLICATION_QUESTION_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('id', questionId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<ApplicationQuestionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load the question: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toApplicationQuestion(data);
}

/**
 * The highest position any question of this conference has, or `null` when the
 * conference has no question at all yet.
 *
 * It is a small query of its own rather than a count of the list the page
 * already read, because the form may be sent from a page somebody left open for
 * an hour: a new question has to land after whatever is in the list now, not
 * after what was in it then.
 */
async function readHighestQuestionPosition(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<number | null> {
	const { data, error } = await supabase
		.from('application_questions')
		.select('position')
		.eq('conference_id', conferenceId)
		// Highest first, and only the first one is asked for.
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle()
		.overrideTypes<{ position: number }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read where the new question goes in the list: ${error.message}`);
	}

	return data?.position ?? null;
}

/**
 * Add a question to a conference's form, at the end of the organiser's list.
 *
 * This is the one place `conference_id` is ever written, which is why
 * `updateApplicationQuestion` below leaves the column alone: a question belongs
 * to the conference it was added to and never moves.
 *
 * A `null` `helpText` and an empty `options` list are written exactly as they
 * arrive. The page has already turned an empty help text into `null` and the
 * options of a question that is not a choice type into an empty list.
 */
export async function createApplicationQuestion(
	supabase: SupabaseClient,
	conferenceId: string,
	question: ApplicationQuestionInput
): Promise<void> {
	const highestPosition = await readHighestQuestionPosition(supabase, conferenceId);
	// The first question of a conference goes at 0, and every one after it one
	// place further down the list.
	const position = highestPosition === null ? 0 : highestPosition + 1;

	const { error } = await supabase.from('application_questions').insert({
		conference_id: conferenceId,
		label: question.label,
		help_text: question.helpText,
		type: question.type,
		options: question.options,
		is_required: question.isRequired,
		position
	});

	if (error) {
		throw new Error(`Could not create the question: ${error.message}`);
	}
}

/**
 * Save every column the question form can change.
 *
 * Two columns of the table are deliberately missing. `conference_id` is not
 * written because a question never moves between conferences. `position` is not
 * written because `moveApplicationQuestion` below owns it, and the arrows on the
 * list are the only thing that changes it.
 *
 * The page refuses a change to `type` or a removal of options once applications
 * exist, because answers already given are stored against this question's id.
 * That rule lives on the page rather than here because it needs a message to
 * show the organiser.
 */
export async function updateApplicationQuestion(
	supabase: SupabaseClient,
	questionId: string,
	question: ApplicationQuestionInput
): Promise<void> {
	const { error } = await supabase
		.from('application_questions')
		.update({
			label: question.label,
			help_text: question.helpText,
			type: question.type,
			options: question.options,
			is_required: question.isRequired
		})
		.eq('id', questionId);

	if (error) {
		throw new Error(`Could not save the question: ${error.message}`);
	}
}

/** One question row while it is being moved: only where it sits in the list matters. */
type QuestionPositionRow = {
	id: string;
	position: number;
};

/**
 * Where this question sits in its conference's list, or `null` when that
 * conference has no question with that id.
 *
 * The conference is part of the question for the same reason it is in
 * `getApplicationQuestion`: an id from somebody else's conference must move
 * nothing.
 */
async function readQuestionPosition(
	supabase: SupabaseClient,
	conferenceId: string,
	questionId: string
): Promise<QuestionPositionRow | null> {
	const { data, error } = await supabase
		.from('application_questions')
		.select('id, position')
		.eq('conference_id', conferenceId)
		.eq('id', questionId)
		.maybeSingle()
		.overrideTypes<QuestionPositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the question's place in the list: ${error.message}`);
	}

	return data ?? null;
}

/**
 * The question just above or just below this one in the same conference, or
 * `null` when this one is already at the end it is being moved towards.
 *
 * Up the list is towards the lower positions, so the neighbour above is the one
 * with the highest position below this one, and the neighbour below is the
 * other way round. Two questions are allowed to share a position, so `id`
 * decides between them here as well, which is the tie-break
 * `listApplicationQuestions` puts the list in order by.
 */
async function readQuestionNeighbour(
	supabase: SupabaseClient,
	conferenceId: string,
	position: number,
	direction: 'up' | 'down'
): Promise<QuestionPositionRow | null> {
	let query = supabase
		.from('application_questions')
		.select('id, position')
		.eq('conference_id', conferenceId);

	if (direction === 'up') {
		query = query
			.lt('position', position)
			.order('position', { ascending: false })
			.order('id', { ascending: false });
	} else {
		query = query
			.gt('position', position)
			.order('position', { ascending: true })
			.order('id', { ascending: true });
	}

	const { data, error } = await query
		.limit(1)
		.maybeSingle()
		.overrideTypes<QuestionPositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not find the question to swap with: ${error.message}`);
	}

	return data ?? null;
}

/** Write one question's place in the organiser's list. */
async function setQuestionPosition(
	supabase: SupabaseClient,
	questionId: string,
	position: number
): Promise<void> {
	const { error } = await supabase
		.from('application_questions')
		.update({ position })
		.eq('id', questionId);

	if (error) {
		throw new Error(`Could not move the question: ${error.message}`);
	}
}

/**
 * Move a question one place up or down the organiser's list.
 *
 * It is a swap: the question and its neighbour trade positions, which is one
 * pair of statements and leaves every other question alone. A question already
 * at the end it is being moved towards has no neighbour, and then nothing
 * happens at all, which is what the arrow at the end of the list does. This is
 * `moveFee` in `./fees.ts` doing the same job on the same shape.
 */
export async function moveApplicationQuestion(
	supabase: SupabaseClient,
	conferenceId: string,
	questionId: string,
	direction: 'up' | 'down'
): Promise<void> {
	const question = await readQuestionPosition(supabase, conferenceId, questionId);

	if (!question) {
		return;
	}

	const neighbour = await readQuestionNeighbour(
		supabase,
		conferenceId,
		question.position,
		direction
	);

	if (!neighbour) {
		return;
	}

	// Neither update needs the other's answer, so both start at once.
	await Promise.all([
		setQuestionPosition(supabase, question.id, neighbour.position),
		setQuestionPosition(supabase, neighbour.id, question.position)
	]);
}

/**
 * Delete a question from the form.
 *
 * Unlike `deleteFee` in `./fees.ts` there is nothing to answer: the
 * `application_questions` delete policy is the plain organiser one with no "in
 * use" condition attached, so nothing hides a question somebody has already
 * answered and a delete this page reaches always goes through.
 *
 * The answers themselves are not touched, and that is the surprising part.
 * They stay in `applications.answers` under this question's old id, and the CSV
 * export ignores an id it does not recognise, which is what
 * `specs/05-pages/organiser/application-form.md` promises the organiser:
 * existing answers are kept but no longer shown.
 */
export async function deleteApplicationQuestion(
	supabase: SupabaseClient,
	questionId: string
): Promise<void> {
	const { error } = await supabase.from('application_questions').delete().eq('id', questionId);

	if (error) {
		throw new Error(`Could not delete the question: ${error.message}`);
	}
}
