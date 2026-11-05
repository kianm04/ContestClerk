import { describe, expect, it } from 'vitest';
import {
	breaksExistingAnswers,
	EMPTY_QUESTION_FORM,
	formatOptions,
	hasQuestionErrors,
	isChoiceType,
	isQuestionType,
	MAX_CHOICE_OPTIONS,
	MAX_QUESTIONS,
	MIN_CHOICE_OPTIONS,
	parseOptions,
	QUESTION_HELP_TEXT_MAX_LENGTH,
	QUESTION_LABEL_MAX_LENGTH,
	QUESTION_TYPE_OPTIONS,
	questionSummaryLine,
	questionTypeLabel,
	readQuestionForm,
	toQuestionFormValues,
	validateQuestionForm,
	type ApplicationQuestion,
	type QuestionFormValues
} from './application-questions';

/** A question a conference could really ask, so a test can change one field of it. */
function question(changes: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
	return {
		id: 'question-diet',
		label: 'Do you have any dietary requirements?',
		helpText: null,
		type: 'short_text',
		options: [],
		isRequired: true,
		position: 0,
		...changes
	};
}

/** The T-shirt question, which is the one with choices to pick from. */
function choiceQuestion(changes: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
	return question({
		id: 'question-shirt',
		label: 'T-shirt size',
		type: 'single_choice',
		options: ['S', 'M', 'L'],
		...changes
	});
}

describe('QUESTION_TYPE_OPTIONS', () => {
	it('offers all five kinds of question in the order the database lists them', () => {
		const values = QUESTION_TYPE_OPTIONS.map((option) => option.value);

		expect(values).toEqual([
			'short_text',
			'long_text',
			'single_choice',
			'multiple_choice',
			'checkbox'
		]);
	});

	it('takes its words from the ones the rest of the app shows', () => {
		const labels = QUESTION_TYPE_OPTIONS.map((option) => option.label);

		expect(labels).toEqual(['Short answer', 'Long answer', 'Pick one', 'Pick several', 'Tick box']);
	});
});

describe('MAX_QUESTIONS', () => {
	it('is the twenty questions the page promises', () => {
		expect(MAX_QUESTIONS).toBe(20);
	});
});

describe('MIN_CHOICE_OPTIONS', () => {
	it('is the two choices that make a picking question worth asking', () => {
		expect(MIN_CHOICE_OPTIONS).toBe(2);
	});
});

describe('MAX_CHOICE_OPTIONS', () => {
	it('is the twenty entries the applications_answers_shape check holds a list to', () => {
		expect(MAX_CHOICE_OPTIONS).toBe(20);
	});
});

describe('EMPTY_QUESTION_FORM', () => {
	it('starts a new question on the first kind, which needs no options', () => {
		expect(EMPTY_QUESTION_FORM.type).toBe('short_text');
		expect(EMPTY_QUESTION_FORM.options).toBe('');
	});

	it('starts a new question required, the way the database would have', () => {
		expect(EMPTY_QUESTION_FORM.isRequired).toBe(true);
	});

	it('has no question id, which is how the page knows it is adding rather than editing', () => {
		expect(EMPTY_QUESTION_FORM.questionId).toBe('');
	});
});

describe('isQuestionType', () => {
	it('accepts the five values the database enum has', () => {
		expect(isQuestionType('short_text')).toBe(true);
		expect(isQuestionType('long_text')).toBe(true);
		expect(isQuestionType('single_choice')).toBe(true);
		expect(isQuestionType('multiple_choice')).toBe(true);
		expect(isQuestionType('checkbox')).toBe(true);
	});

	it('refuses anything else, whatever a hand-made request sends', () => {
		expect(isQuestionType('')).toBe(false);
		expect(isQuestionType('dropdown')).toBe(false);
		expect(isQuestionType('Short_text')).toBe(false);
	});
});

