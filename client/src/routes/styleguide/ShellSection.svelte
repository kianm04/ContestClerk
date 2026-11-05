<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import SectionMenu from '$lib/components/SectionMenu.svelte';
	import AccountMenu from '$lib/components/shell/AccountMenu.svelte';
	import FlashToast from '$lib/components/shell/FlashToast.svelte';
	import NotificationBell from '$lib/components/shell/NotificationBell.svelte';
	import NotificationRow from '$lib/components/shell/NotificationRow.svelte';
	import PrimaryNavigation from '$lib/components/shell/PrimaryNavigation.svelte';
	import { signedInNavigationLinks } from '$lib/navigation';
	import { SAMPLE_FLASH, SAMPLE_NOTIFICATIONS, SAMPLE_NOW } from '$lib/styleguide-samples';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	// The links a signed-in organiser who has also applied somewhere sees. The
	// address is written the way `page.url.pathname` gives it to the real header,
	// so "Conferences" is the link underlined as the page being shown.
	const links = signedInNavigationLinks({ hasOrganiserArea: true, hasApplications: true });
	const activePathname = '/conferences';
</script>

<Group id="shell" title="App shell">
	<p class="text-body text-ink-600">
		The bar at the top of this page is <code>AppHeader</code> for a visitor, with
		<code>PrimaryNavigation</code> in a row and, on a phone, <code>MobileMenu</code>. The line at
		the bottom is <code>AppFooter</code>. The pieces a visitor never sees are below.
	</p>

	<Example name="PrimaryNavigation" props="links, pathname, direction='column'">
		<PrimaryNavigation {links} pathname={activePathname} direction="column" />
	</Example>

	<Example name="SectionMenu" props="label, icon, children · opens without JavaScript">
		<SectionMenu label="Dashboard" icon={LayoutDashboard}>
			<PrimaryNavigation {links} pathname={activePathname} direction="column" />
		</SectionMenu>
	</Example>

	<Example name="AccountMenu" props="person · opens with JavaScript">
		<AccountMenu person={{ fullName: 'Daniel Perez', avatarPath: null }} />
	</Example>

	<Example
		name="NotificationBell"
		props="notifications, unreadCount=1, now · opens with JavaScript"
	>
		<NotificationBell notifications={SAMPLE_NOTIFICATIONS} unreadCount={1} now={SAMPLE_NOW} />
	</Example>

	<Example name="NotificationRow" props="notification, now (unread, then read)">
		<!--
			A block rather than a grid: a grid item grows to fit a body line that
			`truncate` should have cut short, and pushes a phone screen sideways.
		-->
		<div class="space-y-2">
			<!-- The `(notification.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each SAMPLE_NOTIFICATIONS as notification (notification.id)}
				<NotificationRow {notification} now={SAMPLE_NOW} />
			{/each}
		</div>
	</Example>

	<Example name="NotificationRow" props="notification, now, isCompact (the bell's row)">
		<NotificationRow notification={SAMPLE_NOTIFICATIONS[0]} now={SAMPLE_NOW} isCompact />
	</Example>

	<Example name="FlashToast" props="flash · gone after five seconds when JavaScript runs">
		<!-- The same box as the `Toast` examples, which keeps the fixed toast inside it. -->
		<div class="relative h-16 transform-gpu">
			<FlashToast flash={SAMPLE_FLASH} />
		</div>
	</Example>
</Group>
