/**
 * Whether a file's first bytes are those of the type it says it is.
 *
 * A browser tells the server a file's type from its name, so a Word document
 * renamed `paper.pdf` arrives as `application/pdf` and every check on
 * `file.type` believes it. The bytes do not lie: each type the `documents`
 * bucket accepts starts with a fixed signature, and this reads it before the
 * upload (`uploadDocumentObject` in `$lib/server/document-storage.ts`).
 *
 * Nothing here talks to Supabase or to Svelte.
 */

/**
 * How many leading bytes `leadingBytesMatchType` needs to see. WebP is the
 * longest: "RIFF", four bytes of length, then "WEBP", so the twelfth byte is
 * the last one read.
 */
export const SIGNATURE_BYTES = 12;

/** One run of bytes a file must carry at an offset from its start. */
type SignaturePart = { offset: number; bytes: number[] };

/**
 * The signature of each type, as the file format itself lays it down. A type
 * with two parts carries both.
 */
const SIGNATURES: Record<string, SignaturePart[]> = {
	// "%PDF-", the start of every PDF header such as "%PDF-1.7".
	'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
	// The JPEG start-of-image marker, then the first segment's marker prefix.
	'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
	// A byte that is not ASCII, then "PNG".
	'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
	// A RIFF container whose form is "WEBP"; the four bytes between are the size.
	'image/webp': [
		{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
		{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }
	],
	// A .docx is a zip, and every zip starts with "PK".
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
		{ offset: 0, bytes: [0x50, 0x4b] }
	]
};

/**
 * `true` when `leadingBytes`, the first `SIGNATURE_BYTES` of a file, start the
 * way a file of `mimeType` must. A type this file knows no signature for is
 * `false`: it is not one the buckets accept, so there is nothing to match.
 */
export function leadingBytesMatchType(leadingBytes: Uint8Array, mimeType: string): boolean {
	const signature = SIGNATURES[mimeType];

	if (!signature) {
		return false;
	}

	return signature.every((part) =>
		part.bytes.every((byte, index) => leadingBytes[part.offset + index] === byte)
	);
}
