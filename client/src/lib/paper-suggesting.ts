/*
	Suggesting: changes to a paper that wait for the other authors
	(docs/committee-papers.md, section 7). An author who switches from
	"Editing" to "Suggesting" still types, deletes, pastes and formats as
	before, but each change is rewritten, before it is applied, as the same
	change made of suggestions: the words they take out stay in place, struck
	through, and the words they add are underlined. Another author then accepts
	or rejects it, with the functions at the bottom of this file.

	ProseMirror describes every change as "steps", such as "replace the
	characters from 12 to 15 with this slice". Tiptap passes each change to
	`dispatchTransaction` below before applying it, and that rewrites the steps:

	- What a step would delete gets the deletion mark instead, except the
	  author's own suggested words, which simply go, as a typo would.
	- What a step would insert goes in after the struck words, with the
	  insertion mark.
	- A paragraph break added or taken out becomes a break marker
	  (`paper-suggestion-marks.ts`) carrying the mark, drawn as a "¶".
	- Bold, italic and underline become "out with the plain words, in with the
	  formatted ones", which `paper-suggestions.ts` calls a change of format.
	- Other changes, such as turning a paragraph into a heading or a list,
	  cannot be written as suggestions and are not made; the toolbar turns
	  those buttons off.

	The keys that delete and the typing are taken over too, before ProseMirror
	or Markdown's typed shortcuts (`**bold**`, `- `) see them, so a deletion
	steps over words that are already struck through.
*/

import { Extension, type Editor } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { Change } from '@tiptap/pm/changeset';
import { Fragment, Slice, type Mark, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
	Plugin,
	PluginKey,
	Selection,
	TextSelection,
	type EditorState,
	type Transaction
} from '@tiptap/pm/state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, type StepMap } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
	BREAK_MARKER,
	DELETION_LOOK,
	INSERTION_LOOK,
	SUGGESTED_DELETION,
	SUGGESTED_INSERTION,
	type SuggestionMarkAttributes
} from '$lib/paper-suggestion-marks';
import {
	decideSuggestion,
	isSuggestionMark,
	readSuggestions,
	startsWithBreakMarker,
	textblocksOf,
	type SuggestionDecision,
	type Textblock
} from '$lib/paper-suggestions';

/** Who is suggesting, and where a new suggestion's id and time come from. */
export type SuggestionAuthor = {
	userId: string;
	/** A fresh id for each new suggestion; tests pass their own. */
	newId: () => string;
	/** The time now, as an ISO date. */
	now: () => string;
};

/*
	Which mode the author is in lives in the editor's own state, so the toolbar
	reads it the way it reads bold. It is not saved: a page opens in "Editing".
*/
const SUGGESTING = new PluginKey<{ isSuggesting: boolean }>('paperSuggesting');

/** Set on a decision, which changes the text but is not itself a suggestion. */
const DECIDING = 'paperSuggestionDecision';

/** Which way a deleting key went, so the cursor ends on that side of the struck words. */
const DELETED_TOWARDS = 'paperSuggestionDeletedTowards';

/** Whether the editor is in "Suggesting". */
export function isSuggesting(state: EditorState): boolean {
	return SUGGESTING.getState(state)?.isSuggesting ?? false;
}

/** Switches the editor between "Editing" and "Suggesting". */
export function setSuggesting(editor: Editor, isOn: boolean): void {
	editor.view.dispatch(editor.state.tr.setMeta(SUGGESTING, { isSuggesting: isOn }));
}

function hasMark(node: ProseMirrorNode, name: string, userId?: string): boolean {
	return node.marks.some(
		(mark) => mark.type.name === name && (userId === undefined || mark.attrs.userId === userId)
	);
}

/** The textblock `position` is in, by its index, or -1 between blocks. */
function textblockAt(textblocks: Textblock[], position: number): number {
	return textblocks.findIndex(
		(textblock) => textblock.start <= position && position <= textblock.end
	);
}

