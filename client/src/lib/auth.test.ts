import { describe, expect, it } from 'vitest';
import {
	authLinkDestination,
	describeAuthErrorReason,
	describeEmailLink,
	describeSignInError,
	destinationAfterAuth,
	EMAIL_LINK_TYPES,
	parseAuthErrorReason,
	parseEmailLinkType,
	PASSWORD_RECOVERY_WINDOW_SECONDS,
	passwordRecoveryState,
	pathOnThisSite,
	safeRedirectPath,
	UNEXPECTED_ERROR_TEXT,
	validateEmail,
	validateFullName,
	validatePassword
} from './auth';

describe('validateEmail', () => {
	it('accepts an ordinary address', () => {
		expect(validateEmail('daniel@example.com')).toBeNull();
	});

	it('asks for an address when the field is empty', () => {
		expect(validateEmail('   ')).toBe('Please enter your email address.');
	});

	it('refuses something that is not an address at all', () => {
		expect(validateEmail('daniel at example')).toBe('That does not look like an email address.');
	});
});

describe('validatePassword', () => {
	it('accepts eight characters', () => {
		expect(validatePassword('12345678')).toBeNull();
	});

	it('refuses seven', () => {
		expect(validatePassword('1234567')).toBe('Please use at least 8 characters.');
	});
});

describe('validateFullName', () => {
	it('accepts a name', () => {
		expect(validateFullName('Daniel Perez')).toBeNull();
	});

	it('accepts a name that is one word', () => {
		expect(validateFullName('Prince')).toBeNull();
	});

	it('asks for a name when the field is blank', () => {
		expect(validateFullName('  ')).toBe('Please enter your name.');
	});

	it('refuses a name longer than a hundred characters', () => {
		expect(validateFullName('a'.repeat(101))).toBe('Please use a shorter name.');
	});

	it('measures the name without the spaces around it', () => {
		expect(validateFullName(`  ${'a'.repeat(100)}  `)).toBeNull();
	});
});

describe('describeSignInError', () => {
	it('explains a wrong email or password', () => {
		expect(describeSignInError('invalid_credentials', UNEXPECTED_ERROR_TEXT)).toBe(
			'That email and password do not match an account.'
		);
	});

	it('explains an address that was never confirmed', () => {
		expect(describeSignInError('email_not_confirmed', UNEXPECTED_ERROR_TEXT)).toContain(
			'confirm your email address first'
		);
	});

	it('falls back to the general apology for anything else', () => {
		expect(describeSignInError('some_new_code', UNEXPECTED_ERROR_TEXT)).toBe(UNEXPECTED_ERROR_TEXT);
		expect(describeSignInError(undefined, UNEXPECTED_ERROR_TEXT)).toBe(UNEXPECTED_ERROR_TEXT);
	});
});

describe('pathOnThisSite', () => {
	it('keeps a path, its query and its fragment', () => {
		expect(pathOnThisSite('/ok?x=1#y')).toBe('/ok?x=1#y');
		expect(pathOnThisSite('/conferences?q=munich')).toBe('/conferences?q=munich');
	});

	it('answers null for another website, however it is spelled', () => {
		// A browser reads a backslash after the first slash as a second slash, so
		// each of these is `//evil.example` to it (security review M13).
		expect(pathOnThisSite('https://evil.example')).toBeNull();
		expect(pathOnThisSite('//evil.example')).toBeNull();
		expect(pathOnThisSite('/\\evil.example')).toBeNull();
		expect(pathOnThisSite('/\\/evil.example')).toBeNull();
		expect(pathOnThisSite('javascript:alert(1)')).toBeNull();
	});

	it('answers null for a dot segment that normalises to a second slash', () => {
		// Each of these is still on this site to `new URL`, but its normalised
		// path starts with two slashes, which a redirect header sends to another
		// website (security review M13, the final review's dot segments).
		expect(pathOnThisSite('/.//evil.example')).toBeNull();
		expect(pathOnThisSite('/a/..//evil.example')).toBeNull();
		expect(pathOnThisSite('/%2e//evil.example')).toBeNull();
		expect(pathOnThisSite('/./\\evil.example')).toBeNull();
		expect(pathOnThisSite('/./\\\\evil.example')).toBeNull();
	});

	it('answers null for an address that does not parse, rather than throwing', () => {
		// `new URL` throws on these, because each names a website with no name;
		// before, the throw reached the page as an error (the final review's check).
		expect(pathOnThisSite('//')).toBeNull();
		expect(pathOnThisSite('///')).toBeNull();
		expect(pathOnThisSite('/\\')).toBeNull();
		expect(pathOnThisSite('//:')).toBeNull();
		expect(pathOnThisSite('//@')).toBeNull();
	});

	it('keeps a dot segment that normalises to a path on this site', () => {
		expect(pathOnThisSite('/conferences/../profile')).toBe('/profile');
		expect(pathOnThisSite('/a//b')).toBe('/a//b');
	});

	it('answers null for a path with a tab or a line break in it', () => {
		// Browsers drop these characters before reading an address, so `/\t/evil`
		// becomes `//evil`; a real link never carries them.
		expect(pathOnThisSite('/\t/evil.example')).toBeNull();
		expect(pathOnThisSite('/ok\n')).toBeNull();
		expect(pathOnThisSite('/ok\r\nSet-Cookie: x')).toBeNull();
	});

	it('answers null for a relative address and for nothing at all', () => {
		expect(pathOnThisSite('./conferences')).toBeNull();
		expect(pathOnThisSite('conferences')).toBeNull();
		expect(pathOnThisSite(null)).toBeNull();
		expect(pathOnThisSite('')).toBeNull();
	});
});

