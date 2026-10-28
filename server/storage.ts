// The `files` container in the environment's storage account (infra/main.bicep),
// reached with the apps' managed identity. Used by the API server (uploads,
// downloads) and the worker (scan results, extraction).
//
//   STORAGE_BLOB_URL            e.g. https://staccelerate0ae49a.blob.core.windows.net/
//   MANAGED_IDENTITY_CLIENT_ID  the user-assigned identity the apps run as

import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'

let container: ContainerClient | undefined

/** The files container, or null where storage isn't configured (local development). */
export function filesContainer(): ContainerClient | null {
  if (!process.env.STORAGE_BLOB_URL) return null
  // In Azure, the managed identity named explicitly: the API's AZURE_CLIENT_ID is the
  // sign-in app, which DefaultAzureCredential would otherwise try. Locally, your az login.
  const identity = process.env.MANAGED_IDENTITY_CLIENT_ID
  container ??= new BlobServiceClient(
    process.env.STORAGE_BLOB_URL,
    identity ? new ManagedIdentityCredential({ clientId: identity }) : new DefaultAzureCredential(),
  ).getContainerClient('files')
  return container
}

// Defender for Storage writes its on-upload verdict to this blob index tag.
const SCAN_TAG = 'Malware Scanning scan result'

/**
 * Defender's verdict for a blob: 'clean', 'infected', 'failed', or null while
 * there is none yet (the scan is still running, or scanning isn't enabled).
 */
export async function defenderVerdict(blobPath: string): Promise<'clean' | 'infected' | 'failed' | null> {
  const files = filesContainer()
  if (!files) throw new Error('File storage is not configured (STORAGE_BLOB_URL).')
  const { tags } = await files.getBlobClient(blobPath).getTags()
  switch (tags[SCAN_TAG]) {
    case undefined:
      return null
    case 'No threats found':
      return 'clean'
    case 'Malicious':
      return 'infected'
    default:
      return 'failed'
  }
}

/** A whole blob in memory, for the worker's readers (uploads are capped at max_upload_mb). */
export async function readBlob(blobPath: string): Promise<Buffer> {
  const files = filesContainer()
  if (!files) throw new Error('File storage is not configured (STORAGE_BLOB_URL).')
  return files.getBlobClient(blobPath).downloadToBuffer()
}
