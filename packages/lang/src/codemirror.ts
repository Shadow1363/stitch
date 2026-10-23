import {
  foldInside,
  foldNodeProp,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
  continuedIndent,
} from '@codemirror/language';
import { linter, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { styleTags, tags as t } from '@lezer/highlight';
import { validateModule } from '@stitch/ir';
import { parse } from './parse';
import { parser } from './parser.gen.js';

const BLOCKS = 'FunctionDef EventScript If Forever Repeat RepeatUntil While ForRange ForEach';

export const stitchLanguage = LRLanguage.define({
  name: 'stitch',
  parser: parser.configure({
    props: [
      styleTags({
        'var global local function warp on do end return': t.definitionKeyword,
        'if then elseif else forever repeat until while for in wait': t.controlKeyword,
        'start key message': t.keyword,
        'and or not': t.operatorKeyword,
        'true false': t.bool,
        Number: t.number,
        String: t.string,
        LineComment: t.lineComment,
        'CallExpr/Name': t.function(t.variableName),
        'FunctionDef/Name': t.function(t.definition(t.variableName)),
        'VarDecl/Name LocalDecl/Name ParamList/Name': t.definition(t.variableName),
        Name: t.variableName,
        AssignOp: t.definitionOperator,
        '( )': t.paren,
        '[ ]': t.squareBracket,
      }),
      indentNodeProp.add({
        [BLOCKS]: continuedIndent({ except: /^\s*(end|else|elseif)\b/ }),
      }),
      foldNodeProp.add(Object.fromEntries(BLOCKS.split(' ').map((n) => [n, foldInside]))),
    ],
  }),
  languageData: {
    commentTokens: { line: '--' },
    indentOnInput: /^\s*(end|else|elseif)$/,
  },
});

export function stitch(): LanguageSupport {
  return new LanguageSupport(stitchLanguage);
}

/** Inline diagnostics: syntax errors plus semantic checks. `globals` come from other files. */
export function stitchLinter(globals: () => ReadonlySet<string> = () => new Set()): Extension {
  return linter(
    (view) => {
      const text = view.state.doc.toString();
      const r = parse(text);
      const out: CMDiagnostic[] = r.diagnostics.map((d) => ({
        from: d.from,
        to: Math.max(d.to, d.from),
        severity: 'error',
        message: d.message,
      }));
      for (const d of validateModule(r.module, globals())) {
        if (d.message.startsWith('syntax error')) continue; // already reported precisely above
        const span = d.nodeId ? r.spans.get(d.nodeId) : undefined;
        out.push({
          from: span?.from ?? 0,
          to: span?.to ?? 0,
          severity: d.severity,
          message: d.message,
        });
      }
      return out;
    },
    { delay: 250 },
  );
}