describe('isChoiceType', () => {
	it('says the two picking questions have choices', () => {
		expect(isChoiceType('single_choice')).toBe(true);
		expect(isChoiceType('multiple_choice')).toBe(true);
	});

	it('says the other three do not', () => {
		expect(isChoiceType('short_text')).toBe(false);
		expect(isChoiceType('long_text')).toBe(false);
		expect(isChoiceType('checkbox')).toBe(false);
	});
});

describe('parseOptions', () => {
	it('reads one option per line', () => {
		expect(parseOptions('S\nM\nL')).toEqual(['S', 'M', 'L']);
	});

	it('drops the spaces around each option and the blank lines between them', () => {
		expect(parseOptions('  S  \n\n M \n')).toEqual(['S', 'M']);
	});

	it('reads the line endings a textarea really sends', () => {
		// A browser sends a textarea's lines separated by a carriage return and a
		// newline, and trimming each line takes the carriage return off.
		expect(parseOptions('S\r\nM')).toEqual(['S', 'M']);
	});

	it('gives back nothing at all for an empty box', () => {
		expect(parseOptions('')).toEqual([]);
		expect(parseOptions('\n\n')).toEqual([]);
	});

	it('keeps the same option twice, so the checks can see it', () => {
		expect(parseOptions('S\nS')).toEqual(['S', 'S']);
	});
});

describe('formatOptions', () => {
	it('puts the options back one per line', () => {
		expect(formatOptions(['S', 'M', 'L'])).toBe('S\nM\nL');
	});

	it('leaves the box empty for a question with no options', () => {
		expect(formatOptions([])).toBe('');
	});

	it('gives back what it was given when it is read again', () => {
		expect(parseOptions(formatOptions(['S', 'M', 'L']))).toEqual(['S', 'M', 'L']);
	});
});

describe('questionTypeLabel', () => {
	it('gives the words the dropdown uses, so a row and the form agree', () => {
		expect(questionTypeLabel('short_text')).toBe('Short answer');
		expect(questionTypeLabel('multiple_choice')).toBe('Pick several');
	});
});

describe('questionSummaryLine', () => {
	it('names the kind of question and whether it has to be answered', () => {
		expect(questionSummaryLine(question())).toBe('Short answer · Required');
	});

	it('says so plainly when a question may be left blank', () => {
		expect(questionSummaryLine(question({ isRequired: false }))).toBe('Short answer · Optional');
	});

	it('lists the choices of a picking question', () => {
		expect(questionSummaryLine(choiceQuestion({ isRequired: false }))).toBe(
			'Pick one (S, M, L) · Optional'
		);
	});

	it('leaves the brackets out for a picking question with no choices yet', () => {
		expect(questionSummaryLine(choiceQuestion({ options: [] }))).toBe('Pick one · Required');
	});

	it('leaves the brackets out for a kind of question that has no choices', () => {
		// Nothing but a hand-made row would have options on a tick box, and if
		// one did they would mean nothing, so the line stays quiet about them.
		const oddRow = question({ type: 'checkbox', options: ['left over'] });

		expect(questionSummaryLine(oddRow)).toBe('Tick box · Required');
	});
});

describe('readQuestionForm', () => {
	it('reads every field the form asks for', () => {
		const formData = new FormData();
		formData.set('questionId', 'question-shirt');
		formData.set('label', 'T-shirt size');
		formData.set('helpText', 'We order the shirts in advance.');
		formData.set('type', 'single_choice');
		formData.set('options', 'S\nM\nL');
		formData.set('isRequired', 'on');

		expect(readQuestionForm(formData)).toEqual({
			questionId: 'question-shirt',
			label: 'T-shirt size',
			helpText: 'We order the shirts in advance.',
			type: 'single_choice',
			options: 'S\nM\nL',
			isRequired: true
		});
	});

	it('counts the tick box the form left out as unticked', () => {
		const formData = new FormData();
		formData.set('label', 'T-shirt size');

		expect(readQuestionForm(formData).isRequired).toBe(false);
	});

	it('counts a field the form left out as empty text', () => {
		const values = readQuestionForm(new FormData());

		expect(values.questionId).toBe('');
		expect(values.helpText).toBe('');
		expect(values.options).toBe('');
	});

	it('drops the spaces around what somebody typed', () => {
		const formData = new FormData();
		formData.set('label', '  T-shirt size  ');

		expect(readQuestionForm(formData).label).toBe('T-shirt size');
	});
});

