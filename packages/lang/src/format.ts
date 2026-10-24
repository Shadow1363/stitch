import type { Module, TopItem } from '@stitch/ir';
import { parse } from './parse';
import { printModule } from './print';

/**
 * Formats Stitch text: parse, apply the layout rules below, print. The canonical printer does
 * the indentation, spacing and comment placement, so formatting and round-tripping can't
 * disagree, and a formatted file is always a fixed point of `print(parse(t))`. Text that doesn't
 * parse stays as written (it's a Raw node). Only trivia changes, so the program is the same.
 */
export function format(text: string): { text: string; changed: boolean } {
  const module = normalizeLayout(parse(text.replace(/\r\n?/g, '\n')).module);
  const out = printModule(module);
  return { text: out, changed: out !== text };
}

const isBlock = (it: TopItem) => it.kind === 'FunctionDef' || it.kind === 'EventScript';

/**
 * The formatter's layout rules, on top of the printer's: a blank line before and after every
 * function and event script. Runs of variable declarations keep the grouping they were written
 * with. Mutates and returns `module`.
 */
export function normalizeLayout(module: Module): Module {
  module.items.forEach((it, i) => {
    const prev = module.items[i - 1];
    if (prev && (isBlock(it) || isBlock(prev))) it.trivia = { ...it.trivia, blankBefore: true };
  });
  return module;
}
