export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
};

export const legalLastUpdated = 'July 27, 2026';

// These versions are the server-enforced record of the documents a member
// accepted. Bump the applicable value whenever the corresponding document is
// materially revised. The reservation service then asks every member to
// accept the newer version before another booking can be made.
export const legalDocumentVersions = {
  termsOfService: '2026-07-27',
  liabilityWaiver: '2026-07-27',
} as const;

export const legalDocuments: LegalDocument[] = [
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    summary: 'The basic terms for using ROVAH as a guest, host, or visitor.',
    sections: [
      { heading: 'Using ROVAH', paragraphs: ['ROVAH is a marketplace that helps dog owners find private spaces and helps hosts present spaces they choose to make available. ROVAH is not the owner, operator, insurer, or manager of a host property unless ROVAH says so in writing.'] },
      { heading: 'Acceptance and accounts', paragraphs: ['By creating an account, booking a visit, listing a space, or using ROVAH, you agree to these Terms and the documents in this Legal Library. You must provide accurate account information, keep your credentials secure, and use the app only for lawful purposes.'] },
      { heading: 'Bookings, payments, and messages', paragraphs: ['A reservation is for the listed property, date, time, and dogs selected in the app. Payment, when available, is processed through Stripe. Keep messages, reviews, and listing information honest, relevant, and respectful.'] },
      { heading: 'What is not guaranteed', paragraphs: ['Listings, reviews, member profiles, availability, maps, and messages are provided by users or service providers. ROVAH does not guarantee that any listing, person, dog, property condition, availability, payment, or communication will meet a particular expectation.'] },
      { heading: 'Changes, disputes, and contact', paragraphs: ['ROVAH may update features or these documents as the service develops. If you have a concern, use in-app Help & Support or the contact information in the applicable document. These baseline terms should be reviewed by a qualified attorney before commercial launch.'] },
    ],
  },
  {
    slug: 'liability-waiver-release',
    title: 'ROVAH Guest Liability Waiver and Release',
    summary: 'Please read before joining ROVAH. This agreement applies to every visit made through the ROVAH platform unless replaced by a newer version.',
    sections: [
      { heading: '1. Inherent risks', paragraphs: ['I understand that dogs are unpredictable and that visiting private property involves inherent risks, including but not limited to dog bites, scratches, falls, uneven terrain, wildlife, insects, water hazards, fences, equipment, weather conditions, and other natural or man-made hazards.'] },
      { heading: '2. Voluntary assumption of risk', paragraphs: ['I voluntarily choose to participate in these activities and knowingly assume all risks associated with entering and using any property listed on ROVAH.'] },
      { heading: '3. Responsibility for people and dogs', paragraphs: ['I accept full responsibility for myself, my dog(s), my family members, my guests, and any minors accompanying me.'] },
      { heading: '4. Dog ownership and suitability', paragraphs: ['I certify that my dog is legally owned or under my care, is appropriately vaccinated as required by applicable law, and is suitable for off-leash activities.'] },
      { heading: '5. Supervision and site rules', paragraphs: ['I agree to maintain control of my dog at all times, immediately clean up after my dog, and comply with all rules established by the property owner.'] },
      { heading: '6. Financial responsibility', paragraphs: ['I accept full financial responsibility for any injuries, damages, losses, or claims caused by me, my dog, or anyone accompanying me.'] },
      { heading: '7. Release of liability', paragraphs: ['To the fullest extent permitted by applicable law, I release and forever discharge ROVAH, its owners, officers, employees, affiliates, contractors, hosts, property owners, agents, successors, and assigns from any and all claims, liabilities, demands, damages, costs, expenses, attorney fees, or causes of action arising out of or relating to my use of the ROVAH platform or any host property, including claims arising from ordinary negligence.'] },
      { heading: '8. Indemnification', paragraphs: ['I agree to defend, indemnify, and hold harmless ROVAH and all property owners from any third-party claims arising from my actions, my dog\'s actions, or the actions of anyone accompanying me.'] },
      { heading: '9. Independent marketplace', paragraphs: ['I understand that ROVAH does not own, inspect, supervise, control, or guarantee the safety or condition of any property listed on the platform. Property owners are independent users of the marketplace.'] },
      { heading: '10. Duration', paragraphs: ['I understand that this waiver applies to every visit made through the ROVAH platform unless replaced by a newer version.'] },
      { heading: '11. Severability', paragraphs: ['If any portion of this agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.'] },
      { heading: '12. Interpretation', paragraphs: ['I understand that this agreement is intended to be interpreted as broadly as permitted under applicable law.'] },
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    summary: 'How ROVAH handles information used to operate accounts, listings, reservations, and support.',
    sections: [
      { heading: 'Information we collect', paragraphs: ['ROVAH may collect account and contact information, parent and dog profile details, property and listing information, reservation details, messages and reviews, and approximate location information when you choose to use location-based features. Payment information is handled by the payment processor rather than stored as card data in the app.'] },
      { heading: 'How information is used', paragraphs: ['We use information to create and secure accounts, display listings, manage reservations, support messages and reviews, provide requested features, respond to support requests, protect the service, and improve the app.'] },
      { heading: 'Optional text messages', paragraphs: ['When you separately choose text message updates, ROVAH may send messages about reservations, account updates, and messages. Consent is not required to use ROVAH. Message frequency varies and message and data rates may apply. Reply STOP to opt out or HELP for help. Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes.'] },
      { heading: 'Sharing and service providers', paragraphs: ['Information is shared only as needed for the marketplace experience. For example, a host receives reservation details needed for a visit, and a guest receives listing information needed to evaluate a space. ROVAH may use providers for hosting, authentication, storage, maps, and payment processing.'] },
      { heading: 'Retention, security, and choices', paragraphs: ['We keep information for as long as reasonably needed to operate the service, meet recordkeeping needs, resolve disputes, and protect the platform. We use technical and organizational safeguards, but no online service can promise absolute security. You can update profile information in the app and may contact ROVAH about access, correction, or deletion requests.'] },
      { heading: 'California privacy information where applicable', paragraphs: ['Where applicable, California residents may have rights to know, delete, or correct personal information; to opt out of certain sale or sharing; to limit certain sensitive-information uses; and to receive non-discriminatory treatment for exercising privacy rights. ROVAH does not represent in this baseline notice that every right applies to every person or that a specific request method is available in every circumstance.'] },
      { heading: 'Questions', paragraphs: ['For privacy questions or requests, contact privacypolicy@k9country.net. This policy is a baseline document for attorney review before a broader public launch.'] },
    ],
  },
  {
    slug: 'host-terms-responsibilities',
    title: 'Host Terms and Responsibilities',
    summary: 'What hosts agree to when offering a private space through ROVAH.',
    sections: [
      { heading: 'Accurate listings', paragraphs: ['Hosts are responsible for providing accurate, current information about their property, including access, parking, amenities, rules, photos, availability, pricing, and material safety details. A host should list only property they are authorized to make available.'] },
      { heading: 'Managing a site', paragraphs: ['Hosts control their own listed availability, property rules, and pricing through the tools ROVAH provides. Hosts should keep a site reasonably maintained, communicate practical changes promptly, and update a listing when its conditions change.'] },
      { heading: 'Guest communication and tools', paragraphs: ['Hosts may use ROVAH messaging, site-specific broadcasts, subscriptions, promotions, guest reviews, and courtesy tools only for legitimate property and reservation purposes. Hosts must not use these tools to harass, discriminate against, or collect unnecessary personal information from guests.'] },
      { heading: 'Fees and payouts', paragraphs: ['For successful paid reservations, the current host service fee shown by ROVAH is 18% of the reservation total. Stripe processing fees and payout timing are handled according to the payment and platform terms and the actual payment status.'] },
    ],
  },
  {
    slug: 'guest-rules-responsibilities',
    title: 'Guest Rules and Responsibilities',
    summary: 'What guests should do before, during, and after a private-space visit.',
    sections: [
      { heading: 'Before booking', paragraphs: ['Review the listing, site rules, amenities, arrival information, and dog suitability before reserving. Keep your parent and dog profiles accurate and select the dogs that will attend.'] },
      { heading: 'During a visit', paragraphs: ['Follow the host’s posted rules, supervise your dog, respect the property and neighboring areas, use gates and access instructions carefully, and clean up after your dog. Do not bring unregistered dogs or guests where the listing or host rules prohibit them.'] },
      { heading: 'Communication and reviews', paragraphs: ['Use in-app messaging for questions and updates. Reviews should be honest, relevant to a real completed visit, and free of contact information, threats, discrimination, or harassment.'] },
      { heading: 'Respect for private property', paragraphs: ['A reservation does not give a guest permission beyond the time, space, and terms shown for that visit. Guests are responsible for their own conduct and for the conduct of their dogs and accompanying people.'] },
    ],
  },
  {
    slug: 'cancellation-refund-policy',
    title: 'Cancellation and Refund Policy',
    summary: 'How cancellations and payment status are handled in the current app.',
    sections: [
      { heading: 'Reservation status', paragraphs: ['ROVAH records reservation status in the app. A reservation can be confirmed, cancelled, payment-pending, paid, refunded, failed, or otherwise updated as the related booking or payment process changes.'] },
      { heading: 'Standard-rate cancellations', paragraphs: ['A guest or host may cancel a standard, non-subscription reservation until one hour before its scheduled start time. ROVAH records that cancellation in the app before any reservation payment is captured. The guest is not charged, the host has no payout, and there is no Stripe refund or other money transaction to process. After the one-hour cutoff, the reservation is locked and cannot be cancelled in the app.'] },
      { heading: 'Payment timing and subscription credits', paragraphs: ['For a standard, non-subscription reservation, Stripe collects payment only when the reservation locks one hour before the visit begins. A cancellation before that cutoff is handled by ROVAH and prevents that collection. Subscription purchases are charged when purchased and are not refundable. If an eligible subscription visit is cancelled before the cutoff, ROVAH restores the used visit credit to the guest’s active subscription; it does not issue cash back.'] },
      { heading: 'Courtesy Waivers', paragraphs: ['A Courtesy Waiver is a host-issued, no-charge reservation opportunity for the host’s specific site. It is not cash, cannot be transferred to another property, and follows the conditions shown in the app when issued.'] },
    ],
  },
  {
    slug: 'payment-platform-fee-terms',
    title: 'Payment and Platform Fee Terms',
    summary: 'How paid reservations, Stripe, and host fees are presented in ROVAH.',
    sections: [
      { heading: 'Payment processing', paragraphs: ['When a reservation requires payment, ROVAH uses Stripe Checkout or related Stripe payment services. ROVAH does not store your full card number in the app. A reservation is not treated as paid merely because a browser returns from checkout; the payment status is confirmed through the payment process.'] },
      { heading: 'Host service fee and payout', paragraphs: ['The current ROVAH Host Service Fee is 18% of a successful paid reservation total. The host payout is calculated from the reservation total after the ROVAH fee and Stripe’s actual processing fee for that successful payment. The actual Stripe fee can vary by payment method and is finalized after payment processing.'] },
      { heading: 'Zero-dollar reservations', paragraphs: ['If a valid Courtesy Waiver reduces a reservation’s final balance to $0.00, no Stripe transaction is created for that reservation. The app confirms the reservation only when the server-side reservation process succeeds.'] },
      { heading: 'Promotions and subscriptions', paragraphs: ['Any promotion or subscription offering is shown in the applicable host and guest experience. A paid promotion is not activated merely because it is drafted; payment confirmation is required where the payment flow is enabled.'] },
    ],
  },
  {
    slug: 'safety-guidelines',
    title: 'Safety Guidelines',
    summary: 'Practical steps for safer private-space visits.',
    sections: [
      { heading: 'Before arrival', paragraphs: ['Read the listing and arrival details, ask questions through in-app messaging when needed, and make sure the space fits your dog’s size, behavior, and needs.'] },
      { heading: 'At the property', paragraphs: ['Before unleashing a dog, inspect gates, fencing, terrain, and visible hazards. Keep your dog supervised, follow the site rules, and leave the property as you found it.'] },
      { heading: 'Emergencies and concerns', paragraphs: ['For an immediate emergency, contact local emergency services first. Use Help & Support to report a listing, conduct, review, message, or safety concern to ROVAH. ROVAH does not guarantee a particular response time or outcome.'] },
    ],
  },
  {
    slug: 'community-standards',
    title: 'Community Standards',
    summary: 'The respectful conduct expected from everyone using ROVAH.',
    sections: [
      { heading: 'Be respectful and honest', paragraphs: ['Treat guests, hosts, and their animals with courtesy. Keep your profile, listing, messages, and reviews accurate. Do not impersonate another person or misrepresent a property, dog, reservation, or payment.'] },
      { heading: 'Prohibited conduct', paragraphs: ['Do not threaten, harass, discriminate against, exploit, scam, spam, or post unlawful content. Do not use ROVAH to arrange activity that violates property rules or applicable law.'] },
      { heading: 'Protect private information', paragraphs: ['Do not post another person’s phone number, email, home address, financial information, or other private information in a listing, review, or message unless it is necessary for the reservation and shared through the appropriate app feature.'] },
      { heading: 'Enforcement', paragraphs: ['ROVAH may limit, suspend, or remove access when it reasonably believes these standards or platform rules have been violated. ROVAH does not promise to monitor every interaction or investigate every report.'] },
    ],
  },
  {
    slug: 'intellectual-property-copyright',
    title: 'Intellectual Property and Copyright Information',
    summary: 'How ROVAH branding and user-submitted content may be used.',
    sections: [
      { heading: 'ROVAH materials', paragraphs: ['ROVAH’s name, logos, app design, and original platform materials belong to ROVAH or its licensors. Do not copy, modify, or use them in a way that suggests sponsorship or affiliation without permission.'] },
      { heading: 'Your content', paragraphs: ['You keep ownership of content you submit, such as listing photos, descriptions, messages, and reviews. By submitting it, you give ROVAH a limited right to host, display, reproduce, and use that content to operate, improve, and promote the service.'] },
      { heading: 'Respecting rights', paragraphs: ['Only upload content you have the right to use. If you believe content on ROVAH infringes copyright or another right, contact ROVAH with enough detail to identify the material and your concern. This baseline process is not a complete DMCA designation or legal notice procedure.'] },
    ],
  },
  {
    slug: 'trust-safety',
    title: 'Trust & Safety',
    summary: 'The existing ROVAH safety approach for accounts, listings, reviews, and communication.',
    sections: [
      { heading: 'Account-based community', paragraphs: ['ROVAH participants create accounts before using member or host tools. Profiles, reservation history, and completed-visit reviews help people make more informed decisions about private-space visits.'] },
      { heading: 'Listing and review transparency', paragraphs: ['Hosts are encouraged to provide practical information about fencing, gate access, amenities, parking, terrain, and instructions. Guests may review completed visits, and hosts may review completed guests through the tools provided.'] },
      { heading: 'Private messaging and reporting', paragraphs: ['In-app messaging keeps reservation conversations organized. Use Help & Support to report a concern. ROVAH does not guarantee that every listing is safe, every user is verified in a particular way, or every issue can be resolved.'] },
    ],
  },
  {
    slug: 'pricing',
    title: 'Pricing',
    summary: 'The existing ROVAH pricing approach for members, hosts, and paid reservations.',
    sections: [
      { heading: 'For members', paragraphs: ['Creating a member account and browsing available spaces are free. The price of a reservation is shown for the selected property, time, and dog count before confirmation.'] },
      { heading: 'For hosts', paragraphs: ['Hosts set their listed hourly rates. For a successful paid reservation, ROVAH’s current Host Service Fee is 18% of the reservation total. Stripe’s actual processing fee is also deducted before the host payout is finalized.'] },
      { heading: 'Example', paragraphs: ['For a $20 hourly rate and a two-hour visit, the reservation total is $40. ROVAH’s 18% Host Service Fee is $7.20. The final host payout is $32.80 less Stripe’s actual processing fee for that successful payment.'] },
      { heading: 'Clear pricing', paragraphs: ['The app should show the relevant reservation total and available options before confirmation. This pricing overview does not change the actual amount shown in a reservation, subscription, promotion, or payment flow.'] },
    ],
  },
];

export const legalDocumentBySlug = Object.fromEntries(legalDocuments.map((document) => [document.slug, document]));
