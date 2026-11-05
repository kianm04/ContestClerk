import { describe, expect, it } from 'vitest';
import { isAllowedLinkAddress, linkAddressFromTyped } from './markdown';

describe('isAllowedLinkAddress', () => {
	it('allows web pages and email addresses', () => {
		expect(isAllowedLinkAddress('https://www.un.org')).toBe(true);
		expect(isAllowedLinkAddress('http://example.org')).toBe(true);
		expect(isAllowedLinkAddress('HTTPS://WWW.UN.ORG')).toBe(true);
		expect(isAllowedLinkAddress('mailto:chair@example.org')).toBe(true);
	});

	it('refuses every other kind of address', () => {
		expect(isAllowedLinkAddress('javascript:alert(1)')).toBe(false);
		expect(isAllowedLinkAddress('data:text/html,hi')).toBe(false);
		expect(isAllowedLinkAddress('/conferences')).toBe(false);
		expect(isAllowedLinkAddress('//evil.example')).toBe(false);
		expect(isAllowedLinkAddress('www.un.org')).toBe(false);
	});
});

describe('linkAddressFromTyped', () => {
	it('keeps an allowed address as it was typed, without the spaces around it', () => {
		expect(linkAddressFromTyped('  https://www.un.org/charter ')).toBe(
			'https://www.un.org/charter'
		);
		expect(linkAddressFromTyped('mailto:chair@example.org')).toBe('mailto:chair@example.org');
	});

	it('makes a bare web address into an https one', () => {
		expect(linkAddressFromTyped('www.un.org')).toBe('https://www.un.org');
	});

	it('refuses an empty box and any other scheme', () => {
		expect(linkAddressFromTyped('   ')).toBeNull();
		expect(linkAddressFromTyped('javascript:alert(1)')).toBeNull();
		expect(linkAddressFromTyped('JavaScript:alert(1)')).toBeNull();
		expect(linkAddressFromTyped('data:text/html,hi')).toBeNull();
	});
});
