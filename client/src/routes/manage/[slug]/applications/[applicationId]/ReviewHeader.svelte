<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ApplicationStatus } from '$lib/applications';
	import { formatConferenceDay } from '$lib/conferences';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		applicantName: string;
		avatarPath: string | null;
		/** The status as the page shows it, with any press still on its way laid on top. */
		status: ApplicationStatus;
		submittedAt: string | null;
		/** The conference's timezone, which the submitted day is told in. */
		timezone: string;
	};

	let { applicantName, avatarPath, status, submittedAt, timezone }: Props = $props();

	// `$derived` works each of these out again whenever the props change.
	const statusText = $derived(statusLabel('application_status', status));
	const statusTone = $derived(statusBadgeTone('application_status', status));
	const submittedLine = $derived(
		submittedAt === null ? undefined : `Submitted ${formatConferenceDay(submittedAt, timezone)}`
	);
</script>

<!-- The applicant's picture stays beside their name, where it was before the redesign. -->
<div class="flex items-start gap-4">
	<Avatar name={applicantName} imagePath={avatarPath} size="lg" />
	<div class="min-w-0 flex-1">
		<ManageHeader title={applicantName} summary={submittedLine}>
			<StatusDot text={statusText} tone={statusTone} />
		</ManageHeader>
	</div>
</div>
