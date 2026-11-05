/**
 * Organisations: the shapes every page that shows one reads, and the checks its
 * two forms have to pass.
 *
 * The top half is the "Create a conference" page's step 2, where the visitor
 * picks the organisation that will run the conference. The bottom half is the
 * organisation's own settings page.
 *
 * Nothing in here talks to Supabase or to Svelte. Reading and saving
 * organisations happens in `$lib/server/organizations.ts`.
 */

import { validateEmail } from '$lib/auth';
import { addHttpsIfMissing, isWebAddress } from '$lib/conference-details';
import { isCountryCode } from '$lib/countries';
import type { Database } from '$lib/database.types';
import { statusLabel } from '$lib/status';

/** An organization the signed-in visitor belongs to. */
export type Organization = {
	id: string;
	name: string;
};

/**
 * An organization as its own public page shows it, which
 * `getOrganizationPage` in `$lib/server/organizations.ts` fills in from the
 * database row.
 *
 * It lives here rather than beside that function because the page's header
 * component needs the same shape, and a component may not import from
 * `$lib/server` at all, not even a type. One definition both sides share cannot
 * drift apart. `created_by` is deliberately not here: the page file says who
 * created an organization is never displayed.
 */
export type PublicOrganization = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	/** Two letters, such as `NL`, or nothing when the organization gave no country. */
	countryCode: string | null;
	/** The English name of that country, worked out on the server so the page does not have to. */
	countryName: string | null;
	/** Already checked to be a real `http(s)` address, or nothing. */
	websiteUrl: string | null;
	/** Where the logo sits in the `public-media` bucket. */
	logoPath: string | null;
};

/**
 * An organisation as the organiser area lists it, which `loadManageIndex` in
 * `$lib/server/manage.ts` fills in from the database row.
 *
 * It lives here rather than beside that function for the same reason
 * `PublicOrganization` above gives: the components that draw the organiser area
 * need the same shape, and a component may not import from `$lib/server` at
 * all, not even a type.
 */
export type ManagedOrganization = {
	id: string;
	name: string;
	slug: string;
	/** Where the logo sits in the `public-media` bucket, or nothing. */
	logoPath: string | null;
	/** True once Stripe Connect onboarding finished. When false the page warns. */
	isStripeConnected: boolean;
};

/**
 * The value of the "+ New organization" radio button. Real organization ids are
 * uuids, such as `9b2f...-...`, so they can never be mistaken for it.
 */
export const NEW_ORGANIZATION = 'new';

/** What the visitor chose on step 2. */
export type OrganizationChoice = {
	/** The id of one of their organizations, `NEW_ORGANIZATION`, or '' when nothing is picked. */
	selectedOrganization: string;
	/** Only used when `selectedOrganization` is `NEW_ORGANIZATION`. */
	newOrganizationName: string;
};

/** What step 2 shows before the visitor has chosen anything. */
export const EMPTY_ORGANIZATION_CHOICE: OrganizationChoice = {
	selectedOrganization: '',
	newOrganizationName: ''
};

/** Read step 2's choice from a submitted form. */
export function readOrganizationChoice(formData: FormData): OrganizationChoice {
	return {
		selectedOrganization: String(formData.get('selectedOrganization') ?? '').trim(),
		newOrganizationName: String(formData.get('newOrganizationName') ?? '').trim()
	};
}

/**
 * Which organisation step 2 starts on: whatever was chosen before, or else the
 * reader's only organisation when they have exactly one, so that step 2 costs a
 * click rather than a decision. With several to choose from, nothing is chosen.
 */
export function startingOrganization(
	selectedOrganization: string,
	organizations: Organization[]
): string {
	if (selectedOrganization !== '') {
		return selectedOrganization;
	}

	if (organizations.length === 1) {
		return organizations[0].id;
	}

	return '';
}

