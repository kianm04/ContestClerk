import { describe, expect, it } from 'vitest';
import { CSV_CONTENT_TYPE, toCsvText, withoutColumns } from './csv';

describe('CSV_CONTENT_TYPE', () => {
	it('says the file is CSV and that it is written in UTF-8', () => {
		// Without the charset a spreadsheet can read a name such as "Kowalska"
		// with a Polish letter in it as something else entirely.
		expect(CSV_CONTENT_TYPE).toBe('text/csv; charset=utf-8');
	});
});

describe('toCsvText', () => {
	it('writes nothing at all for a table with no rows', () => {
		expect(toCsvText([])).toBe('');
	});

	it('separates the cells of a row with commas', () => {
		expect(toCsvText([['Name', 'Email']])).toBe('Name,Email\r\n');
	});

	it('ends every row with a carriage return and a newline', () => {
		const rows = [
			['Name', 'Email'],
			['Anna Kowalski', 'anna@example.com']
		];

		expect(toCsvText(rows)).toBe('Name,Email\r\nAnna Kowalski,anna@example.com\r\n');
	});

	it('writes an empty cell as nothing between two commas', () => {
		expect(toCsvText([['Anna Kowalski', '', 'Warsaw']])).toBe('Anna Kowalski,,Warsaw\r\n');
	});

	it('writes a row of nothing but empty cells', () => {
		expect(toCsvText([['', '', '']])).toBe(',,\r\n');
	});

	it('wraps a cell holding a comma in quotation marks', () => {
		expect(toCsvText([['Warsaw, Poland']])).toBe('"Warsaw, Poland"\r\n');
	});

	it('doubles the quotation marks inside a cell and wraps the cell in them', () => {
		expect(toCsvText([['She said "yes"']])).toBe('"She said ""yes"""\r\n');
	});

	it('wraps a cell holding a line break, so a motivation stays one cell', () => {
		expect(toCsvText([['First line\nSecond line']])).toBe('"First line\nSecond line"\r\n');
	});

	it('wraps a cell holding a Windows line break', () => {
		expect(toCsvText([['First line\r\nSecond line']])).toBe('"First line\r\nSecond line"\r\n');
	});

	it('wraps a cell that holds a comma, a quotation mark and a line break at once', () => {
		const cell = 'Kowalska, Anna\nsaid "hello"';

		expect(toCsvText([[cell]])).toBe('"Kowalska, Anna\nsaid ""hello"""\r\n');
	});

	it('leaves an ordinary cell exactly as it is, so the file stays readable', () => {
		expect(toCsvText([['Anna Kowalski']])).toBe('Anna Kowalski\r\n');
	});

	it('keeps a cell with spaces in it alone', () => {
		// A space does not end a cell, so it does not force quotes.
		expect(toCsvText([['Anna Kowalski of Warsaw']])).toBe('Anna Kowalski of Warsaw\r\n');
	});

	it('wraps a cell holding a semicolon, which a European Excel reads as the separator', () => {
		expect(toCsvText([['Anna Kowalski; Warsaw']])).toBe('"Anna Kowalski; Warsaw"\r\n');
	});

	it('wraps a cell holding a tab', () => {
		expect(toCsvText([['Anna\tKowalski']])).toBe('"Anna\tKowalski"\r\n');
	});

	describe('a cell a spreadsheet would run as a formula', () => {
		// An applicant typed these cells, and Excel, Numbers and Sheets run a cell
		// that starts with one of these characters as a formula, which can fetch
		// from the web or start a program on the organiser's machine. A leading
		// apostrophe tells every spreadsheet the cell is text, and the quotes keep
		// the apostrophe and the cell together.
		it.each([
			['an equals sign', '=1+1', `"'=1+1"`],
			['a plus', '+1+1', `"'+1+1"`],
			['a minus', '-1+1', `"'-1+1"`],
			['an at sign', '@SUM(A1)', `"'@SUM(A1)"`],
			['a tab', '\t=1+1', `"'\t=1+1"`],
			['a carriage return', '\r=1+1', `"'\r=1+1"`]
		])('is made text when it starts with %s', (_name, cell, written) => {
			expect(toCsvText([[cell]])).toBe(`${written}\r\n`);
		});

		it('looks past the spaces at the start, which a spreadsheet also ignores', () => {
			expect(toCsvText([['  =HYPERLINK("http://x")']])).toBe(`"'  =HYPERLINK(""http://x"")"\r\n`);
		});

		it('leaves a cell that merely contains one of these characters alone', () => {
			expect(toCsvText([['Anna-Maria', 'anna@example.org', '2026-10-22']])).toBe(
				'Anna-Maria,anna@example.org,2026-10-22\r\n'
			);
		});
	});

	it('writes a row with no cells in it as an empty line', () => {
		expect(toCsvText([[]])).toBe('\r\n');
	});

	it('writes a whole small table', () => {
		const rows = [
			['Name', 'Institution', 'Motivation'],
			['Anna Kowalski', 'Warsaw, Poland', 'I want to "learn".'],
			['Piotr Nowak', '', 'Two\nlines.']
		];

		expect(toCsvText(rows)).toBe(
			'Name,Institution,Motivation\r\n' +
				'Anna Kowalski,"Warsaw, Poland","I want to ""learn""."\r\n' +
				'Piotr Nowak,,"Two\nlines."\r\n'
		);
	});
});

describe('withoutColumns', () => {
	it('drops the columns with these headings from every row', () => {
		const rows = [
			['Name', 'Email', 'Seat', 'Phone'],
			['Anna', 'anna@example.org', 'France', '0123']
		];

		expect(withoutColumns(rows, ['Email', 'Phone'])).toEqual([
			['Name', 'Seat'],
			['Anna', 'France']
		]);
	});

	it('keeps everything when nothing is named, and an empty table empty', () => {
		expect(withoutColumns([['Name'], ['Anna']], [])).toEqual([['Name'], ['Anna']]);
		expect(withoutColumns([], ['Email'])).toEqual([]);
	});

	it('drops only the first column under a heading, so a later question of that name stays', () => {
		const rows = [
			['Name', 'Phone', 'Phone'],
			['Anna', '0123', 'Samsung']
		];

		expect(withoutColumns(rows, ['Phone'])).toEqual([
			['Name', 'Phone'],
			['Anna', 'Samsung']
		]);
	});
});
