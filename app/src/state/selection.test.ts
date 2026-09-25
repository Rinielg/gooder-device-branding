import { describe, expect, it } from 'vitest'
import { isSelected, selectedRefs, toggleRef } from './selection'
import type { KeySelection } from './selection'

const key = (k: string) => ({ track: 'position' as const, key: k })
const one: KeySelection = { track: 'position', key: 'a', kind: 'key' }

describe('toggleRef', () => {
  it('picks the key when nothing is selected', () => {
    expect(toggleRef(null, key('a'))).toEqual({ track: 'position', key: 'a', kind: 'key' })
  })

  it('adds a second key without moving the one the inspector is editing', () => {
    const out = toggleRef(one, key('b'))
    expect(out).toMatchObject({ key: 'a', kind: 'key' })
    expect(selectedRefs(out)).toEqual([key('a'), key('b')])
  })

  it('adds a key from another track', () => {
    const out = toggleRef(one, { track: 'rotation', key: 'r' })
    expect(selectedRefs(out)).toEqual([key('a'), { track: 'rotation', key: 'r' }])
  })

  it('removes a key that was already in the group', () => {
    const two = toggleRef(one, key('b'))
    expect(selectedRefs(toggleRef(two, key('b')))).toEqual([key('a')])
  })

  it('promotes another key when the one being edited is removed', () => {
    const two = toggleRef(one, key('b'))
    const out = toggleRef(two, key('a'))
    expect(out).toMatchObject({ key: 'b' })
    expect(selectedRefs(out)).toEqual([key('b')])
  })

  it('clears the selection when the last key is removed', () => {
    expect(toggleRef(one, key('a'))).toBeNull()
  })

  it('turns a selected segment into a group of keys', () => {
    // A group is keys: there is no such thing as easing two segments at once.
    const seg: KeySelection = { track: 'position', key: 'a', kind: 'segment' }
    expect(toggleRef(seg, key('b'))?.kind).toBe('key')
  })

  it('does not add the same key twice', () => {
    const two = toggleRef(one, key('b'))
    expect(selectedRefs(toggleRef(toggleRef(two, key('c')), key('c')))).toEqual([key('a'), key('b')])
  })
})

describe('selectedRefs', () => {
  it('is empty for no selection', () => {
    expect(selectedRefs(null)).toEqual([])
  })

  it('puts the key being edited first', () => {
    expect(selectedRefs({ ...one, more: [key('b')] })).toEqual([key('a'), key('b')])
  })
})

describe('isSelected', () => {
  it('finds the key being edited and the rest of the group', () => {
    const sel: KeySelection = { ...one, more: [key('b')] }
    expect(isSelected(sel, 'position', 'a')).toBe(true)
    expect(isSelected(sel, 'position', 'b')).toBe(true)
    expect(isSelected(sel, 'position', 'c')).toBe(false)
    expect(isSelected(sel, 'rotation', 'a')).toBe(false)
    expect(isSelected(null, 'position', 'a')).toBe(false)
  })
})