/**
 * Check step 2. Returns a message to show the visitor, or `null` when the choice is fine.
 *
 * `myOrganizations` must come from the database, never from the form. Anybody can
 * edit a form before sending it, so a submitted id is only trusted once it turns up
 * among the visitor's own organizations. The database checks this as well, but
 * checking here gives the visitor a readable message instead of an error page.
 */
export function validateOrganizationChoice(
	choice: OrganizationChoice,
	myOrganizations: Organization[]
): string | null {
	if (choice.selectedOrganization === NEW_ORGANIZATION) {
		if (choice.newOrganizationName === '') {
			return 'Please enter the name of your organisation.';
		}

		if (choice.newOrganizationName.length > ORGANIZATION_NAME_MAX_LENGTH) {
			return `Please keep the organisation's name under ${ORGANIZATION_NAME_MAX_LENGTH} characters.`;
		}

		return null;
	}

	if (choice.selectedOrganization === '') {
		return 'Please pick an organization, or create a new one.';
	}

	const isOneOfMine = myOrganizations.some(
		(organization) => organization.id === choice.selectedOrganization
	);

	if (!isOneOfMine) {
		return 'You are not a member of that organization. Please pick another one.';
	}

	return null;
}

/*
 * Everything below belongs to the organisation's own settings page,
 * `/manage/organizations/[orgSlug]`, which `05-pages/organiser/organization-settings.md`
 * describes: the organisation's public details, the people in it, the
 * invitations nobody has accepted yet, and the Stripe account its conferences
 * collect delegate fees through. Fetching and saving all of that is
 * `$lib/server/organizations.ts`'s job. This half only holds the shapes those
 * queries fill in and the checks the page's two forms have to pass, so that
 * both can be read and tested without knowing any Svelte, and so that the
 * components have the shapes at all: a component may not import from
 * `$lib/server`, not even a type.
 *
 * `$lib/team.ts` holds the same kind of thing for a conference's team, and the
 * two do not import each other. An invitation there hands somebody a job on one
 * conference; an invitation here hands them a place in the organisation that
 * runs every one of them.
 */

/** A role in an organisation: `owner`, `admin` or `member`. */
export type OrganizationRole = Database['public']['Enums']['organization_role'];

/**
 * The three roles from the most powerful to the least.
 *
 * The order is the page's ranking as well as the list of allowed words:
 * `sortOrganizationMembers` reads a member's rank straight off this array, and
 * `memberRoleOptions` offers the roles in this order.
 */
export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member'];

/**
 * One role in the shape a `SelectField` takes.
 *
 * The words come from `$lib/status`, which already has one for every value of
 * every enum, so a dropdown here and a badge on a member's row cannot disagree.
 */
function roleOption(role: OrganizationRole): { value: string; label: string } {
	return { value: role, label: statusLabel('organization_role', role) };
}

/**
 * How far the organisation has got with Stripe Connect: `none` means there is
 * no Stripe account yet, `pending` that an account was made but its onboarding
 * is unfinished, and `connected` that it can take payments.
 *
 * `02-architecture/payments.md` explains the three. The page shows a different
 * card for each one, which is why this is a state and not just a boolean.
 */
export type StripeConnectionState = 'none' | 'pending' | 'connected';

/** The organisation as its settings page shows it, and as its details form edits it. */
export type OrganizationSettings = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	/** Two letters, such as `NL`, or nothing when the organisation gave no country. */
	countryCode: string | null;
	/** The English name of that country, worked out on the server so the page does not have to. */
	countryName: string | null;
	/** Already checked to be a real `http(s)` address, or nothing. */
	websiteUrl: string | null;
	/** Where the logo sits in the `public-media` bucket, or nothing. */
	logoPath: string | null;
	stripeState: StripeConnectionState;
};

/** One person in the organisation, as a row of the members table. */
export type OrganizationMember = {
	userId: string;
	fullName: string;
	avatarPath: string | null;
	role: OrganizationRole;
	/**
	 * True for the signed-in reader's own row. Their own row says "Leave
	 * organisation" rather than "Remove", because leaving something yourself and
	 * throwing somebody else out are not the same act even though they are the
	 * same database change.
	 */
	isMe: boolean;
};