describe('safeRedirectPath', () => {
	it('keeps an address inside this site', () => {
		expect(safeRedirectPath('/conferences?q=munich')).toBe('/conferences?q=munich');
		expect(safeRedirectPath('/ok?x=1#y')).toBe('/ok?x=1#y');
	});

	it('refuses another website', () => {
		expect(safeRedirectPath('https://evil.example')).toBe('/');
		expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
	});

	it('refuses the double slash that is also another website', () => {
		expect(safeRedirectPath('//evil.example')).toBe('/');
	});

	it('refuses the backslash a browser reads as a second slash', () => {
		expect(safeRedirectPath('/\\evil.example')).toBe('/');
	});

	it('refuses a dot segment that normalises to a second slash', () => {
		expect(safeRedirectPath('/.//evil.example')).toBe('/');
		expect(safeRedirectPath('/a/..//evil.example')).toBe('/');
		expect(safeRedirectPath('/%2e//evil.example')).toBe('/');
		expect(safeRedirectPath('/./\\evil.example')).toBe('/');
		expect(safeRedirectPath('/./\\\\evil.example')).toBe('/');
	});

	it('refuses a path carrying a tab or a line break', () => {
		expect(safeRedirectPath('/\t/evil.example')).toBe('/');
		expect(safeRedirectPath('/conferences\n')).toBe('/');
	});

	it('answers the front page when there is nothing', () => {
		expect(safeRedirectPath(null)).toBe('/');
		expect(safeRedirectPath('')).toBe('/');
	});
});

describe('destinationAfterAuth', () => {
	it('sends the visitor back to the page they were heading for', () => {
		expect(destinationAfterAuth('/conferences/thimun-2027', '/welcome')).toBe(
			'/conferences/thimun-2027'
		);
	});

	it('uses the fallback when there was no such page', () => {
		expect(destinationAfterAuth(null, '/welcome')).toBe('/welcome');
		expect(destinationAfterAuth('', '/welcome')).toBe('/welcome');
	});

	it('uses the fallback when the page was on another website', () => {
		expect(destinationAfterAuth('https://evil.example', '/welcome')).toBe('/welcome');
	});
});

describe('parseAuthErrorReason', () => {
	it('keeps a reason it knows', () => {
		expect(parseAuthErrorReason('expired')).toBe('expired');
		expect(parseAuthErrorReason('used')).toBe('used');
	});

	it('treats anything else as an unreadable link', () => {
		expect(parseAuthErrorReason('nonsense')).toBe('invalid');
		expect(parseAuthErrorReason(null)).toBe('invalid');
	});
});

describe('describeAuthErrorReason', () => {
	it('has a different sentence for each reason', () => {
		const sentences = [
			describeAuthErrorReason('expired'),
			describeAuthErrorReason('used'),
			describeAuthErrorReason('invalid')
		];

		expect(new Set(sentences).size).toBe(3);
		expect(describeAuthErrorReason('expired')).toContain('expired');
	});
});

