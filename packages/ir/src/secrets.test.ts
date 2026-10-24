import { describe, expect, it } from 'vitest';
import { looksLikeSecret } from './secrets';
import { validateModule } from './validate';
import type { Module } from './nodes';

describe('looksLikeSecret', () => {
  it('flags provider key shapes and random tokens', () => {
    for (const s of [
      'sk-proj-4fHq9ZtLx2Wm8NcVb7Rk1PoYe',
      'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv',
      'ghp_1234567890abcdefghijABCDEFGHIJ123456',
      'AKIAIOSFODNN7EXAMPLE',
      'b6907d289e10d714a6e88b30761fae22',
      'xoxb-1234567890-abcdefghij',
      'AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY',
      'Bearer eyJhbGciOiJIUzI1NiJ9.abc',
      'https://api.example.com/v1/data?key=Zx81kQp3LmN7vB2cR9tY4wE6uI0oA5sD',
    ])
      expect(looksLikeSecret(s), s).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    for (const s of [
      'Hello, world!',
      'https://example.com/data.json',
      '{"name": "Stitch", "score": 10}',
      'the quick brown fox jumps over the lazy dog again and again',
      'sk-short',
      '#4c97ff',
      '00000000000000000000000000000000000000',
      'player_one_highscore_table_version2',
    ])
      expect(looksLikeSecret(s), s).toBe(false);
  });

  it('is a validation warning on string literals', () => {
    const m: Module = {
      items: [
        {
          id: 'v',
          kind: 'VarDecl',
          scope: 'sprite',
          name: 'key',
          init: { id: 's', kind: 'Str', value: 'sk-proj-4fHq9ZtLx2Wm8NcVb7Rk1PoYe' },
        },
      ],
    };
    const d = validateModule(m);
    expect(d).toEqual([expect.objectContaining({ severity: 'warning', nodeId: 's' })]);
  });
});