/** `position` moved into text: back to the end of the text before it, or else forward. */
function startInText(textblocks: Textblock[], position: number): number | null {
	if (textblockAt(textblocks, position) !== -1) return position;

	const before = textblocks.filter((textblock) => textblock.end <= position).at(-1);
	if (before) return before.end;

	return textblocks.find((textblock) => textblock.start >= position)?.start ?? null;
}

/** `position` moved back into text: to the end of the text before it. */
function endInText(textblocks: Textblock[], position: number): number | null {
	if (textblockAt(textblocks, position) !== -1) return position;

	return textblocks.filter((textblock) => textblock.end <= position).at(-1)?.end ?? null;
}

/**
 * Where an insertion at `position` goes: after the break marker if `position`
 * is just before one, so the marker stays first in its textblock.
 */
function pastMarker(document: ProseMirrorNode, position: number): number {
	const textblocks = textblocksOf(document);
	const index = textblocks.findIndex((textblock) => textblock.start === position);

	return index !== -1 && startsWithBreakMarker(textblocks, index) ? position + 1 : position;
}

/** A stretch of one inline node between two positions. */
type InlineStretch = {
	node: ProseMirrorNode;
	textblock: ProseMirrorNode;
	from: number;
	to: number;
};

/**
 * The inline nodes between `from` and `to`, each cut to the part in range.
 * A break marker is left out: it belongs to the break before its textblock,
 * never to the words after it.
 */
function inlineStretches(textblocks: Textblock[], from: number, to: number): InlineStretch[] {
	const stretches: InlineStretch[] = [];

	textblocks.forEach((textblock, index) => {
		textblock.node.forEach((child, offset) => {
			const childStart = textblock.start + offset;
			const isMarker = offset === 0 && startsWithBreakMarker(textblocks, index);
			const stretchFrom = Math.max(childStart + (isMarker ? 1 : 0), from);
			const stretchTo = Math.min(childStart + child.nodeSize, to);

			if (stretchFrom < stretchTo) {
				stretches.push({
					node: child,
					textblock: textblock.node,
					from: stretchFrom,
					to: stretchTo
				});
			}
		});
	});

	return stretches;
}

/** One stretch of the old text replaced by a slice of new. */
type Replacement = { from: number; to: number; inserted: Slice; isFormatting: boolean };

/**
 * Collapses a change's steps into the stretches of the old text they replace.
 * Later steps are counted from the text earlier ones left, which `Change.merge`
 * untangles. ChangeSet's own `addSteps` would also trim the words the old and
 * new text share, so typing "w" over "world" would come out as "delete orld".
 */
function replacedStretches(maps: readonly StepMap[]): readonly Change<null>[] {
	let changes: readonly Change<null>[] = [];
	const span = (length: number) => (length > 0 ? [{ length, data: null }] : []);

	for (const map of maps) {
		// The stretches of one step are all counted from the text before it.
		const stepChanges: Change<null>[] = [];
		map.forEach((fromA, toA, fromB, toB) => {
			if (fromA === toA && fromB === toB) return;

			const deleted = span(toA - fromA);
			const inserted = span(toB - fromB);
			stepChanges.push(Change.fromJSON({ fromA, toA, fromB, toB, deleted, inserted }));
		});
		changes = Change.merge(changes, stepChanges, () => null);
	}

	return changes;
}

