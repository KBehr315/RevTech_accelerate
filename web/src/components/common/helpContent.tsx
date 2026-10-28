import type { ReactNode } from 'react'

export interface HelpEntry {
  title: string
  body: ReactNode
}

export const HELP_CONTENT = {
  contexts: {
    title: 'Choosing where to work',
    body: (
      <>
        <p>Each card is a place you can work: a client workspace, the Global knowledge library, or platform administration.</p>
        <p>
          The label at the top of every page always shows which one you're in. Client work, such as uploading sources,
          generating or publishing training, happens only inside that client's workspace.
        </p>
      </>
    ),
  },
  'client-home': {
    title: 'Client workspace',
    body: (
      <>
        <p>Everything here belongs to this client only. Nobody outside the client's member list can see it.</p>
        <p>Until setup is finished the client stays "In setup" and can't receive learners.</p>
      </>
    ),
  },
  'client-setup': {
    title: 'Client setup',
    body: (
      <>
        <p>Work through the steps in any order; each step saves on its own.</p>
        <p>
          <strong>Governance</strong> decides the most sensitive data this client may hold and which AI services may
          process it. Until you allow at least one AI service, training can't be generated for this client.
        </p>
        <p>Activate the client from the Review step once the required items are filled in.</p>
      </>
    ),
  },
  members: {
    title: 'Members',
    body: (
      <>
        <p>People need a membership here before they can see anything in this client.</p>
        <p>
          Client employees sign in as guests of RevTech's Microsoft directory. Add them here by email; RevTech IT sends the
          guest invitation.
        </p>
        <p>LMS Administrators can add and remove learners. Only Client Training Administrators can grant other roles.</p>
      </>
    ),
  },
  library: {
    title: 'Library',
    body: (
      <>
        <p>
          The source material this client's training is built from: test scripts, process documents, configuration,
          screenshots and existing training.
        </p>
        <p>
          Every document sits in one of four libraries. <strong>This client's</strong> documents are seen only by its
          members. <strong>Shared</strong> documents come from RevTech for a chosen set of clients, and{' '}
          <strong>Global</strong> ones for every client. <strong>RevTech Reference</strong> is for RevTech's Global
          Knowledge Administrators only; this client never sees it.
        </p>
        <p>
          New files start as Draft and Client Confidential (or the client's highest classification, if lower). AI may
          not use them until a person approves it. Training Administrators see every file; Contributors and Reviewers
          see what they uploaded or were given access to.
        </p>
        <p>
          A Global Knowledge Administrator can <strong>copy</strong> a document to RevTech Reference. The client keeps
          its own; nothing is moved out. Copies to Global or Shared, which other clients see, also need this client's
          Training Administrator.
        </p>
      </>
    ),
  },
  'global-library': {
    title: 'Global Library',
    body: (
      <>
        <p>
          <strong>RevTech Reference</strong>: RevTech only. AI checks it first when building any client's training and
          may reuse its content, structure and approach, but never the original client's names or data.
        </p>
        <p>
          <strong>Global</strong>: every client's authors and reviewers. <strong>Shared</strong>: only the clients and
          client groups you choose. <strong>Pending</strong>: not placed yet; AI may not use it.
        </p>
        <p>Use “Move to…” to change where a document sits. Client documents are copied in from each client's Library.</p>
      </>
    ),
  },
  'client-audit': {
    title: 'Audit log',
    body: <p>Every change to this client's setup and membership, with who made it and when. Entries can't be edited or deleted.</p>,
  },
  'platform-clients': {
    title: 'Clients',
    body: (
      <>
        <p>All client workspaces on the platform.</p>
        <p>
          Creating a client makes you its first Client Training Administrator. Platform Administrators see the client list
          but not client content unless they are members.
        </p>
      </>
    ),
  },
  'platform-people': {
    title: 'People & roles',
    body: (
      <>
        <p>Everyone who has signed in or been added to a client.</p>
        <p>
          Platform roles cover the platform as a whole. They don't give access to any client's content; that comes only
          from client membership.
        </p>
      </>
    ),
  },
  'ai-providers': {
    title: 'AI providers',
    body: (
      <>
        <p>The AI services the platform may call. Keys are kept in Key Vault, never here.</p>
        <p>
          Each provider has a highest classification it may receive. Content above that level is never sent to it, and
          no provider can be approved for CUI or export-controlled data in this environment.
        </p>
        <p>Clients choose which enabled providers they allow in their own setup.</p>
        <p>
          Test connection sends one short sentence to the provider through the background worker, using its Key Vault
          secret and model, so you can check them before enabling it.
        </p>
      </>
    ),
  },
  'platform-audit': {
    title: 'Platform audit log',
    body: <p>Platform-level changes: roles, people, AI providers and settings. Client changes are in each client's own log.</p>,
  },
  'client-groups': {
    title: 'Client groups',
    body: (
      <>
        <p>Named sets of clients, such as "Aerospace & Defense" or "Dassian clients".</p>
        <p>Shared/Restricted knowledge is made visible to a group rather than to every client.</p>
      </>
    ),
  },
} satisfies Record<string, HelpEntry>

export type HelpKey = keyof typeof HELP_CONTENT