/** One invitation to join the organisation that nobody has accepted yet. */
export type PendingOrganizationInvite = {
	id: string;
	/** The secret in the `/invites/[token]` link the page shows, because email is Phase 2. */
	token: string;
	email: string;
	role: OrganizationRole;
	/** An ISO timestamp. */
	expiresAt: string;
};

/**
 * May somebody with this role change anything on the settings page? Owners and
 * admins may; a plain member sees the same page with every form replaced by
 * plain text.
 *
 * This only decides what the page draws. `requireOrganizationAdmin` in
 * `$lib/server/access.ts` and the database's own policies decide what may
 * actually be saved, and they are the checks that matter: a form somebody posts
 * without ever loading the page never comes past this function.
 */
export function isOrganizationAdmin(role: OrganizationRole): boolean {
	return role === 'owner' || role === 'admin';
}

/**
 * Which of the three states the organisation's two Stripe columns add up to.
 *
 * Whether there is an account is looked at first: with none there is nothing
 * to continue and nothing to open, whatever else the row happens to say.
 * `stripe_onboarding_completed_at` is only ever filled in for an account that
 * exists, so the two can only disagree if a row were edited by hand.
 *
 * It takes a yes or no rather than the account id, because the id itself is
 * the admin's alone (the `organization_private_settings` view hands a plain
 * member only `has_stripe_account`) and a page never needs more than the fact.
 */
export function stripeConnectionState(
	hasStripeAccount: boolean,
	completedAt: string | null
): StripeConnectionState {
	if (!hasStripeAccount) {
		return 'none';
	}

	if (completedAt === null) {
		return 'pending';
	}

	return 'connected';
}

/**
 * The roles the reader may put somebody else on, in the shape a `SelectField`
 * takes.
 *
 * Only an owner may hand `owner` out or take it back, so everybody else is
 * offered Admin and Member alone. That includes a plain member, who never sees
 * this dropdown at all because `isOrganizationAdmin` above decides whether the
 * page draws it; the list is not a permission, only the choices in a box.
 *
 * The database has the last word either way: `prevent_last_owner_removal`
 * refuses the change that would leave an organisation with no owner, however
 * the form got sent.
 */
export function memberRoleOptions(myRole: OrganizationRole): { value: string; label: string }[] {
	if (myRole === 'owner') {
		return ORGANIZATION_ROLES.map(roleOption);
	}

	const rolesWithoutOwner = ORGANIZATION_ROLES.filter((role) => role !== 'owner');

	return rolesWithoutOwner.map(roleOption);
}

/** Where a role sits in `ORGANIZATION_ROLES`: 0 for an owner, 1 for an admin, 2 for a member. */
function organizationRoleRank(role: OrganizationRole): number {
	return ORGANIZATION_ROLES.indexOf(role);
}

/**
 * The members in the order the table lists them: owners first, then admins,
 * then everybody else, and within one role by name.
 *
 * The order is worked out here rather than asked of the database because it is
 * a rule about what the roles mean — an owner outranks an admin — and `order by
 * role` in Postgres would give the three words alphabetically, putting the
 * admins above the owners.
 *
 * It sorts a copy, because the array a `load` function returns is handed
 * straight to the page and sorting in place would change what the caller holds.
 * `localeCompare` puts a name like "Ávila" where a reader expects it rather
 * than after "Z".
 */
export function sortOrganizationMembers(members: OrganizationMember[]): OrganizationMember[] {
	return [...members].sort((first, second) => {
		const rankDifference = organizationRoleRank(first.role) - organizationRoleRank(second.role);

		if (rankDifference !== 0) {
			return rankDifference;
		}

		return first.fullName.localeCompare(second.fullName);
	});
}

/**
 * True once the invitation's `expiresAt` is behind `now`.
 *
 * The moment itself counts as expired, which is what `accept_invite` in the
 * database does (`expires_at <= now()`), so the page never offers a link for an
 * invitation the database would refuse a second later.
 *
 * `now` is given rather than read from the clock, because a pure function may
 * not read the clock.
 */
