import { describe, expect, it } from 'vitest';
import { leadingBytesMatchType, SIGNATURE_BYTES } from './file-signatures';

/** The first bytes of a file written out as text, for the signatures that are readable. */
function bytesOf(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('leadingBytesMatchType', () => {
	it('recognises a PDF by its header', () => {
		expect(leadingBytesMatchType(bytesOf('%PDF-1.7\n%%EOF'), 'application/pdf')).toBe(true);
		expect(leadingBytesMatchType(bytesOf('%PDF'), 'application/pdf')).toBe(false);
	});

	it('recognises a JPEG by its start-of-image marker', () => {
		expect(leadingBytesMatchType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg')).toBe(
			true
		);
		expect(leadingBytesMatchType(new Uint8Array([0xff, 0xd8, 0x00, 0xdb]), 'image/jpeg')).toBe(
			false
		);
	});

	it('recognises a PNG by its first four bytes', () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

		expect(leadingBytesMatchType(png, 'image/png')).toBe(true);
		expect(leadingBytesMatchType(png.slice(1), 'image/png')).toBe(false);
	});

	it('recognises a WebP by both RIFF and WEBP, with the size between them', () => {
		const webp = bytesOf('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ');

		expect(leadingBytesMatchType(webp, 'image/webp')).toBe(true);
		// A RIFF file that is something else, such as a WAV, is not a WebP.
		expect(
			leadingBytesMatchType(bytesOf('RIFF\u0000\u0000\u0000\u0000WAVEfmt '), 'image/webp')
		).toBe(false);
	});

	it('recognises a Word document as a zip', () => {
		expect(leadingBytesMatchType(bytesOf('PK\u0003\u0004'), DOCX)).toBe(true);
		expect(leadingBytesMatchType(bytesOf('%PDF-1.7'), DOCX)).toBe(false);
	});

	it('refuses bytes of one type declared as another', () => {
		expect(leadingBytesMatchType(bytesOf('PK\u0003\u0004'), 'application/pdf')).toBe(false);
		expect(leadingBytesMatchType(bytesOf('%PDF-1.7'), 'image/png')).toBe(false);
	});

	it('refuses an empty file and a type it has no signature for', () => {
		expect(leadingBytesMatchType(new Uint8Array(0), 'application/pdf')).toBe(false);
		expect(leadingBytesMatchType(bytesOf('hello'), 'text/plain')).toBe(false);
	});

	it('needs twelve bytes, enough to reach the end of the WebP signature', () => {
		expect(SIGNATURE_BYTES).toBe(12);
	});
});
