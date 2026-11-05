/**
 * What "Delete question" on the application form page changes, worked out in
 * the browser so the question leaves the list the moment the organiser
 * confirms rather than once the server has answered (T142). Mirrors
 * `deleteQuestion` in `routes/manage/[slug]/application-form/+page.server.ts`.
 *
 * Moving a question already shows at once through `$lib/list-move-preview.ts`
 * and `$lib/drag-order.ts`. Adding and editing one keep their in-place
 * spinner, because the server checks the fields.
 */
import type { ApplicationQuestion } from '$lib/application-questions';
import {
	pressedAction,
	pressedField,
	type PressedForm,
	type RowChange,
	type RowPress
} from '$lib/row-changes';

/** A press of a question's "Delete question". */
export type QuestionPress = RowPress<ApplicationQuestion>;

/**
 * What a press will change: the question named by its hidden `questionId` is
 * taken off the list. Null for a press that names no question or posts
 * somewhere else.
 */
export function expectQuestionChange(input: PressedForm): RowChange<ApplicationQuestion>[] | null {
	const questionId = pressedField(input.formData, 'questionId');

	if (questionId === '') return null;
	if (pressedAction(input.action) !== '?/deleteQuestion') return null;

	return [{ id: questionId, isDeleted: true }];
}

/** What did not happen when a press failed, for its toast. */
export function describeQuestionFailure(press: QuestionPress): string {
	if (pressedAction(press.action) === '?/deleteQuestion') return 'The question was not deleted.';

	return 'The question was not changed.';
}
