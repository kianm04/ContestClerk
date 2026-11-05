import { describe, expect, it } from 'vitest';
import { readNewRowId } from './new-row-id';

describe('readNewRowId', () => {
	it('reads an id the browser made', () => {
		const id = '3f2b8c1e-9d4a-4e6b-8f0a-1c2d3e4f5a6b';

		expect(readNewRowId(id)).toBe(id);
	});

	it('writes the id in small letters, as Postgres gives it back', () => {
		expect(readNewRowId(' 3F2B8C1E-9D4A-4E6B-8F0A-1C2D3E4F5A6B ')).toBe(
			'3f2b8c1e-9d4a-4e6b-8f0a-1c2d3e4f5a6b'
		);
	});

	it('answers null when nothing, or something that is not an id, was sent', () => {
		expect(readNewRowId(null)).toBeNull();
		expect(readNewRowId('')).toBeNull();
		expect(readNewRowId('pending-1')).toBeNull();
		expect(readNewRowId("1'; drop table seats;--")).toBeNull();
	});
});