export function isOrganizationInviteExpired(invite: PendingOrganizationInvite, now: Date): boolean {
	return new Date(invite.expiresAt).getTime() <= now.getTime();
}

/** The longest an organisation's name may be, matching the field's `maxLength`. */
export const ORGANIZATION_NAME_MAX_LENGTH = 120;

/** The longest the description may be. It introduces the organisation; it is not its history. */
export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 1000;

/** The longest a home city may be. Generous for a city's name; the `organizations` table checks the same. */
export const ORGANIZATION_CITY_MAX_LENGTH = 120;

/** The largest logo the details form takes, in megabytes. `02-architecture/storage.md`. */
export const ORGANIZATION_LOGO_MAX_SIZE_MB = 5;

/** That same limit in bytes, which is the unit a file measures itself in. */
const ORGANIZATION_LOGO_MAX_SIZE_BYTES = ORGANIZATION_LOGO_MAX_SIZE_MB * 1024 * 1024;

/** The three picture types the `public-media` bucket accepts, one per entry. */
const ORGANIZATION_LOGO_ACCEPTED_TYPE_LIST = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Those same three types, written the way the HTML `accept` attribute wants
 * them: one string with commas in it.
 */
export const ORGANIZATION_LOGO_ACCEPTED_TYPES = ORGANIZATION_LOGO_ACCEPTED_TYPE_LIST.join(',');

/**
 * What the details form holds, as plain text.
 *
 * Every field is text, because that is what a form sends and what an input
 * shows. An empty box means "no value": the server turns '' into `null` before
 * it saves, so a cleared description becomes nothing rather than an empty
 * string sitting in the column. A refused form is drawn again from these exact
 * values, so the organiser sees what they typed.
 */
export type OrganizationDetailsValues = {
	name: string;
	description: string;
	/** A two-letter country code, such as `NL`, or '' for no country. */
	countryCode: string;
	/** Optional. When filled in, it starts with `http://` or `https://` (see `readOrganizationDetails`). */
	websiteUrl: string;
};

/**
 * A message for each field that needs fixing. A field that is fine has no
 * entry, so counting the keys answers "is anything wrong".
 *
 * `logo` is here but `validateOrganizationDetails` never sets it: the picture
 * arrives as a file rather than as text, so the form action checks it with
 * `validateOrganizationLogo` below and puts the message it gets back here.
 */
export type OrganizationDetailsErrors = {
	name?: string;
	description?: string;
	countryCode?: string;
	websiteUrl?: string;
	logo?: string;
};

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Read the details form's four fields from a submitted form. */
export function readOrganizationDetails(formData: FormData): OrganizationDetailsValues {
	return {
		name: readText(formData, 'name'),
		description: readText(formData, 'description'),
		// Codes are stored in capitals, so `nl` from an edited form still works.
		countryCode: readText(formData, 'countryCode').toUpperCase(),
		websiteUrl: addHttpsIfMissing(readText(formData, 'websiteUrl'))
	};
}

/**
 * Check the details form and collect every problem at once, so the organiser
 * sees all of them rather than one per attempt.
 *
 * Lengths are measured after trimming, because trimmed text is what the server
 * saves. The country and the website are optional, so only a value somebody
 * actually filled in can be wrong about them. A field gets at most one message,
 * the first thing wrong with it, so the page never draws two lines under one
 * box.
 */