/** The change's replacements, or null when it is one that cannot be suggested. */
function replacementsOf(transaction: Transaction): Replacement[] | null {
	const steps = transaction.steps;
	const markSteps = steps.filter(
		(step) => step instanceof AddMarkStep || step instanceof RemoveMarkStep
	);

	if (markSteps.length === steps.length) {
		const from = Math.min(...markSteps.map((step) => step.from));
		const to = Math.max(...markSteps.map((step) => step.to));

		// One replacement in each textblock, so formatting leaves the paragraphs as they are.
		return textblocksOf(transaction.doc).flatMap((textblock) => {
			const start = Math.max(from, textblock.start);
			const end = Math.min(to, textblock.end);
			if (start >= end) return [];

			return [
				{ from: start, to: end, inserted: transaction.doc.slice(start, end), isFormatting: true }
			];
		});
	}

	// Steps that wrap, lift or retype blocks (headings, lists) leave nothing a rejection could undo.
	if (!steps.every((step) => step instanceof ReplaceStep)) return null;

	return replacedStretches(transaction.mapping.maps).map((change) => ({
		from: change.fromA,
		to: change.toA,
		inserted: transaction.doc.slice(change.fromB, change.toB),
		isFormatting: false
	}));
}

/**
 * The marks the change's suggestion carries. A change next to, or inside, a
 * suggestion of the author's joins it, so a word typed letter by letter is
 * one suggestion and not five, and typing over words just struck through
 * makes one replacement.
 */
function attributesFor(
	document: ProseMirrorNode,
	replacements: Replacement[],
	author: SuggestionAuthor
): SuggestionMarkAttributes {
	const ownMark = (node: ProseMirrorNode | null | undefined) =>
		node?.marks.find((mark) => isSuggestionMark(mark) && mark.attrs.userId === author.userId);

	for (const { from, to } of replacements) {
		let found: Mark | undefined;
		if (from < to) {
			document.nodesBetween(from, to, (node) => {
				found ??= ownMark(node);
			});
		}
		found ??= ownMark(document.resolve(from).nodeBefore) ?? ownMark(document.resolve(to).nodeAfter);

		if (found) return found.attrs as SuggestionMarkAttributes;
	}

	return { id: author.newId(), userId: author.userId, at: author.now() };
}

/**
 * Whether a change of format would tangle with another author's suggestion.
 * Its formatted copy cannot carry their marks, so deciding one would undo
 * the other.
 */
function tanglesFormatting(document: ProseMirrorNode, from: number, to: number, userId: string) {
	return inlineStretches(textblocksOf(document), from, to).some((stretch) =>
		stretch.node.marks.some((mark) => isSuggestionMark(mark) && mark.attrs.userId !== userId)
	);
}

/** Whether `mark` may go on the text `node` inside `textblock`: never in code. */
function takesMark(textblock: ProseMirrorNode, node: ProseMirrorNode, mark: Mark): boolean {
	return (
		textblock.type.allowsMarkType(mark.type) &&
		!node.marks.some((other) => other.type.excludes(mark.type))
	);
}

type Operation =
	{ kind: 'take out' | 'strike'; from: number; to: number } | { kind: 'add marker'; from: number };

/** What deleting from `start` to `end` does to each break it crosses. */
function breakOperations(textblocks: Textblock[], start: number, end: number, userId: string) {
	const operations: Operation[] = [];

	textblocks.forEach((textblock, index) => {
		// The break before a textblock is crossed when the deletion runs from before it to after it.
		const isCrossed = index > 0 && start <= textblocks[index - 1].end && textblock.start <= end;
		if (!isCrossed) return;

		const marker = startsWithBreakMarker(textblocks, index) ? textblock.node.firstChild : null;
		if (marker && hasMark(marker, SUGGESTED_INSERTION, userId)) {
			// The author's own suggested break simply goes, and the two textblocks join.
			operations.push({
				kind: 'take out',
				from: textblocks[index - 1].end,
				to: textblock.start + 1
			});
		} else if (marker && !hasMark(marker, SUGGESTED_DELETION)) {
			operations.push({ kind: 'strike', from: textblock.start, to: textblock.start + 1 });
		} else if (!marker) {
			operations.push({ kind: 'add marker', from: textblock.start });
		}
	});

	return operations;
}

/**
 * Rewrites "delete from `from` to `to`" as suggestions in `transaction`.
 * Returns false when part of it cannot be struck through.
 */
