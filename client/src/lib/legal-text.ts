/**
 * The words of `/terms` and `/privacy`.
 *
 * They are data rather than markup for one reason: each page shows a contents
 * list of anchors down the side, and that list has to name the same sections,
 * in the same order, as the prose beside it. Keeping both in one array means a
 * teammate adding a section cannot forget the other half of the job, and it
 * keeps the two page files to about fifteen lines each.
 *
 * The text is a placeholder. `specs/07-delivery/open-questions.md` #12 says a
 * lawyer reviews both documents before MUNMeet sells anything in the EU, and
 * until then the first section of each says so in as many words. Everything
 * here describes honestly what the app really does today, which is what the
 * lawyer will start from.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import { accountSettingsUrl, CONTACT_EMAIL } from '$lib/urls';

/** One row of the privacy page's "Who sees it" table. */
export type LegalTableRow = {
	who: string;
	sees: string;
};

/** One `<h2>` section of a legal document. */
export type LegalSection = {
	/** What the contents list links to, such as `who-we-are`. Unique within a document. */
	id: string;
	heading: string;
	paragraphs: string[];
	/** Only the privacy page's "Who sees it" section has one. */
	table?: { columns: [string, string]; rows: LegalTableRow[] };
	/** One link under the paragraphs, such as "Go to your settings". */
	link?: { label: string; href: ResolvedPathname };
};

/**
 * The day each document last changed, written the way the page shows it.
 *
 * The wireframe in `specs/05-pages/public/legal.md` drew 15 September 2026, the
 * day the MVP scope was decided, but these words were written on the 17th, and
 * a legal document that claims to be older than it is starts off by being wrong
 * about itself. The wireframe was corrected to match. Change the date here
 * whenever the prose below changes.
 */
export const TERMS_LAST_UPDATED = '17 September 2026';

/** The day the privacy policy last changed. See `TERMS_LAST_UPDATED` above. */
export const PRIVACY_LAST_UPDATED = '17 September 2026';

