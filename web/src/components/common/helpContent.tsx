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