function suggestDeletion(
	transaction: Transaction,
	from: number,
	to: number,
	attributes: SuggestionMarkAttributes
): boolean {
	const document = transaction.doc;
	const textblocks = textblocksOf(document);
	const start = startInText(textblocks, from);
	const end = endInText(textblocks, to);
	if (start === null || end === null || start >= end) return true;

	const struck = document.type.schema.marks[SUGGESTED_DELETION].create(attributes);
	const operations = breakOperations(textblocks, start, end, attributes.userId);
	let canStrike = true;

	for (const stretch of inlineStretches(textblocks, start, end)) {
		// Line breaks inside a paragraph stay: the shared document cannot mark them.
		if (!stretch.node.isText || hasMark(stretch.node, SUGGESTED_DELETION)) continue;

		if (hasMark(stretch.node, SUGGESTED_INSERTION, attributes.userId)) {
			operations.push({ kind: 'take out', from: stretch.from, to: stretch.to });
		} else if (takesMark(stretch.textblock, stretch.node, struck)) {
			operations.push({ kind: 'strike', from: stretch.from, to: stretch.to });
		} else {
			canStrike = false;
		}
	}

	if (!canStrike) return false;

	// From the last, so each leaves the positions before it as they were. A new
	// marker goes in after the words at its position have their mark.
	operations.sort((a, b) => b.from - a.from || (a.kind === 'add marker' ? 1 : -1));
	for (const operation of operations) {
		if (operation.kind === 'take out') transaction.delete(operation.from, operation.to);
		if (operation.kind === 'strike') transaction.addMark(operation.from, operation.to, struck);
		if (operation.kind === 'add marker') {
			transaction.insert(operation.from, document.type.schema.text(BREAK_MARKER, [struck]));
		}
	}

	return true;
}

/** Whether a slice holds something other than text and the blocks text sits in. */
function holdsOtherThanText(slice: Slice): boolean {
	let holdsOther = false;

	slice.content.descendants((node) => {
		if ((node.isInline && !node.isText) || (node.isBlock && node.isLeaf)) holdsOther = true;
	});

	return holdsOther;
}

/**
 * Whether a slice is only the empty paragraph ProseMirror puts in when every
 * block is deleted, which a deletion that leaves the words struck through
 * does not need.
 */
function isEmptyFiller(slice: Slice): boolean {
	let isEmpty = slice.openStart === 0 && slice.openEnd === 0;

	slice.content.forEach((node) => {
		if (!node.isTextblock || node.content.size > 0) isEmpty = false;
	});

	return isEmpty;
}

/** The stretches from `from` to `to` a new suggestion leaves out: markers, and struck words in a copy. */
function unwantedCharacters(
	document: ProseMirrorNode,
	from: number,
	to: number,
	isFormatting: boolean
): { from: number; to: number }[] {
	const unwanted: { from: number; to: number }[] = [];

	document.nodesBetween(from, to, (node, nodeStart) => {
		if (!node.isText) return;

		// A formatted copy leaves out the words the author already struck through.
		const isStruck = isFormatting && hasMark(node, SUGGESTED_DELETION);
		const text = node.text ?? '';

		for (let index = 0; index < text.length; index++) {
			const at = nodeStart + index;
			if (at < from || at >= to || (!isStruck && text[index] !== BREAK_MARKER)) continue;

			const last = unwanted.at(-1);
			if (last && last.to === at) last.to = at + 1;
			else unwanted.push({ from: at, to: at + 1 });
		}
	});

	return unwanted;
}

/**
 * Inserts `slice` at `position` in `transaction` as a suggestion. Returns
 * where it went, or null when it cannot be suggested.
 */
