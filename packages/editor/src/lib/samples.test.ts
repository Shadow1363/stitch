import { describe, expect, it } from 'vitest';
import { build } from './project';
import { SAMPLES } from './samples';
import { STAGE_FILE } from './session';

describe('samples built from source', () => {
  for (const s of SAMPLES.filter((x) => x.build))
    it(`${s.title} opens with its own Stage code and no errors`, () => {
      const session = s.build!();
      // Bounce keeps the empty Stage template; the generated samples bring their own Stage code.
      if (s.id !== 'bounce')
        expect(session.doc(STAGE_FILE)!.text).not.toMatch(
          /^-- Stage scripts and global variables go here/,
        );
      const errors = build(session).diagnostics.filter((d) => d.severity === 'error');
      expect(errors.map((d) => `${d.file}: ${d.message}`)).toEqual([]);
    });
});
