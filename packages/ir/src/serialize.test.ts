import { describe, expect, it } from 'vitest';
import { deserializeProject, IR_VERSION, serializeProject, type Project } from './index';

const project: Project = {
  irVersion: IR_VERSION,
  stage: { items: [] },
  sprites: [
    {
      id: 's1',
      name: 'Player',
      module: {
        items: [
          {
            id: 'n1',
            kind: 'VarDecl',
            scope: 'sprite',
            name: 'a',
            init: { id: 'n2', kind: 'Num', value: 1 },
          },
        ],
      },
    },
  ],
};

describe('serialize', () => {
  it('round-trips through JSON', () => {
    expect(deserializeProject(serializeProject(project))).toEqual(project);
  });

  it('rejects projects from a newer IR version', () => {
    expect(() =>
      deserializeProject(JSON.stringify({ ...project, irVersion: IR_VERSION + 1 })),
    ).toThrow(/newer/);
  });

  it('upgrades version 1 projects, which are a subset of version 2', () => {
    expect(deserializeProject(JSON.stringify({ ...project, irVersion: 1 }))).toEqual(project);
  });

  it('rejects data without a version', () => {
    expect(() => deserializeProject('{}')).toThrow(/irVersion/);
  });
});
