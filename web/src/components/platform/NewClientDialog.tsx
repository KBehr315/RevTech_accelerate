import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { ErrorText } from '@/components/common/PageHeader'
import { useCreateClient } from '@/hooks/usePlatform'
import { slugify } from '@/lib/labels'

export function NewClientButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const create = useCreateClient()
  const navigate = useNavigate()

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setSlug('')
      setSlugEdited(false)
      create.reset()
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const client = await create.mutateAsync({ name: name.trim(), slug })
    reset(false)
    navigate(`/c/${client.slug}/setup`)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        New client
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <form onSubmit={(e) => void submit(e).catch(() => {})} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New client workspace</DialogTitle>
              <DialogDescription>
                You'll become its first Client Training Administrator and go straight to setup.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              <Label htmlFor="client-name">Client name</Label>
              <Input
                id="client-name"
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugEdited) setSlug(slugify(e.target.value))
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="client-slug">Web address</Label>
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <span>/c/</span>
                <Input
                  id="client-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(slugify(e.target.value))
                    setSlugEdited(true)
                  }}
                />
              </div>
            </div>
            <ErrorText error={create.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => reset(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || !slug || create.isPending}>Create client</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
