<script lang="ts">
	import { authLinkDestination } from '$lib/auth';
	import {
		isConferenceDirectory,
		signedInNavigationLinks,
		visitorNavigationLinks
	} from '$lib/navigation';
	import type { Notification } from '$lib/notifications';
	import { LOGO_IMAGE_PATH, LOGO_MARK_IMAGE_PATH } from '$lib/media';
	import { landingUrl, signedInHomeUrl } from '$lib/urls';
	import AccountMenu from './AccountMenu.svelte';
	import HeaderSearch from './HeaderSearch.svelte';
	import MobileMenu from './MobileMenu.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import PrimaryNavigation from './PrimaryNavigation.svelte';
	import VisitorActions from './VisitorActions.svelte';

	type Props = {
		/** The signed-in person, or nothing at all for a visitor. */
		person: { fullName: string; avatarPath: string | null } | null;
		/** The latest few notifications for the bell. Empty for a visitor. */
		notifications: Notification[];
		unreadCount: number;
		/** The moment the page was built, passed on to the bell's rows. */
		now: Date;
		/** The address of the page being shown, so the right link is underlined. */
		pathname: string;
		/**
		 * The `?next=` of the page being shown, or null. `/login` and `/register`
		 * carry one, and a visitor's "Log in" and "Sign up" pass it on.
		 */
		nextParameter: string | null;
		/**
		 * Whether this person belongs to an organisation or organises a
		 * conference. `03-design/app-shell.md` shows the "Manage" link only to
		 * somebody who does.
		 */
		hasOrganiserArea: boolean;
		/**
		 * Whether this person has an application or a delegation membership. The
		 * "Applications" link is only shown to somebody who does.
		 */
		hasApplications: boolean;
	};

	let {
		person,
		notifications,
		unreadCount,
		now,
		pathname,
		nextParameter,
		hasOrganiserArea,
		hasApplications
	}: Props = $props();

	// `$derived` works these out again whenever the person changes, which happens
	// as soon as somebody signs in or out.
	const links = $derived(
		person
			? signedInNavigationLinks({ hasOrganiserArea, hasApplications })
			: visitorNavigationLinks()
	);

	// The logo goes to the dashboard for somebody signed in and to the front page
	// for a visitor, which is what `03-design/app-shell.md` draws.
	const logoHref = $derived(person ? signedInHomeUrl() : landingUrl());

	// Where a visitor comes back to after logging in or creating an account. Both
	// buttons carry the same place, so neither way in loses it (T164).
	const authDestination = $derived(authLinkDestination(pathname, nextParameter));

	// The conference directory's own filter form is that page's search, so the
	// bar leaves its box out there rather than show two "Search conferences".
	// Every other page keeps it, `/home` included: its "Find a conference" is a
	// button, not a second box.
	const showsSearch = $derived(!isConferenceDirectory(pathname));
</script>

<!--
	`sticky top-0` keeps the bar on screen while the page scrolls under it.

	The top bar of docs/DESIGN.md, "The shell": white, opaque, with a hairline
	under it, the same on every page and at every scroll position. The logo and
	the navigation sit on the left, the account on the right. It runs the whole
	width of the window, so an organiser's sidebar starts right under its left
	end.
-->
<header class="sticky top-0 z-20 border-b bg-background print:hidden">
	<div class="flex h-16 items-center gap-2 px-4 md:gap-4 md:px-6">
		<!--
			The links live in here on a phone and a tablet, and in the bar itself
			from `lg` (1024px) up. At 768px six links measure about 570px and
			ran under the bell and the account menu.
		-->
		<MobileMenu {links} {pathname} />

		<!--
			A phone shows the square mark and anything wider shows the full logo:
			`md:hidden` takes the first away from `md` up, `hidden md:block` brings
			the second in at the same point. Only one is ever on screen, so the link's
			name lives in `aria-label` rather than in either picture's `alt`.
			The pictures are sized by height so they fit the bar, and `w-auto` keeps
			their shape.
		-->
		<a href={logoHref} aria-label="MUNMeet" class="flex shrink-0 items-center">
			<img src={LOGO_MARK_IMAGE_PATH} alt="" class="h-12 w-auto md:hidden" />
			<img src={LOGO_IMAGE_PATH} alt="" class="hidden h-16 w-auto md:block" />
		</a>

		<!--
			`self-stretch` gives the navigation the bar's full height, so the line
			under the page being read sits on the bar's own bottom edge.
		-->
		<nav aria-label="Main" class="hidden self-stretch lg:flex">
			<PrimaryNavigation {links} {pathname} direction="row" />
		</nav>

		<div class="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 md:gap-2">
			{#if person}
				{#if showsSearch}
					<HeaderSearch />
				{/if}

				<NotificationBell {notifications} {unreadCount} {now} />

				<AccountMenu {person} />
			{:else}
				<VisitorActions {authDestination} {showsSearch} />
			{/if}
		</div>
	</div>
</header>
