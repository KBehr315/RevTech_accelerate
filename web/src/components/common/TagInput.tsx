import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ tags, onChange, placeholder = 'Add a topic and press Enter…' }: TagInputProps) {
  const [draft, setDraft] = useState('')

  function addTag(raw: string) {
    const value = raw.trim()
    if (!value || tags.some((t) => t.toLowerCase() === value.toLowerCase())) return
    onChange([...tags, value])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(draft)
      setDraft('')
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="rounded-full hover:text-brand-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          addTag(draft)
          setDraft('')
        }}
        placeholder={placeholder}
      />
    </div>
  )
}
