import { describe, expect, it } from 'vitest';
import { contentDispositionFor } from './download-filename';

// The file names of the CSV downloads carry a conference's slug, which an
// organiser typed. These tests are about the one header that name goes into:
// nothing in the name may end the quoted part early, break the header into two
// lines, or make the server refuse to send it.

describe('contentDispositionFor', () => {
	it('names a plain file as it is, and adds nothing', () => {
		expect(contentDispositionFor('participants-thimun-2027-2026-10-22.csv')).toBe(
			'attachment; filename="participants-thimun-2027-2026-10-22.csv"'
		);
	});

	it('keeps a quotation mark out of the quoted name, and carries the real name beside it', () => {
		expect(contentDispositionFor('applications-a"b-2026-10-22.csv')).toBe(
			`attachment; filename="applications-a-b-2026-10-22.csv"; filename*=UTF-8''applications-a%22b-2026-10-22.csv`
		);
	});

	it('lets no line break or other control character into the header', () => {
		const header = contentDispositionFor('x\r\ny\u0000z.csv');

		// A header holding one of these is refused outright, which is a failed download.
		const controlCharacters = [...header].filter((character) => {
			const code = character.charCodeAt(0);

			return code < 0x20 || code === 0x7f;
		});
		expect(controlCharacters).toEqual([]);
		expect(header).toBe(`attachment; filename="x-y-z.csv"; filename*=UTF-8''x%0D%0Ay%00z.csv`);
	});

	it('writes a name with letters outside ASCII the way RFC 5987 asks', () => {
		expect(contentDispositionFor('évora-invoices-2026-10-22.csv')).toBe(
			`attachment; filename="-vora-invoices-2026-10-22.csv"; filename*=UTF-8''%C3%A9vora-invoices-2026-10-22.csv`
		);
	});

	it('encodes the characters encodeURIComponent leaves alone but RFC 5987 does not allow', () => {
		expect(contentDispositionFor("it's(*).csv")).toBe(
			`attachment; filename="it-s-.csv"; filename*=UTF-8''it%27s%28%2A%29.csv`
		);
	});

	it('lowers a capital in the plain name rather than dropping the letter', () => {
		expect(contentDispositionFor('Thimun.csv')).toBe(
			`attachment; filename="thimun.csv"; filename*=UTF-8''Thimun.csv`
		);
	});
});