describe('validateQuestionForm', () => {
	/** A question the form could really have been filled in with. */
	function questionValues(changes: Partial<QuestionFormValues> = {}): QuestionFormValues {
		return {
			questionId: '',
			label: 'Do you have any dietary requirements?',
			helpText: '',
			type: 'short_text',
			options: '',
			isRequired: true,
			...changes
		};
	}

	it('accepts a question that is filled in properly', () => {
		expect(validateQuestionForm(questionValues())).toEqual({});
	});

	it('asks for the question itself when there is none', () => {
		expect(validateQuestionForm(questionValues({ label: '' })).label).toBe(
			'Please enter the question.'
		);
	});

	it('refuses a question longer than the limit', () => {
		const tooLong = 'a'.repeat(QUESTION_LABEL_MAX_LENGTH + 1);

		expect(validateQuestionForm(questionValues({ label: tooLong })).label).toBe(
			`Please keep the question under ${QUESTION_LABEL_MAX_LENGTH} characters.`
		);
	});

	it('accepts a question of exactly the longest allowed', () => {
		const longest = 'a'.repeat(QUESTION_LABEL_MAX_LENGTH);

		expect(validateQuestionForm(questionValues({ label: longest })).label).toBeUndefined();
	});

	it('refuses help text longer than the limit', () => {
		const tooLong = 'a'.repeat(QUESTION_HELP_TEXT_MAX_LENGTH + 1);

		expect(validateQuestionForm(questionValues({ helpText: tooLong })).helpText).toBe(
			`Please keep the help text under ${QUESTION_HELP_TEXT_MAX_LENGTH} characters.`
		);
	});

	it('accepts help text of exactly the longest allowed, and none at all', () => {
		const longest = 'a'.repeat(QUESTION_HELP_TEXT_MAX_LENGTH);

		expect(validateQuestionForm(questionValues({ helpText: longest })).helpText).toBeUndefined();
		expect(validateQuestionForm(questionValues({ helpText: '' })).helpText).toBeUndefined();
	});

	it('refuses a kind of question the database does not have', () => {
		expect(validateQuestionForm(questionValues({ type: 'dropdown' })).type).toBe(
			'Please pick a question type.'
		);
	});

	it('accepts a picking question with two different choices', () => {
		const values = questionValues({ type: 'single_choice', options: 'Yes\nNo' });

		expect(validateQuestionForm(values).options).toBeUndefined();
	});

	it('refuses a picking question with only one choice, or none', () => {
		const message = 'Please give at least two options, one per line.';
		const oneChoice = questionValues({ type: 'single_choice', options: 'Yes' });
		const noChoices = questionValues({ type: 'multiple_choice', options: '' });

		expect(validateQuestionForm(oneChoice).options).toBe(message);
		expect(validateQuestionForm(noChoices).options).toBe(message);
	});

	it('refuses a picking question whose two choices are the same', () => {
		const values = questionValues({ type: 'single_choice', options: 'Yes\nYes' });

		expect(validateQuestionForm(values).options).toBe(
			'Please give at least two options, one per line.'
		);
	});

	it('refuses a picking question with more than twenty options, a repeated one counted', () => {
		const lines = Array.from({ length: MAX_CHOICE_OPTIONS }, (_, index) => `Option ${index + 1}`);
		const tooMany = questionValues({
			type: 'multiple_choice',
			options: [...lines, 'Option 21'].join('\n')
		});
		const repeated = questionValues({
			type: 'single_choice',
			options: [...lines, 'Option 1'].join('\n')
		});

		expect(validateQuestionForm(tooMany).options).toBe('Please give at most 20 options.');
		expect(validateQuestionForm(repeated).options).toBe('Please give at most 20 options.');
	});

	it('accepts a picking question with exactly twenty options', () => {
		const lines = Array.from({ length: MAX_CHOICE_OPTIONS }, (_, index) => `Option ${index + 1}`);
		const values = questionValues({ type: 'multiple_choice', options: lines.join('\n') });

		expect(validateQuestionForm(values).options).toBeUndefined();
	});

	it('ignores the options box for the three kinds that have no choices', () => {
		expect(validateQuestionForm(questionValues({ type: 'short_text' }))).toEqual({});
		expect(validateQuestionForm(questionValues({ type: 'long_text' }))).toEqual({});
		expect(validateQuestionForm(questionValues({ type: 'checkbox' }))).toEqual({});
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = questionValues({
			label: '',
			helpText: 'a'.repeat(QUESTION_HELP_TEXT_MAX_LENGTH + 1),
			type: 'single_choice',
			options: 'Yes'
		});
		const errors = validateQuestionForm(values);

		expect(Object.keys(errors).sort()).toEqual(['helpText', 'label', 'options']);
	});
});

