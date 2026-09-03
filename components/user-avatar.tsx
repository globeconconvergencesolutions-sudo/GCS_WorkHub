'use client'

const COLOR_CLASS: Record<string, string> = {
  teal: 'avatar-teal',
  navy: 'avatar-navy',
  gold: 'avatar-gold',
  coral: 'avatar-coral',
}

export function UserAvatar({
  initials,
  url,
  color,
  size = 'md',
  className = '',
}: {
  initials: string
  url?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const tone = COLOR_CLASS[color ?? ''] ?? (size === 'sm' ? 'avatar-small' : 'avatar-navy')
  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-small' : ''
  return (
    <span className={`avatar ${tone} ${sizeClass} ${className}`.trim()}>
      {url ? <img src={url} alt="" /> : initials}
    </span>
  )
}