function suggestInsertion(
	transaction: Transaction,
	position: number,
	slice: Slice,
	attributes: SuggestionMarkAttributes,
	isFormatting: boolean
): { from: number; to: number } | null {
	if (holdsOtherThanText(slice)) return null;

	const schema = transaction.doc.type.schema;
	const at = pastMarker(transaction.doc, position);
	const stepsBefore = transaction.steps.length;
	transaction.replace(at, at, slice);

	const step = transaction.steps.at(-1);
	if (transaction.steps.length === stepsBefore || !(step instanceof ReplaceStep)) return null;

	let from = at;
	let to = at;
	step.getMap().forEach((_oldFrom, _oldTo, newFrom, newTo) => {
		from = newFrom;
		to = newTo;
	});

	// The new words bring no suggestions with them: no markers, and none of the marks.
	for (const stretch of unwantedCharacters(transaction.doc, from, to, isFormatting).reverse()) {
		transaction.delete(stretch.from, stretch.to);
		to -= stretch.to - stretch.from;
	}
	transaction.removeMark(from, to, schema.marks[SUGGESTED_INSERTION]);
	transaction.removeMark(from, to, schema.marks[SUGGESTED_DELETION]);

	// Each new textblock starts with a marker for the break the insertion adds before it.
	const newTextblocks = textblocksOf(transaction.doc).filter(
		(textblock, index) => index > 0 && textblock.start > from && textblock.start <= to
	);
	for (const textblock of newTextblocks.reverse()) {
		transaction.insert(textblock.start, schema.text(BREAK_MARKER));
		to += 1;
	}

	const mark = schema.marks[SUGGESTED_INSERTION].create(attributes);
	transaction.addMark(from, to, mark);

	// Text in code takes no other marks, so it cannot be suggested.
	let isMarked = true;
	transaction.doc.nodesBetween(from, to, (node) => {
		if (node.isText && !mark.isInSet(node.marks)) isMarked = false;
	});

	return isMarked ? { from, to } : null;
}

/** Where one replacement ended up, as positions just after its own steps. */
type Placed = {
	deletedFrom: number;
	deletedTo: number;
	inserted: { from: number; to: number } | null;
	isFormatting: boolean;
	stepsAfter: number;
};

function suggestReplacement(
	transaction: Transaction,
	replacement: Replacement,
	attributes: SuggestionMarkAttributes
): Placed | null {
	const { from, to, inserted, isFormatting } = replacement;
	if (isFormatting && tanglesFormatting(transaction.doc, from, to, attributes.userId)) return null;

	const stepsBefore = transaction.steps.length;
	if (from < to && !suggestDeletion(transaction, from, to, attributes)) return null;

	const stepsAfterDeletion = transaction.steps.length;
	const deletion = transaction.mapping.slice(stepsBefore);
	let deletedFrom = deletion.map(from, -1);
	let deletedTo = deletion.map(to, 1);

	let placedInsertion = null;
	if (inserted.size > 0 && !(from < to && isEmptyFiller(inserted))) {
		placedInsertion = suggestInsertion(transaction, deletedTo, inserted, attributes, isFormatting);
		if (!placedInsertion) return null;

		// The struck words stay before the new ones.
		const insertion = transaction.mapping.slice(stepsAfterDeletion);
		deletedFrom = insertion.map(deletedFrom, -1);
		deletedTo = insertion.map(deletedTo, -1);
	}

	return {
		deletedFrom,
		deletedTo,
		inserted: placedInsertion,
		isFormatting,
		stepsAfter: transaction.steps.length
	};
}

/**
 * Where the cursor goes once the change is a suggestion: after what was
 * typed, or beside the words just struck through, on the side the key
 * deleted towards. A change of format keeps its words selected.
 */
