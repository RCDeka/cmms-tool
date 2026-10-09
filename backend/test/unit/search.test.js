// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { toFtsQuery } from '../../src/rules/search.js';

describe('toFtsQuery', () => {
  it('turns words into required prefix terms', () => {
    expect(toFtsQuery('Chil  Lyon')).toBe('"chil"* "lyon"*');
    expect(toFtsQuery('AST-0042')).toBe('"ast"* "0042"*');
  });

  it('keeps accented letters (the index ignores accents on both sides)', () => {
    expect(toFtsQuery('Défense')).toBe('"défense"*');
  });

  it('neutralizes FTS syntax typed by users', () => {
    expect(toFtsQuery('name:chiller OR NEAR("x" y)')).toBe(
      '"name"* "chiller"* "or"* "near"* "x"* "y"*',
    );
    expect(toFtsQuery('"; DROP TABLE assets; --')).toBe('"drop"* "table"* "assets"*');
  });

  it('returns null when there is nothing to search for, and caps the words', () => {
    expect(toFtsQuery('%_- !')).toBeNull();
    expect(toFtsQuery('a b c d e f g h i j').split(' ')).toHaveLength(8);
  });
});
