import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { AssetList, LibrarySearch, PlaceButton, UploadArea } from '@/components/library/LibraryParts'
import { hasPlatformRole, useSession } from '@/hooks/useSession'
import { useAssetCopies, useAssets } from '@/hooks/useLibrary'
import { SCOPE_DESCRIPTIONS, SCOPE_LABELS } from '@/lib/labels'
import type { KnowledgeScope } from '@/types/domain'
import { useWorkspace } from './workspace'

export function LibraryPage() {
  const { client, roles } = useWorkspace()
  const { data: session } = useSession()
  const isGka = hasPlatformRole(session, 'global_knowledge_admin')
  const isCta = roles.includes('client_training_admin')
  const canUpload = isCta || roles.includes('contributor')

  const own = useAssets({ clientId: client.id })
  const shared = useAssets({ sharedWith: client.id })
  const global = useAssets({ scope: 'global' })
  const reference = useAssets({ scope: 'revtech_reference' }, isGka)
  const copies = useAssetCopies((own.data ?? []).map((a) => a.id), isGka)

  // Global and Shared copies are seen by other clients, so they also need this client's Training Administrator.
  const copyChoices: KnowledgeScope[] = isCta ? ['revtech_reference', 'global', 'shared'] : ['revtech_reference']
  const count = (n: number | undefined) => (n === undefined ? '' : ` (${n})`)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Library"
        helpKey="library"
        description={`Source material for ${client.name}'s training: ${client.name}'s own documents, plus what RevTech shares with every client or with ${client.name}.`}
      />
      <LibrarySearch
        clientId={client.id}
        hint={`Searches ${client.name}'s documents, Shared and Global${isGka ? ', and RevTech Reference' : ''}.`}
      />
      <Tabs defaultValue="client">
        <TabsList className="flex-wrap">
          <TabsTrigger value="client">{client.name}{count(own.data?.length)}</TabsTrigger>
          <TabsTrigger value="shared">Shared{count(shared.data?.length)}</TabsTrigger>
          <TabsTrigger value="global">Global{count(global.data?.length)}</TabsTrigger>
          {isGka && <TabsTrigger value="reference">RevTech Reference{count(reference.data?.length)}</TabsTrigger>}
        </TabsList>

        <TabsContent value="client" className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">{SCOPE_DESCRIPTIONS.client}</p>
          {canUpload && (
            <UploadArea
              clientId={client.id}
              hint="Word, PowerPoint, Excel, PDF, PNG, JPG, TXT or CSV. New files start as Draft, Client Confidential, and need human approval before AI can use them."
            />
          )}
          <AssetList
            assets={own.data}
            isLoading={own.isLoading}
            canEdit={canUpload}
            empty={canUpload ? 'Nothing here yet. Upload the first files above.' : 'Nothing has been shared with you here yet.'}
            action={isGka ? (asset) => <PlaceButton asset={asset} choices={copyChoices} label="Copy to…" /> : undefined}
            note={(asset) =>
              copies.data?.get(asset.id)?.map((scope) => (
                <Badge key={scope} variant="neutral">Copied to {SCOPE_LABELS[scope]}</Badge>
              ))
            }
          />
        </TabsContent>

        <TabsContent value="shared" className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Documents RevTech shares with {client.name} and a chosen set of other clients.</p>
          <AssetList assets={shared.data} isLoading={shared.isLoading} empty={`Nothing is shared with ${client.name} yet.`} />
        </TabsContent>

        <TabsContent value="global" className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Documents RevTech maintains for every client.</p>
          <AssetList assets={global.data} isLoading={global.isLoading} empty="Nothing in the Global library yet." />
        </TabsContent>

        {isGka && (
          <TabsContent value="reference" className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              {SCOPE_DESCRIPTIONS.revtech_reference} {client.name}'s members never see this tab.
            </p>
            <AssetList
              assets={reference.data}
              isLoading={reference.isLoading}
              canEdit
              empty='Nothing in RevTech Reference yet. Use "Copy to…" on a document, or upload in the Global Library.'
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
