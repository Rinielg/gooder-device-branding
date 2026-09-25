import { describe, expect, test } from 'vitest'
import { evaluate } from './expr'

/**
 * Characterisation tests: written after the parser, to pin what it already
 * does so it cannot drift. Each one was checked by breaking the parser and
 * confirming it went red — the substitute for watching it fail first.
 */
describe('evaluate', () => {
  test.each([
    ['12', 12],
    ['-7.5', -7.5],
    ['+3', 3],
    ['  8  ', 8],
    ['.5', 0.5],
  ])('reads %s as %s', (src, want) => {
    expect(evaluate(src)).toBe(want)
  })

  test.each([
    ['50*2', 100],
    ['10+5', 15],
    ['10-15', -5],
    ['9/3', 3],
  ])('evaluates %s to %s', (src, want) => {
    expect(evaluate(src)).toBe(want)
  })

  test('multiplication binds tighter than addition', () => {
    expect(evaluate('2+3*4')).toBe(14)
  })

  test('parentheses override precedence', () => {
    expect(evaluate('(2+3)*4')).toBe(20)
  })

  test('nests parentheses', () => {
    expect(evaluate('((1+2)*(3+4))')).toBe(21)
  })

  test('negates a parenthesised group', () => {
    expect(evaluate('-(2+3)')).toBe(-5)
  })

  test.each([
    ['abc'],          // not a number at all
    ['5x'],           // trailing junk means it was never an expression
    ['(1+2'],         // unbalanced
    ['1+'],           // dangling operator
    [''],
    ['   '],
    ['1/0'],          // a value the field cannot hold
  ])('refuses %s so the field reverts', (src) => {
    expect(evaluate(src)).toBeNull()
  })
})