export function validateOrganizationDetails(
	values: OrganizationDetailsValues
): OrganizationDetailsErrors {
	const errors: OrganizationDetailsErrors = {};
	const name = values.name.trim();

	if (name === '') {
		errors.name = 'Please enter a name.';
	} else if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
		errors.name = `Please keep the name under ${ORGANIZATION_NAME_MAX_LENGTH} characters.`;
	}

	if (values.description.trim().length > ORGANIZATION_DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${ORGANIZATION_DESCRIPTION_MAX_LENGTH} characters.`;
	}

	const countryCode = values.countryCode.trim();

	if (countryCode !== '' && !isCountryCode(countryCode)) {
		errors.countryCode = 'Please pick a country.';
	}

	const websiteUrl = values.websiteUrl.trim();

	if (websiteUrl !== '' && !isWebAddress(websiteUrl)) {
		errors.websiteUrl = 'Please enter a web address, such as www.example.org.';
	}

	return errors;
}

/**
 * What is wrong with the logo somebody chose, or `null` when the file is fine.
 *
 * It is given the two facts it needs rather than the whole `File`, so that a
 * test can describe a six megabyte picture without building one.
 *
 * The type is looked at first, so that a six megabyte PDF is told it is the
 * wrong kind of file rather than too big a one. There is no message of its own
 * for "you chose nothing", because an empty file box still posts a file: one of
 * no size whose type is not one of the three, which the type message answers
 * like any other wrong file. The form action therefore has to leave an
 * untouched box out rather than ask about it. `validateAvatarFile` in
 * `$lib/profiles.ts` checks a profile picture the same way.
 */
export function validateOrganizationLogo(file: { type: string; size: number }): string | null {
	if (!ORGANIZATION_LOGO_ACCEPTED_TYPE_LIST.includes(file.type)) {
		return 'Please upload a JPEG, PNG or WebP image.';
	}

	if (file.size > ORGANIZATION_LOGO_MAX_SIZE_BYTES) {
		return `The logo must be under ${ORGANIZATION_LOGO_MAX_SIZE_MB} MB.`;
	}

	return null;
}

/** Did the details form turn up any problem at all, the logo included? */
export function hasOrganizationDetailsErrors(errors: OrganizationDetailsErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * What the invitation form holds, as plain text.
 *
 * `role` is a `string` rather than an `OrganizationRole`, because a form can
 * send anything at all; `validateInviteMember` is what decides it is one of the
 * two the form offers.
 */
export type InviteMemberValues = {
	email: string;
	role: string;
};

/** A message for each field of the invitation form that needs fixing. */
export type InviteMemberErrors = {
	email?: string;
	role?: string;
};

/**
 * What the invitation form shows before anything is typed.
 *
 * Member is the role it starts on, because it is the one that can change the
 * least: somebody invited by mistake as a member cannot edit the organisation
 * or spend its money.
 */
export const EMPTY_INVITE_MEMBER: InviteMemberValues = {
	email: '',
	role: 'member'
};

/**
 * The two roles an invitation may offer, in the shape a `SelectField` takes.
 *
 * `owner` is deliberately not among them. An organisation gets a second owner
 * by somebody joining first and an existing owner raising them afterwards, so
 * that ownership is never handed to an address that was mistyped.
 */
export const INVITE_MEMBER_ROLE_OPTIONS: { value: string; label: string }[] =
	ORGANIZATION_ROLES.filter((role) => role !== 'owner').map(roleOption);

/** Read the invitation form's two fields from a submitted form. */
export function readInviteMember(formData: FormData): InviteMemberValues {
	return {
		email: readText(formData, 'email'),
		role: readText(formData, 'role')
	};
}

/**
 * Check the invitation form. Both problems are collected at once rather than
 * stopping at the first.
 *
 * The role is checked against the options the form itself offers, so `owner`
 * is refused here exactly as it is missing from the dropdown.
 */
export function validateInviteMember(values: InviteMemberValues): InviteMemberErrors {
	const errors: InviteMemberErrors = {};
	const emailMessage = validateEmail(values.email);

	if (emailMessage !== null) {
		errors.email = emailMessage;
	}

	const isOfferedRole = INVITE_MEMBER_ROLE_OPTIONS.some((option) => option.value === values.role);

	if (!isOfferedRole) {
		errors.role = 'Please pick a role.';
	}

	return errors;
}

/** Did the invitation form turn up any problem at all? */
export function hasInviteMemberErrors(errors: InviteMemberErrors): boolean {
	return Object.keys(errors).length > 0;
}