function placeCursor(transaction: Transaction, placed: Placed[], deletedTowards: unknown): void {
	const document = transaction.doc;
	// Each position was taken just after its own replacement, and the ones made after it can move it.
	const final = (one: Placed, position: number, side: -1 | 1) =>
		document.resolve(transaction.mapping.slice(one.stepsAfter).map(position, side));

	// `placed` runs from the last replacement in the text to the first.
	const insertions = placed.filter((one) => one.inserted !== null);
	const lastInsertion = insertions[0];
	const firstInsertion = insertions.at(-1);
	const first = placed.at(-1);

	if (
		placed.every((one) => one.isFormatting) &&
		lastInsertion?.inserted &&
		firstInsertion?.inserted
	) {
		const from = final(firstInsertion, firstInsertion.inserted.from, 1);
		const to = final(lastInsertion, lastInsertion.inserted.to, -1);
		transaction.setSelection(TextSelection.between(from, to));
	} else if (lastInsertion?.inserted) {
		transaction.setSelection(
			Selection.near(final(lastInsertion, lastInsertion.inserted.to, 1), -1)
		);
	} else if (first && deletedTowards === 'forward' && placed.length === 1) {
		transaction.setSelection(Selection.near(final(first, first.deletedTo, 1), 1));
	} else if (first) {
		transaction.setSelection(Selection.near(final(first, first.deletedFrom, -1), -1));
	}
}

/**
 * The change `transaction` would make to `state`, rewritten as suggestions by
 * `author`, or null when it cannot be.
 */
export function suggestTransaction(
	state: EditorState,
	transaction: Transaction,
	author: SuggestionAuthor
): Transaction | null {
	const replacements = replacementsOf(transaction);
	if (!replacements) return null;

	// One change is one suggestion, however many places it touches.
	const attributes = attributesFor(state.doc, replacements, author);
	const suggested = state.tr;
	const placed: Placed[] = [];

	// From the last, so each leaves the positions of the ones before it as they were.
	for (const replacement of [...replacements].reverse()) {
		const one = suggestReplacement(suggested, replacement, attributes);
		if (!one) return null;
		placed.push(one);
	}

	placeCursor(suggested, placed, transaction.getMeta(DELETED_TOWARDS));
	if (transaction.scrolledIntoView) suggested.scrollIntoView();
	// The formatting the change left for the next typing, such as bold after Enter.
	if (transaction.storedMarksSet) {
		const marks = transaction.storedMarks?.filter((mark) => !isSuggestionMark(mark));
		suggested.setStoredMarks(marks ?? null);
	}

	return suggested;
}

/*
	The keys that delete. ProseMirror would join two paragraphs, or delete a
	character, through its own commands; while suggesting, these find what the
	key would delete, stepping over words already struck through and over
	markers, and delete that instead, which `suggestTransaction` then strikes.
*/

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

/**
 * The characters of a textblock a deleting key counts, with where each one
 * is: not struck words, markers or line breaks, which it steps over.
 */
function countedCharacters(textblock: ProseMirrorNode): { text: string; offsets: number[] } {
	let text = '';
	const offsets: number[] = [];

	textblock.forEach((child, childOffset) => {
		if (!child.isText || hasMark(child, SUGGESTED_DELETION)) return;

		const childText = child.text ?? '';
		for (let index = 0; index < childText.length; index++) {
			if (childText[index] === BREAK_MARKER) continue;
			text += childText[index];
			offsets.push(childOffset + index);
		}
	});

	return { text, offsets };
}

/** Where the word or character before `end` in `text` starts. */
function unitStartBefore(text: string, end: number, byWord: boolean): number {
	const segments = [...(byWord ? words : graphemes).segment(text.slice(0, end))];
	if (!byWord) return segments.at(-1)?.index ?? end;

	// A word and the spaces after it go together, as Alt+Backspace does everywhere else.
	let index = segments.length - 1;
	while (index > 0 && !segments[index].isWordLike) index--;
	return segments[index]?.index ?? end;
}

/** Where the word or character after `start` in `text` ends. */
function unitEndAfter(text: string, start: number, byWord: boolean): number {
	const segments = [...(byWord ? words : graphemes).segment(text.slice(start))];
	if (!byWord) return start + (segments[0]?.segment.length ?? 0);

	let index = 0;
	while (index < segments.length - 1 && !segments[index].isWordLike) index++;
	const segment = segments[index];
	return segment ? start + segment.index + segment.segment.length : start;
}

