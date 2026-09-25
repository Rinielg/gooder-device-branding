import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, matchShortcuts, type ShortcutGroup } from './shortcuts'

const groups: ShortcutGroup[] = [
  { title: 'Playback', items: [{ keys: ['Space'], action: 'Play or pause' }] },
  {
    title: 'Animation',
    items: [
      { keys: ['K'], action: 'Key the whole pose' },
      { keys: ['Delete'], action: 'Delete the selected keyframes', note: 'On the timeline' },
    ],
  },
]

describe('matchShortcuts', () => {
  it('returns everything for an empty query', () => {
    expect(matchShortcuts(groups, '   ')).toEqual(groups)
  })

  it('matches on what the shortcut does', () => {
    const out = matchShortcuts(groups, 'delete')
    expect(out).toHaveLength(1)
    expect(out[0].items.map((i) => i.action)).toEqual(['Delete the selected keyframes'])
  })

  it('matches on the note, so "timeline" finds what happens there', () => {
    expect(matchShortcuts(groups, 'timeline')[0].items).toHaveLength(1)
  })

  it('matches a whole group by its title', () => {
    expect(matchShortcuts(groups, 'animation')[0].items).toHaveLength(2)
  })

  it('matches a key exactly, so "k" does not drag in every word with a k', () => {
    const out = matchShortcuts(groups, 'k')
    expect(out).toHaveLength(1)
    expect(out[0].items.map((i) => i.keys)).toEqual([['K']])
  })

  it('drops a group with nothing left in it', () => {
    expect(matchShortcuts(groups, 'nothing here')).toEqual([])
  })

  it('ignores case and surrounding space', () => {
    expect(matchShortcuts(groups, '  PLAY  ')).toEqual(matchShortcuts(groups, 'play'))
  })
})

describe('the catalogue', () => {
  it('has no two rows describing the same action', () => {
    const seen = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => `${g.title}:${i.action}`))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('gives every row at least one key', () => {
    for (const g of SHORTCUT_GROUPS) for (const i of g.items) expect(i.keys.length).toBeGreaterThan(0)
  })
})
