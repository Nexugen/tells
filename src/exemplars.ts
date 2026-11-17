import type { Register } from './types.ts';

/**
 * Positive examples: writing that sounds like a person, used as few-shot examples by the
 * rewrite step and as the human side of the benchmark.
 *
 * Every sample records where it came from and under what licence. Samples marked
 * `human: false` are house-style drafts (written with a model, then reviewed); they help
 * the rewrite step but are never counted as human writing in the benchmark.
 *
 * Note that human writing trips some rules too (the Go 1 post says "we are thrilled to
 * announce", the Go errors post uses an em dash). The excerpts below are kept verbatim
 * apart from removed markdown links and code, and that is on purpose: the benchmark should
 * show what real people actually write.
 */
export interface Exemplar {
  id: string;
  register: Register;
  human: boolean;
  text: string;
  source: { title: string; url: string; author: string; date: string };
  licence: { name: string; url: string; attribution: string };
  note?: string;
}

const SO_LICENCE = (author: string, url: string) => ({
  name: 'CC BY-SA (2.5, 3.0 or 4.0, by revision date)',
  url: 'https://stackoverflow.com/help/licensing',
  attribution: `${author}, Stack Overflow, ${url}`,
});

const GO_LICENCE = (author: string, url: string) => ({
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: `${author}, The Go Blog, ${url}`,
});

const RUST_LICENCE = (author: string, url: string) => ({
  name: 'MIT OR Apache-2.0',
  url: 'https://github.com/rust-lang/blog.rust-lang.org',
  attribution: `${author}, Rust Blog, ${url}`,
});

const OGL = (url: string) => ({
  name: 'Open Government Licence v3.0',
  url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  attribution: `Contains public sector information licensed under the Open Government Licence v3.0. GOV.UK, ${url}`,
});

const NEXUGEN = {
  name: 'MIT (this repository)',
  url: 'https://github.com/Nexugen/tells/blob/main/LICENSE',
  attribution: 'Nexugen',
};

