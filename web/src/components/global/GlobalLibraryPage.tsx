import { useState } from 'react'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { AssetList, LibrarySearch, PlaceButton, UploadArea } from '@/components/library/LibraryParts'
import { usePlaceAsset, useAssets } from '@/hooks/useLibrary'
import { SCOPE_DESCRIPTIONS, SCOPE_LABELS } from '@/lib/labels'
import type { KnowledgeScope } from '@/types/domain'

type Bucket = Exclude<KnowledgeScope, 'client'>

const BUCKETS: Bucket[] = ['revtech_reference', 'global', 'shared', 'pending_classification']
// Shared needs its audience chosen, so new files go there through "Move to…".
const UPLOAD_TO: Bucket[] = ['revtech_reference', 'global', 'pending_classification']

export function GlobalLibraryPage() {
  const [uploadTo, setUploadTo] = useState<Bucket>('revtech_reference')
  const place = usePlaceAsset()
  const lists = {
    revtech_reference: useAssets({ scope: 'revtech_reference' }),
    global: useAssets({ scope: 'global' }),
    shared: useAssets({ scope: 'shared' }),
    pending_classification: useAssets({ scope: 'pending_classification' }),
  }
  const count = (bucket: Bucket) => (lists[bucket].data ? ` (${lists[bucket].data.length})` : '')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Global Library"
        helpKey="global-library"
        description="RevTech's own knowledge: Global for every client, Shared for chosen clients, and RevTech Reference for RevTech only."
      />
      <UploadArea
        clientId={null}
        hint="Word, PowerPoint, Excel, PDF, PNG, JPG, TXT or CSV. To add a client's document, open it in that client's Library and use “Copy to…”."
        afterUpload={(asset) =>
          uploadTo === 'pending_classification'
            ? Promise.resolve()
            : place.mutateAsync({ asset, to: { scope: uploadTo } })
        }
      >
        <div className="flex flex-col gap-1 sm:max-w-sm">
          <Label htmlFor="upload-to">Put new files in</Label>
          <Select value={uploadTo} onValueChange={(v) => setUploadTo(v as Bucket)}>
            <SelectTrigger id="upload-to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPLOAD_TO.map((bucket) => (
                <SelectItem key={bucket} value={bucket}>
                  {bucket === 'pending_classification' ? 'Pending (decide later)' : SCOPE_LABELS[bucket]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">{SCOPE_DESCRIPTIONS[uploadTo]}</p>
        </div>
      </UploadArea>
      <LibrarySearch clientId={null} hint="Searches RevTech Reference, Global, Shared and Pending. Client documents are searched in each client's Library." />
      <Tabs defaultValue="revtech_reference">
        <TabsList className="flex-wrap">
          {BUCKETS.map((bucket) => (
            <TabsTrigger key={bucket} value={bucket}>
              {SCOPE_LABELS[bucket]}
              {count(bucket)}
            </TabsTrigger>
          ))}
        </TabsList>
        {BUCKETS.map((bucket) => (
          <TabsContent key={bucket} value={bucket} className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">{SCOPE_DESCRIPTIONS[bucket]}</p>
            <AssetList
              assets={lists[bucket].data}
              isLoading={lists[bucket].isLoading}
              canReadAgain
              empty={`Nothing in ${SCOPE_LABELS[bucket]}.`}
              action={(asset) => (
                <PlaceButton
                  asset={asset}
                  choices={BUCKETS}
                  label={bucket === 'pending_classification' ? 'Place…' : 'Move to…'}
                />
              )}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
