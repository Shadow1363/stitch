/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'virtual:stitch-player' {
  /** The exported player bundle (one classic script), inlined into every export. */
  const js: string;
  export default js;
}