/**
 * What Backspace (`backward`) or Delete (`forward`) would delete while
 * suggesting, a word at a time with `byWord`, or null for nothing.
 */
export function deletionRange(
	state: EditorState,
	direction: 'backward' | 'forward',
	byWord: boolean
): { from: number; to: number } | null {
	const { selection } = state;
	if (!selection.empty) return { from: selection.from, to: selection.to };

	const textblocks = textblocksOf(state.doc);
	const index = textblockAt(textblocks, selection.from);
	if (index === -1) return null;

	const textblock = textblocks[index];
	const { text, offsets } = countedCharacters(textblock.node);
	const cursor = selection.from - textblock.start;
	const countedBefore = offsets.filter((offset) => offset < cursor).length;

	if (direction === 'backward') {
		// Nothing left to delete in this textblock: the key takes out the break before it.
		if (countedBefore === 0) {
			return index > 0 ? { from: textblocks[index - 1].end, to: textblock.start } : null;
		}
		const unitStart = unitStartBefore(text, countedBefore, byWord);
		return { from: textblock.start + offsets[unitStart], to: selection.from };
	}

	if (countedBefore === text.length) {
		const next = textblocks[index + 1];
		return next ? { from: textblock.end, to: next.start } : null;
	}
	const unitEnd = unitEndAfter(text, countedBefore, byWord);
	return { from: selection.from, to: textblock.start + offsets[unitEnd - 1] + 1 };
}

function handleDeletionKey(view: EditorView, event: KeyboardEvent): boolean {
	const isDeletionKey = event.key === 'Backspace' || event.key === 'Delete';
	// Cmd+Backspace, to the start of the line, is left to the browser, and so is a key mid-word in an IME.
	if (!isSuggesting(view.state) || !isDeletionKey || event.metaKey || event.isComposing) {
		return false;
	}

	const direction = event.key === 'Backspace' ? 'backward' : 'forward';
	const range = deletionRange(view.state, direction, event.altKey || event.ctrlKey);
	if (!range) return true;

	const transaction = view.state.tr.delete(range.from, range.to).scrollIntoView();
	view.dispatch(transaction.setMeta(DELETED_TOWARDS, direction));
	return true;
}

/*
	Typing. In "Editing" ProseMirror inserts it as usual, unless the cursor is
	just before a break marker, where the words go after the marker so it stays
	first. In "Suggesting" every keystroke is inserted here, which also keeps
	out Markdown's typed shortcuts, which turn lines into headings and lists.
*/
function handleTextInput(view: EditorView, from: number, to: number, text: string): boolean {
	const at = from === to ? pastMarker(view.state.doc, from) : from;
	if (!isSuggesting(view.state) && at === from) return false;

	const transaction = view.state.tr.insertText(text, at, from === to ? at : to);
	// Typing carries on after what was typed, wherever it was put.
	transaction.setSelection(TextSelection.create(transaction.doc, at + text.length));
	view.dispatch(transaction.scrollIntoView());
	return true;
}

/** `fragment` with no suggestion marks and no markers left in it. */
function withoutSuggestions(fragment: Fragment): Fragment {
	const nodes: ProseMirrorNode[] = [];

	fragment.forEach((node) => {
		const marks = node.marks.filter((mark) => !isSuggestionMark(mark));
		if (!node.isText) {
			nodes.push(node.type.create(node.attrs, withoutSuggestions(node.content), marks));
			return;
		}

		const text = (node.text ?? '').replaceAll(BREAK_MARKER, '');
		if (text !== '') nodes.push(node.type.schema.text(text, marks));
	});

	return Fragment.from(nodes);
}

/**
 * A "¶" at the end of a paragraph whose break is suggested, added or taken
 * out, drawn like the words of the suggestion. A screen reader skips it: the
 * suggestion's card says what it does.
 */
