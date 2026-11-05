/**
 * Turning a table of cells into the text of a CSV file.
 *
 * The organiser's pages offer downloads — the applications export is the first
 * of them — and a spreadsheet is unforgiving about quoting: a motivation with
 * a comma or a line break in it would otherwise split one row into several.
 * The rules are RFC 4180's, and they are written down here once so that every
 * download follows the same ones.
 *
 * This file knows nothing about applications, or about any other kind of row.
 * The caller turns its own records into a table of strings and hands that
 * over. Nothing here talks to Supabase or to Svelte.
 */

/** What a CSV download is served as. */
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/**
 * The end of a row: a carriage return and a newline, which is what RFC 4180
 * asks for and what Excel on Windows expects. Every row ends with one,
 * including the last.
 */
const ROW_ENDING = '\r\n';

/**
 * The characters that force a cell to be wrapped in quotation marks. Any of
 * them left bare would end the cell, the row, or the quoting early: a
 * semicolon is the separator a European Excel reads a CSV with, and a tab is
 * what a spreadsheet splits a pasted line on.
 */
const CHARACTERS_NEEDING_QUOTES = ['"', ',', ';', '\t', '\n', '\r'];

/**
 * The characters a spreadsheet runs a cell as a formula for when the cell
 * starts with one of them. A formula can fetch from the web or start a program
 * on the organiser's machine, and an applicant typed every cell these files
 * carry, so such a cell is written as text instead (see `toCsvCell`).
 */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];

/** The mark every spreadsheet reads as "this cell is text, whatever follows". */
const TEXT_MARK = "'";

/**
 * Whether a spreadsheet would run this cell as a formula: it starts, after any
 * spaces, with one of `FORMULA_STARTERS`. A spreadsheet ignores those spaces
 * too, which is why they are looked past rather than counted as a safe start.
 */
function startsLikeFormula(cell: string): boolean {
	const firstCharacter = cell.replace(/^ +/, '').charAt(0);

	return FORMULA_STARTERS.includes(firstCharacter);
}

/** The cell wrapped in quotation marks, with its own doubled so a reader can tell them apart. */
function quoted(cell: string): string {
	return `"${cell.split('"').join('""')}"`;
}

/**
 * One cell as CSV writes it: wrapped in quotation marks when it holds a comma,
 * a semicolon, a tab, a quotation mark or a line break, with its own quotation
 * marks doubled so that a reader can tell them from the wrapping pair.
 *
 * A cell a spreadsheet would run as a formula is written as text: the text
 * mark goes in front and the quotes around both, so the mark is read as part
 * of the cell and the spreadsheet shows what the applicant typed.
 *
 * A cell with none of those characters is written exactly as it is, which
 * keeps the file readable for a person opening it in a text editor.
 */
function toCsvCell(cell: string): string {
	if (startsLikeFormula(cell)) {
		return quoted(TEXT_MARK + cell);
	}

	const needsQuotes = CHARACTERS_NEEDING_QUOTES.some((character) => cell.includes(character));

	if (!needsQuotes) {
		return cell;
	}

	return quoted(cell);
}

/**
 * A table of cells as CSV text, following RFC 4180: a cell holding a comma, a
 * quotation mark or a line break is wrapped in quotation marks and its own
 * quotation marks are doubled; rows end with a carriage return and a newline.
 * On top of that, a cell a spreadsheet would run as a formula is marked as
 * text, because every cell here was typed by an applicant.
 *
 * An empty table is empty text rather than a lone line ending, so a download
 * of no rows at all is a file with nothing in it.
 */
export function toCsvText(rows: string[][]): string {
	const lines = rows.map((row) => row.map(toCsvCell).join(','));

	return lines.map((line) => line + ROW_ENDING).join('');
}

/**
 * The same table without the columns headed by any of `headings`, which are
 * looked for in its first row. A download leaves out what its reader may not
 * see this way, rather than writing blank cells under a heading that says what
 * it hides.
 *
 * Only the first column under each heading goes. The fixed columns come first
 * in every export, so a conference's own question that happens to be called
 * "Phone" further along is kept.
 */
export function withoutColumns(rows: string[][], headings: string[]): string[][] {
	const headingRow = rows[0] ?? [];
	const dropped = new Set<string>();
	const kept: number[] = [];

	headingRow.forEach((heading, index) => {
		if (headings.includes(heading) && !dropped.has(heading)) {
			dropped.add(heading);
		} else {
			kept.push(index);
		}
	});

	return rows.map((row) => kept.map((index) => row[index]));
}
