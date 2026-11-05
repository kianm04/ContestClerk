import { describe, expect, it } from 'vitest';
import {
	describeQuestionFailure,
	expectQuestionChange,
	type QuestionPress
} from './question-presses';

/** A press of `action` naming `questionId`, the way `QuestionRow`'s form sends it. */
function pressInput(action: string, questionId: string) {
	const formData = new FormData();
	if (questionId !== '') formData.set('questionId', questionId);

	return {
		action: new URL(`http://localhost/manage/riverside-mun-2027/application-form${action}`),
		formData
	};
}

/** A press still on its way, with the change `expectQuestionChange` gave it. */
function pressOf(action: string, questionId: string): QuestionPress {
	const input = pressInput(action, questionId);

	return { id: 1, ...input, expected: expectQuestionChange(input) };
}

describe('expectQuestionChange', () => {
	it('takes a deleted question off the list', () => {
		expect(expectQuestionChange(pressInput('?/deleteQuestion', 'q1'))).toEqual([
			{ id: 'q1', isDeleted: true }
		]);
	});

	it('answers null for a press that names no question, or one it does not predict', () => {
		expect(expectQuestionChange(pressInput('?/deleteQuestion', ''))).toBeNull();
		expect(expectQuestionChange(pressInput('?/moveQuestion', 'q1'))).toBeNull();
	});
});

describe('describeQuestionFailure', () => {
	it('names what did not happen', () => {
		expect(describeQuestionFailure(pressOf('?/deleteQuestion', 'q1'))).toBe(
			'The question was not deleted.'
		);
	});
});