export const EXEMPLARS: Exemplar[] = [
  // --- casual --------------------------------------------------------------------------
  {
    id: 'so-jon-skeet-yield',
    register: 'casual',
    human: true,
    text: "It's returning a generator. I'm not particularly familiar with Python, but I believe it's the same kind of thing as C#'s iterator blocks if you're familiar with those.\n\nThe key idea is that the compiler/interpreter/whatever does some trickery so that as far as the caller is concerned, they can keep calling next() and it will keep returning values - as if the generator method was paused. Now obviously you can't really \"pause\" a method, so the compiler builds a state machine for you to remember where you currently are and what the local variables etc look like. This is much easier than writing an iterator yourself.",
    source: { title: 'What does the "yield" keyword do in Python? (answer)', url: 'https://stackoverflow.com/a/231788', author: 'Jon Skeet', date: '2008-10-23' },
    licence: SO_LICENCE('Jon Skeet', 'https://stackoverflow.com/a/231788'),
  },
  {
    id: 'so-buti-oxa-shrink-to-fit',
    register: 'casual',
    human: true,
    text: "The decision not to expose the feature directly may seem strange, but there is a good reason. It is expensive. Shrink-to-fit means formatting at least twice: you cannot start formatting an element until you know its width, and you cannot calculate the width w/o going through entire content. Plus, one does not need shrink-to-fit element as often as one may think. Why do you need extra div around your table? Maybe table caption is all you need.",
    source: { title: 'How can I make a div not larger than its contents? (answer)', url: 'https://stackoverflow.com/a/451074', author: 'buti-oxa', date: '2009-01-16' },
    licence: SO_LICENCE('buti-oxa', 'https://stackoverflow.com/a/451074'),
    note: 'Second paragraph of the answer.',
  },
  {
    id: 'so-stvnrynlds-margin-padding',
    register: 'casual',
    human: true,
    text: "There are more technical explanations for your question, but if you want a way to think about margin and padding, this analogy might help.\n\nImagine block elements as picture frames hanging on a wall: the photo is the content, the matting is the padding, the frame moulding is the border, the wall is the viewport, and the space between two frames is the margin.\n\nWith this in mind, a good rule of thumb is to use margin when you want to space an element in relationship to other elements on the wall, and padding when you're adjusting the appearance of the element itself. Margin won't change the size of the element, but padding will make the element bigger.",
    source: { title: 'What is the difference between margin and padding in CSS? (answer)', url: 'https://stackoverflow.com/a/20624095', author: 'stvnrynlds', date: '2013-12-16' },
    licence: SO_LICENCE('stvnrynlds', 'https://stackoverflow.com/a/20624095'),
    note: 'The original bullet list is joined into one sentence and a footnote marker is removed.',
  },
  {
    id: 'nexugen-turkey-guide',
    register: 'casual',
    human: false,
    text: 'A user typed one line into Pilot, typo and all, asking it to research Turkey and add it to their moving abroad guide. About a minute and a half later: Turkey as a new country, three cities, a twelve part guide, and an undo next to every change.',
    source: { title: 'Approved social post', url: 'https://nexugen.app', author: 'Nexugen', date: '2026-11' },
    licence: NEXUGEN,
    note: 'Drafted with help, then approved by a person for publication. Not counted as human writing.',
  },
  {
    id: 'nexugen-rls-reply',
    register: 'casual',
    human: false,
    text: "Worth adding: check storage buckets too, not just tables. People lock down the users table then leave a storage bucket public, and that's often where the actual PII sits, profile photos, uploaded documents, ID scans.\n\nAlso test it the right way: open an incognito window, no login, hit your site, open console, run a query against the table through the Supabase client. If RLS is on and policies are right, you get an empty array or a permission error, not data. Testing while logged in as yourself proves nothing, since your own policies probably allow it.",
    source: { title: 'Drafted forum reply', url: 'https://nexugen.app', author: 'Nexugen', date: '2026-11-17' },
    licence: NEXUGEN,
    note: 'House-style draft written with a model and reviewed. Not counted as human writing.',
  },

  // --- professional --------------------------------------------------------------------
  {
    id: 'govuk-renew-licence',
    register: 'professional',
    human: true,
    text: "It costs £14 when you apply online.\n\nIf you cannot use the online service, you can apply at a Post Office or by post.\n\nIf your signature has changed, you must apply by post or at a Post Office. If your name or title has changed, you can only apply by post.\n\nYour new licence will be valid from the date your application is approved, not from the expiry date of your current licence.",
    source: { title: 'Renew your driving licence', url: 'https://www.gov.uk/renew-driving-licence', author: 'Driver and Vehicle Licensing Agency', date: 'retrieved 2026-11-18' },
    licence: OGL('https://www.gov.uk/renew-driving-licence'),
    note: 'Sentences taken from separate sections of the page.',
  },
  {
    id: 'rust-crates-incident-action',
    register: 'professional',
    human: true,
    text: "The user's IP address was banned immediately. We then backdated the users' packages to remove their packages from the homepage. We also redirected the user's page to a 404.\n\nFinally, the user and all crates they uploaded were deleted. The user was reported to GitHub, and has since been banned by them.",
    source: { title: 'Update on the October 15, 2018 incident on crates.io', url: 'https://blog.rust-lang.org/2018/10/19/Update-on-crates.io-incident/', author: 'The Crates.io Team', date: '2018-10-19' },
    licence: RUST_LICENCE('The Crates.io Team', 'https://blog.rust-lang.org/2018/10/19/Update-on-crates.io-incident/'),
    note: 'The account name is replaced with "the user".',
  },

  // --- technical -----------------------------------------------------------------------
  {
    id: 'rust-crates-incident-cause',
    register: 'technical',
    human: true,
    text: "On Monday, Oct 15, starting at approximately 20:00 UTC, crates.io sustained an operational incident.\n\nA user was created on crates.io and proceeded to upload packages using common, short names. These packages contained nothing beyond a Cargo.toml file and a README.md instructing users that if they wanted to use the name, they should open an issue on the crates.io issue tracker.\n\nThe rate at which this user uploaded packages eventually resulted in our servers being throttled by GitHub, causing a slowdown in all package uploads or yanks. Endpoints which did not involve updating the index were unaffected.",
    source: { title: 'Update on the October 15, 2018 incident on crates.io', url: 'https://blog.rust-lang.org/2018/10/19/Update-on-crates.io-incident/', author: 'The Crates.io Team', date: '2018-10-19' },
    licence: RUST_LICENCE('The Crates.io Team', 'https://blog.rust-lang.org/2018/10/19/Update-on-crates.io-incident/'),
    note: 'The account name is replaced with "a user".',
  },
  {
    id: 'go-errors-intro',
    register: 'technical',
    human: true,
    text: "Go’s treatment of errors as values has served us well over the last decade. Although the standard library’s support for errors has been minimal—just the errors.New and fmt.Errorf functions, which produce errors that contain only a message—the built-in error interface allows Go programmers to add whatever information they desire. All it requires is a type that implements an Error method.",
    source: { title: 'Working with Errors in Go 1.13', url: 'https://go.dev/blog/go1.13-errors', author: 'Damien Neil and Jonathan Amsterdam', date: '2019-10-17' },
    licence: GO_LICENCE('Damien Neil and Jonathan Amsterdam', 'https://go.dev/blog/go1.13-errors'),
    note: 'Kept verbatim, em dashes included: people use them too.',
  },
  {
    id: 'so-keithmo-static-assert',
    register: 'technical',
    human: true,
    text: 'Some people seem to be confusing these macros with assert(). These macros implement a compile-time test, while assert() is a runtime test.\n\nAs of C11, the _Static_assert() keyword is available to create compile time tests, and should be used unless code is being written for old compilers.',
    source: { title: "What is ':-!!' in C? (answer)", url: 'https://stackoverflow.com/a/9230305', author: 'keithmo', date: '2012-02-10' },
    licence: SO_LICENCE('keithmo', 'https://stackoverflow.com/a/9230305'),
  },

  // --- marketing -----------------------------------------------------------------------
  {
    id: 'go1-announcement',
    register: 'marketing',
    human: true,
    text: "Go 1 is the first release of Go that is available in supported binary distributions. They are available for Linux, FreeBSD, Mac OS X and, we are thrilled to announce, Windows.\n\nThe driving motivation for Go 1 is stability for its users. People who write Go 1 programs can be confident that those programs will continue to compile and run without change, in many environments, on a time scale of years.",
    source: { title: 'Go version 1 is released', url: 'https://go.dev/blog/go1', author: 'Andrew Gerrand', date: '2012-03-28' },
    licence: GO_LICENCE('Andrew Gerrand', 'https://go.dev/blog/go1'),
  },
  {
    id: 'rust-road-to-1',
    register: 'marketing',
    human: true,
    text: "Rust 1.0 is on its way! We have nailed down a concrete list of features and are hard at work on implementing them. We plan to ship the 1.0 beta around the end of the year. If all goes well, this will go on to become the 1.0 release after the beta period. After 1.0 is released, future 1.x releases will be backwards compatible, meaning that existing code will continue to compile unmodified (modulo compiler bugs, of course).",
    source: { title: 'Road to Rust 1.0', url: 'https://blog.rust-lang.org/2014/09/15/Rust-1.0/', author: 'Niko Matsakis', date: '2014-09-15' },
    licence: RUST_LICENCE('Niko Matsakis', 'https://blog.rust-lang.org/2014/09/15/Rust-1.0/'),
  },
  {
    id: 'nexugen-gym-test',
    register: 'marketing',
    human: false,
    text: 'Tested a gym app on Nexugen. A member joins on their phone, walks up to the desk, holds up their code, and the whole screen goes green with their name and plan. Tried an expired membership too. Red, and it says why.',
    source: { title: 'Approved social post', url: 'https://nexugen.app', author: 'Nexugen', date: '2026-11' },
    licence: NEXUGEN,
    note: 'Drafted with help, then approved by a person for publication. Not counted as human writing.',
  },
];

/** Exemplars for a register, house-style drafts last. */
export function exemplarsFor(register: Register, limit = 3): Exemplar[] {
  return EXEMPLARS.filter((e) => e.register === register)
    .sort((a, b) => Number(b.human) - Number(a.human))
    .slice(0, limit);
}
