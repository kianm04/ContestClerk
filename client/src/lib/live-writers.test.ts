import { describe, expect, it } from 'vitest';
import {
	editingText,
	readLiveWriter,
	resolveLiveWriter,
	unknownWriterIds,
	writerTitle,
	writersPresent
} from './live-writers';

const RACHEL = { id: 'user-rachel', name: 'Rachel Morgan' };
const TOM = { id: 'user-tom', name: 'Tom Price' };
const AISHA = { id: 'user-aisha', name: 'Aisha Bello' };

/** The writers the server knows, as the page is given them. */
const KNOWN = [RACHEL, TOM, AISHA];

describe('writerTitle', () => {
	it('names the seat after the writer when there is one', () => {
		expect(writerTitle({ ...RACHEL, seatName: 'Mexico' })).toBe('Rachel Morgan, Mexico');
		expect(writerTitle(RACHEL)).toBe('Rachel Morgan');
	});
});

describe('readLiveWriter', () => {
	it("reads the writer from an editor's awareness entry", () => {
		expect(readLiveWriter({ user: RACHEL, cursor: null })).toEqual(RACHEL);
	});

	it('keeps the seat a writer names, and only a seat that is text', () => {
		const forMexico = { ...RACHEL, seatName: 'Mexico' };

		expect(readLiveWriter({ user: forMexico })).toEqual(forMexico);
		expect(readLiveWriter({ user: { ...RACHEL, seatName: 4 } })).toEqual(RACHEL);
	});

	it('ignores an entry that names nobody readable', () => {
		expect(readLiveWriter(null)).toBeNull();
		expect(readLiveWriter({})).toBeNull();
		expect(readLiveWriter({ user: { id: 7, name: 'Rachel' } })).toBeNull();
		expect(readLiveWriter({ user: { id: 'user-rachel' } })).toBeNull();
	});
});

describe('resolveLiveWriter', () => {
	it('names a writer from the list the server gave, by the id the entry claims', () => {
		const forMexico = { ...TOM, seatName: 'Mexico' };

		expect(resolveLiveWriter({ user: TOM }, [RACHEL, forMexico])).toEqual(forMexico);
	});

	it("takes the server's name and seat, not the entry's own", () => {
		const claimed = { id: TOM.id, name: 'The Secretary-General', seatName: 'Chair' };

		expect(resolveLiveWriter({ user: claimed }, KNOWN)).toEqual(TOM);
	});

	it('drops an id the server does not know, and an entry that names nobody readable', () => {
		expect(resolveLiveWriter({ user: { id: 'stranger', name: 'Somebody' } }, KNOWN)).toBeNull();
		expect(resolveLiveWriter({ user: TOM }, [])).toBeNull();
		expect(resolveLiveWriter({}, KNOWN)).toBeNull();
	});
});

describe('unknownWriterIds', () => {
	it('names each id the server does not know once, and none it knows', () => {
		const states = [
			{ user: TOM },
			{ user: { id: 'user-daniel', name: 'Daniel Osei' } },
			{ user: { id: 'user-daniel', name: 'Daniel Osei' } },
			{ user: { id: 7, name: 'Nobody readable' } },
			{}
		];

		expect(unknownWriterIds(states, KNOWN)).toEqual(['user-daniel']);
		expect(unknownWriterIds([{ user: TOM }, { user: RACHEL }], KNOWN)).toEqual([]);
	});
});

describe('writersPresent', () => {
	it('lists everybody else once, in name order, leaving the reader out', () => {
		const states = [{ user: TOM }, { user: RACHEL }, { user: TOM }, { user: AISHA }, {}];

		expect(writersPresent(states, AISHA.id, KNOWN)).toEqual([RACHEL, TOM]);
	});

	it('lists only writers the server knows, by the names it knows them by', () => {
		const states = [
			{ user: { id: 'stranger', name: 'Zed' } },
			{ user: { id: TOM.id, name: 'Not Tom' } }
		];

		expect(writersPresent(states, AISHA.id, KNOWN)).toEqual([TOM]);
	});
});

describe('editingText', () => {
	it('says who is editing by first name', () => {
		expect(editingText([])).toBeNull();
		expect(editingText([RACHEL])).toBe('Rachel is editing');
		expect(editingText([RACHEL, TOM])).toBe('Rachel and Tom are editing');
		expect(editingText([AISHA, RACHEL, TOM])).toBe('Aisha, Rachel and Tom are editing');
	});
});