/** The terms of service, in the order they are read. */
export const TERMS_SECTIONS: LegalSection[] = [
	{
		id: 'who-we-are',
		heading: 'Who we are',
		paragraphs: [
			'Before anything else: this document is a placeholder. A lawyer has not written it or checked it, and one will go over it before we sell anything in the European Union. What follows is an honest description of how MUNMeet works, written so that you can see what you are agreeing to, rather than finished legal drafting.',
			'MUNMeet is software for running Model United Nations conferences. Organisers use it to take applications, allocate seats, collect fees and chair committees. Delegates use it to apply, join a delegation and take part. These terms are the agreement between you and us about using it.',
			'Making an account means accepting them. If you would rather not, do not make one.'
		]
	},
	{
		id: 'accounts',
		heading: 'Accounts',
		paragraphs: [
			'You need an account to apply to a conference or to run one. Give your real name and an email address you actually check, because organisers use both to recognise you and to reach you about the conference you applied to.',
			// The minimum age of 13 is the default the spec assumes for open
			// question 13 in `specs/07-delivery/open-questions.md`, and
			// `05-pages/auth/welcome.md` states it too.
			'You have to be at least 13 to have an account of your own. If you are under 16, join through your school instead: a teacher makes the delegation, adds you to it, and takes responsibility for your registration and for the consent behind it.',
			'Your password is yours to look after. What happens under your account is your responsibility, so tell us straight away if you think somebody else has got into it.'
		]
	},
	{
		id: 'organisers-and-conferences',
		heading: 'Organisers and conferences',
		paragraphs: [
			'A conference on MUNMeet belongs to the organisation running it, not to us. Its organisers decide who is accepted, what the fees are, what the schedule says and what happens in the room.',
			'When you pay a conference fee you are paying that organisation. They are the merchant: they sell you a place at their conference and they owe you what they advertised. We are the platform their conference runs on, and the payment passes through us on its way to them.',
			'So questions about a conference go to its organisers. We can help with the software. We cannot accept you into a committee, change a fee or decide what a conference does.'
		]
	},
	{
		id: 'fees',
		heading: 'Fees',
		paragraphs: [
			'MUNMeet is free for delegates and for schools. Applying, joining a delegation, paying your fee and taking part cost you nothing beyond what the conference itself charges.',
			'Organisers pay us a small fixed amount for each delegate seat that is paid for by card through MUNMeet. A conference that charges no fees pays us nothing, and neither does a registration an organiser marks as paid themselves.',
			'If we change the amount, we tell organisers first, and the new amount applies to conferences created after that.'
		]
	},
	{
		id: 'payments-and-refunds',
		heading: 'Payments and refunds',
		paragraphs: [
			'Card payments are handled by Stripe. Your card details go to them and never reach us: we learn that an invoice was paid, not the number you paid it with. Stripe has its own terms, and they apply to the payment itself.',
			'Refunds are between you and the conference organisers. They set the policy, they decide, and the money comes back from them. We can only send it back the way it came in, once they have asked us to.',
			'If a conference is cancelled or changed, what happens to the fees already collected is for its organisers to say. Ask them first. Write to us if you cannot get an answer at all.'
		]
	},
	{
		id: 'content-you-upload',
		heading: 'Content you upload',
		paragraphs: [
			'Your position paper, your photograph, a background guide you wrote as a chair: what you upload stays yours. We claim nothing of it.',
			'You do give us permission to store it and to show it to the people the conference allows, which is usually your chairs, your organisers and the head of your delegation. That permission covers nothing else, and it lasts only as long as the file is on the platform.',
			'Upload only work you are allowed to share. If a document is not yours to give away, it does not belong here.'
		]
	},
	{
		id: 'acceptable-use',
		heading: 'Acceptable use',
		paragraphs: [
			'Behave the way you would in a committee room. No harassment, no abuse, no pretending to be another delegate, chair or organiser, and nothing against the law.',
			'Do not go looking for data that is not meant for you, do not attack the service, and do not use it to send people things they did not ask for.',
			'Conferences set rules of their own as well, and those count too. Breaking them is a matter for the organisers, who can remove somebody from their conference.'
		]
	},
	{
		id: 'termination',
		heading: 'Termination',
		paragraphs: [
			'You can delete your account whenever you like, from your settings. It takes your profile and your private details with it.',
			'We can suspend or close an account that breaks these terms, and organisers can remove somebody from their own conference without us being involved. Where we can, we say why first and give you a chance to put it right.',
			'If we ever stop running MUNMeet, we will give organisers enough warning to get their conferences out of it.'
		]
	},
	{
		id: 'liability',
		heading: 'Liability',
		paragraphs: [
			'We work to keep MUNMeet running and your data safe, but we cannot promise that the service is never interrupted, never slow and never wrong.',
			'We are not responsible for what a conference does: whether it accepts you, whether it goes ahead, whether it is any good. Those are matters for its organisers.',
			'None of this takes away rights the law gives you. Consumers in the European Union and elsewhere have protections that no agreement can sign away, and this one does not try to.'
		]
	},
	{
		id: 'changes',
		heading: 'Changes',
		paragraphs: [
			'We update this document when the product changes. The date at the top says when we last did.',
			'When a change matters to you, such as the fee or what you are agreeing to, we tell you before it takes effect, by email or in the app. Carrying on with MUNMeet afterwards means the new version applies.'
		]
	},
	{
		id: 'contact',
		heading: 'Contact',
		paragraphs: [
			`Write to us at ${CONTACT_EMAIL}. A person reads it, and the same person answers questions about the software.`,
			'Anything about a particular conference, such as a decision, a fee or a refund, is for its organisers. They will know the answer, and we would only be passing your message on.'
		]
	}
];

