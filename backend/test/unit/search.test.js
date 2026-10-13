// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { toFtsAnyQuery, toFtsQuery } from '../../src/rules/search.js';

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

describe('toFtsAnyQuery', () => {
  it('joins distinct words of 3 characters or more with OR, common words left out', () => {
    expect(toFtsAnyQuery('Swapped the contactor on pump 2, the coil was burnt')).toBe(
      '"swapped"* OR "contactor"* OR "pump"* OR "coil"* OR "burnt"*',
    );
    expect(toFtsAnyQuery('Changé le filtre de la CTA dans les bureaux')).toBe(
      '"changé"* OR "filtre"* OR "cta"* OR "bureaux"*',
    );
  });

  it('neutralizes FTS syntax and caps the words', () => {
    expect(toFtsAnyQuery('name:chiller NEAR("x" y) "; DROP')).toBe(
      '"name"* OR "chiller"* OR "near"* OR "drop"*',
    );
    const many = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    expect(toFtsAnyQuery(many).split(' OR ')).toHaveLength(12);
  });

  it('returns null when no word is left', () => {
    expect(toFtsAnyQuery('a b on the 2')).toBeNull();
    expect(toFtsAnyQuery('%_- !')).toBeNull();
  });
});
