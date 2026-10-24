// Text tools: a sample Stitch extension. It runs inside the sandboxed stage and receives the
// `stitch` API. Each implementation gets the block's arguments, then a context with the
// calling sprite (read-only). Lists arrive as copies, and the result becomes a Stitch value.

stitch.define('text_upper', (text) => String(text).toUpperCase());
stitch.define('text_lower', (text) => String(text).toLowerCase());
stitch.define('text_trim', (text) => String(text).trim());
stitch.define('text_split', (text, separator) => String(text).split(String(separator)));
stitch.define('text_replace', (text, find, replacement) =>
  String(text).split(String(find)).join(String(replacement)),
);