function breakSigns(document: ProseMirrorNode): DecorationSet {
	const textblocks = textblocksOf(document);

	const signs = textblocks.flatMap((textblock, index) => {
		const marker = textblock.node.firstChild;
		const isSuggested = marker?.marks.some(isSuggestionMark) ?? false;
		if (!marker || !startsWithBreakMarker(textblocks, index) || !isSuggested) return [];

		const look = hasMark(marker, SUGGESTED_DELETION) ? DELETION_LOOK : INSERTION_LOOK;
		const draw = (view: EditorView) => {
			const sign = view.dom.ownerDocument.createElement('span');
			sign.className = look;
			sign.textContent = '¶';
			sign.setAttribute('aria-hidden', 'true');
			return sign;
		};

		// After the cursor at the paragraph's end, since the break comes after its last word.
		return [Decoration.widget(textblocks[index - 1].end, draw, { side: 1, key: look })];
	});

	return DecorationSet.create(document, signs);
}

/** Options for `paperSuggesting`. */
export type PaperSuggestingOptions = { author: SuggestionAuthor | null };

/**
 * The extension a live paper's editor adds: the mode, the rewriting of each
 * change while suggesting, and the keys and typing it takes over.
 */
export const paperSuggesting = Extension.create<PaperSuggestingOptions>({
	name: 'paperSuggesting',
	// Ahead of StarterKit's 100, so its keys and typed shortcuts come after these.
	priority: 200,

	addOptions() {
		return { author: null };
	},

	addProseMirrorPlugins() {
		let drawn: { document: ProseMirrorNode; signs: DecorationSet } | null = null;

		const plugin = new Plugin({
			key: SUGGESTING,
			state: {
				init: () => ({ isSuggesting: false }),
				apply: (transaction, mode) => transaction.getMeta(SUGGESTING) ?? mode
			},
			props: {
				handleTextInput,
				handleKeyDown: handleDeletionKey,
				// Copied text keeps its words but not the suggestions it carried.
				transformPasted: (slice) =>
					new Slice(withoutSuggestions(slice.content), slice.openStart, slice.openEnd),
				decorations: (state) => {
					// Drawn again only when the text changes, not each time the cursor moves.
					if (drawn?.document !== state.doc) {
						drawn = { document: state.doc, signs: breakSigns(state.doc) };
					}
					return drawn.signs;
				}
			}
		});

		return [plugin];
	},

	dispatchTransaction({ transaction, next }) {
		const state = this.editor.state;
		const author = this.options.author;
		const passesThrough =
			!author ||
			!isSuggesting(state) ||
			!transaction.docChanged ||
			transaction.before !== state.doc ||
			// Somebody else's typing arriving, or the author's own undo, is already decided.
			isChangeOrigin(transaction) ||
			transaction.getMeta(DECIDING) === true;

		if (passesThrough) {
			next(transaction);
			return;
		}

		const suggested = suggestTransaction(state, transaction, author);
		// A change that cannot be written as a suggestion is not made at all.
		if (suggested) next(suggested);
	}
});

/** Accepts or rejects one suggestion, as one change the author can undo. */
export function decideOneSuggestion(
	editor: Editor,
	id: string,
	decision: SuggestionDecision
): void {
	const transaction = editor.state.tr.setMeta(DECIDING, true);
	decideSuggestion(transaction, id, decision);
	editor.view.dispatch(transaction);
}

/** Accepts or rejects every suggestion but those of `authorId`, as one change. */
export function decideAllSuggestions(
	editor: Editor,
	decision: SuggestionDecision,
	authorId: string
): void {
	const transaction = editor.state.tr.setMeta(DECIDING, true);
	const others = readSuggestions(editor.state.doc).filter(
		(suggestion) => suggestion.userId !== authorId
	);

	for (const suggestion of others) decideSuggestion(transaction, suggestion.id, decision);
	editor.view.dispatch(transaction);
}