describe('hasQuestionErrors', () => {
	it('says nothing is wrong with an empty set of messages', () => {
		expect(hasQuestionErrors({})).toBe(false);
	});

	it('says something is wrong as soon as one field has a message', () => {
		expect(hasQuestionErrors({ label: 'Please enter the question.' })).toBe(true);
	});
});

describe('breaksExistingAnswers', () => {
	/** The T-shirt question as the form holds it before anything is changed. */
	const SHIRT_VALUES = toQuestionFormValues(choiceQuestion());

	it('says nothing breaks when nothing changed', () => {
		expect(breaksExistingAnswers(choiceQuestion(), SHIRT_VALUES)).toBe(false);
	});

	it('says a changed type breaks the answers already given', () => {
		const values = { ...SHIRT_VALUES, type: 'multiple_choice' };

		expect(breaksExistingAnswers(choiceQuestion(), values)).toBe(true);
	});

	it('says a removed choice breaks the answers already given', () => {
		const values = { ...SHIRT_VALUES, options: 'S\nM' };

		expect(breaksExistingAnswers(choiceQuestion(), values)).toBe(true);
	});

	it('allows a choice being added', () => {
		const values = { ...SHIRT_VALUES, options: 'S\nM\nL\nXL' };

		expect(breaksExistingAnswers(choiceQuestion(), values)).toBe(false);
	});

	it('allows the choices being put in a different order', () => {
		const values = { ...SHIRT_VALUES, options: 'L\nM\nS' };

		expect(breaksExistingAnswers(choiceQuestion(), values)).toBe(false);
	});

	it('allows the question and its help text being reworded', () => {
		const values = {
			...SHIRT_VALUES,
			label: 'Which T-shirt size do you wear?',
			helpText: 'We order the shirts in advance.'
		};

		expect(breaksExistingAnswers(choiceQuestion(), values)).toBe(false);
	});

	it('allows rewording a question that never had choices to begin with', () => {
		const values = { ...toQuestionFormValues(question()), label: 'Any dietary requirements?' };

		expect(breaksExistingAnswers(question(), values)).toBe(false);
	});
});

describe('toQuestionFormValues', () => {
	it('puts a saved question back into the form', () => {
		expect(toQuestionFormValues(choiceQuestion())).toEqual({
			questionId: 'question-shirt',
			label: 'T-shirt size',
			helpText: '',
			type: 'single_choice',
			options: 'S\nM\nL',
			isRequired: true
		});
	});

	it('turns help text nobody wrote into an empty box', () => {
		expect(toQuestionFormValues(question({ helpText: null })).helpText).toBe('');
	});

	it('keeps the help text when there is one', () => {
		const withHelp = question({ helpText: 'Allergies as well as preferences.' });

		expect(toQuestionFormValues(withHelp).helpText).toBe('Allergies as well as preferences.');
	});
});