/** The privacy policy, in the order it is read. */
export const PRIVACY_SECTIONS: LegalSection[] = [
	{
		id: 'what-we-collect',
		heading: 'What we collect',
		paragraphs: [
			'This policy is a placeholder as well. It describes truthfully what MUNMeet does with your information today, but a lawyer has not been over it, and one will before we sell anything in the European Union. If something here is not clear, please ask us rather than guess.',
			'When you make an account we keep the name you give and your email address. Your profile holds whatever else you choose to put in it: your school or university, your country, your pronouns, how much MUN you have done and a short biography. Anyone signed in to MUNMeet can see that profile.',
			'A few things are private and are kept apart from it, where only the people who need them can look: your email address, your date of birth, your phone number, your dietary requirements and the name and phone number of your emergency contact.',
			'We also keep the answers you write in an application, the files you upload, such as your position paper, and whether an invoice has been paid. We never keep your card number. Stripe handles the payment and tells us only that it worked.'
		]
	},
	{
		id: 'why',
		heading: 'Why',
		paragraphs: [
			'For one reason: to run the conference you applied to. Organisers have to know who is coming, what they need and whether they have paid. Chairs have to know who is in their committee. You have to find your seat, your schedule and your papers.',
			'Your date of birth tells an organiser whether you meet the age limits of their conference. Your dietary requirements and your emergency contact are for the days of the conference itself, when somebody has to feed you or reach a parent.',
			'We do not sell your information and we do not advertise to you.'
		]
	},
	{
		id: 'who-sees-it',
		heading: 'Who sees it',
		paragraphs: [
			'Each conference sees only its own people. Applying to one conference shows nothing to another, and an organiser who never received an application from you can see no more of you than any other signed-in user can.',
			'Your public profile is the one exception, and it is worth being plain about: anyone signed in to MUNMeet can read it, whether or not you have ever been at a conference with them. Everything else below depends on what somebody does at a conference you applied to.'
		],
		// The four rows are the `profiles`, `profile_details`, `documents` and
		// `seats` rows of the policy matrix in
		// `specs/02-architecture/permissions.md`, said in plain words. Row Level
		// Security is what actually enforces them; this table only describes it.
		//
		// The last row is wider than `05-pages/public/legal.md` draws it. That
		// file says other participants see "name, institution and seat only",
		// but `permissions.md` gives `profiles` select to every signed-in
		// account, which is the whole public profile and is not limited to a
		// shared conference. Logged in `07-delivery/open-questions.md`.
		table: {
			columns: ['Who', 'What they see'],
			rows: [
				{
					who: 'Organisers of a conference you applied to',
					sees: 'Your profile, your private details and your answers to their questions.'
				},
				{
					who: 'Chairs of your committee',
					sees: 'Your name, your seat and your position paper.'
				},
				{
					who: 'The head of your delegation',
					sees: 'Your profile and your private details.'
				},
				{
					who: 'Other participants, and anyone else signed in',
					sees: 'Your public profile and, at a conference you are both at, which seat you hold. Never your private details.'
				}
			]
		}
	},
	{
		id: 'where-it-is-stored',
		heading: 'Where it is stored',
		paragraphs: [
			'Your data sits in a Supabase database and file store hosted in the European Union. Supabase runs those servers for us and does nothing of its own with what is on them.',
			'Payments go through Stripe, who keep their own record of each one, including the card details we never see. Stripe has its own privacy policy, and it applies to that record.',
			'Both are ordinary suppliers of ours, chosen in part because they keep European data in Europe.'
		]
	},
	{
		id: 'how-long',
		heading: 'How long',
		paragraphs: [
			'We keep your account and what is attached to it until you delete it. Deleting it from your settings takes your profile, your private details and your applications with it.',
			'If you have not signed in for three years we treat the account as abandoned and remove it, after writing to the address we have for you.',
			'Some records belong to a conference rather than to you, such as the fact that a seat was filled and a fee was paid. An organiser may keep those for their own accounts after your account has gone, without the private details that were attached to them.'
		]
	},
	{
		id: 'your-rights',
		heading: 'Your rights',
		paragraphs: [
			'You can see what we hold about you, correct it and delete it. Most of it you can do yourself: your profile page edits your details, and your settings page changes your email address, changes your password or deletes the account altogether.',
			'If you would rather we did it, or you want a copy of everything in one file, write to us and we will sort it out within a month, which is the time European law gives us.',
			'If you think we have handled your data badly you can complain to the data protection authority in your country. We would rather you told us first, so that we can put it right.'
		],
		link: { label: 'Go to your settings', href: accountSettingsUrl() }
	},
	{
		id: 'cookies',
		heading: 'Cookies',
		paragraphs: [
			'MUNMeet sets one kind of cookie: the one that keeps you signed in. Without it you would have to type your password on every page.',
			'There is no analytics, no advertising and nothing from anybody else tracking you here, which is why there is no cookie banner to click away.'
		]
	},
	{
		id: 'contact',
		heading: 'Contact',
		paragraphs: [
			`Write to us at ${CONTACT_EMAIL} about anything to do with your data: a question, a correction, a copy of what we hold, or a complaint.`,
			'We are a small team, so the person who reads your message is the person who can do something about it.'
		]
	}
];