describe('authLinkDestination', () => {
	it('is the page the visitor is on', () => {
		expect(authLinkDestination('/conferences/northbridge-mun', null)).toBe(
			'/conferences/northbridge-mun'
		);
	});

	it('is the next that /login and /register already carry, not the page itself', () => {
		// Where "Apply as a delegate" leaves a signed-out visitor (T164).
		const applyPath = '/conferences/northbridge-mun/apply';

		expect(authLinkDestination('/login', applyPath)).toBe(applyPath);
		expect(authLinkDestination('/register', applyPath)).toBe(applyPath);
	});

	it('is nowhere in particular on /login and /register without a next', () => {
		expect(authLinkDestination('/login', null)).toBe('/');
		expect(authLinkDestination('/register', null)).toBe('/');
	});

	it('never hands on a next that points at another site', () => {
		expect(authLinkDestination('/login', '//evil.example')).toBe('/');
		expect(authLinkDestination('/register', 'https://evil.example')).toBe('/');
	});

	it('ignores a next on any other page', () => {
		expect(authLinkDestination('/conferences', '/manage')).toBe('/conferences');
	});
});

describe('passwordRecoveryState', () => {
	/** The moment the page is looked at, as the tests below count from it. */
	const NOW = new Date('2026-10-22T10:00:00Z');

	/** An `amr` entry as GoTrue writes it: the method and the time, in seconds. */
	function entry(method: string, secondsAgo: number) {
		return { method, timestamp: Math.floor(NOW.getTime() / 1000) - secondsAgo };
	}

	it('is recent for a reset link opened a moment ago', () => {
		// GoTrue v2.196 records a verified recovery link as `otp`; older and newer
		// versions have called it `recovery`, so both count.
		expect(passwordRecoveryState([entry('otp', 60)], NOW)).toBe('recent');
		expect(passwordRecoveryState([entry('recovery', 60)], NOW)).toBe('recent');
	});

	it('is still recent right at the end of the window, and for a clock a little ahead', () => {
		expect(passwordRecoveryState([entry('otp', PASSWORD_RECOVERY_WINDOW_SECONDS)], NOW)).toBe(
			'recent'
		);
		// The Docker clock has been seen ahead of this machine's (see hooks.server.ts).
		expect(passwordRecoveryState([entry('otp', -30)], NOW)).toBe('recent');
	});

	it('is stale once the window has passed', () => {
		expect(passwordRecoveryState([entry('otp', PASSWORD_RECOVERY_WINDOW_SECONDS + 1)], NOW)).toBe(
			'stale'
		);
		expect(passwordRecoveryState([entry('recovery', 60 * 60)], NOW)).toBe('stale');
	});

	it('is none for a session that never came from a reset link', () => {
		expect(passwordRecoveryState([entry('password', 10)], NOW)).toBe('none');
		expect(passwordRecoveryState([entry('password', 10), entry('oauth', 10)], NOW)).toBe('none');
		expect(passwordRecoveryState(undefined, NOW)).toBe('none');
		expect(passwordRecoveryState([], NOW)).toBe('none');
	});

	it('is none for entries that carry no time, because recency cannot be shown', () => {
		expect(passwordRecoveryState(['otp'], NOW)).toBe('none');
		expect(passwordRecoveryState([{ method: 'otp' }], NOW)).toBe('none');
		expect(passwordRecoveryState('otp', NOW)).toBe('none');
	});

	it('counts the newest reset among several sign-ins', () => {
		const amr = [entry('password', 3 * 60 * 60), entry('otp', 120)];

		expect(passwordRecoveryState(amr, NOW)).toBe('recent');
	});
});

describe('parseEmailLinkType', () => {
	it('keeps every kind of link Supabase sends', () => {
		for (const type of EMAIL_LINK_TYPES) {
			expect(parseEmailLinkType(type)).toBe(type);
		}
	});

	it('answers null for anything else', () => {
		expect(parseEmailLinkType('sms')).toBeNull();
		expect(parseEmailLinkType('')).toBeNull();
		expect(parseEmailLinkType(null)).toBeNull();
	});
});

describe('describeEmailLink', () => {
	it('names what pressing the button does for each kind of link', () => {
		expect(describeEmailLink('signup')).toEqual({
			title: 'Confirm your email address.',
			buttonLabel: 'Confirm email address'
		});
		expect(describeEmailLink('email_change')).toEqual({
			title: 'Confirm your new email address.',
			buttonLabel: 'Confirm email address'
		});
		expect(describeEmailLink('recovery')).toEqual({
			title: 'Reset your password.',
			buttonLabel: 'Choose a new password'
		});
		expect(describeEmailLink('magiclink')).toEqual({
			title: 'Log in to MUNMeet.',
			buttonLabel: 'Log in'
		});
	});

	it('has words for every kind of link', () => {
		for (const type of EMAIL_LINK_TYPES) {
			const words = describeEmailLink(type);

			expect(words.title).not.toBe('');
			expect(words.buttonLabel).not.toBe('');
		}
	});
});
