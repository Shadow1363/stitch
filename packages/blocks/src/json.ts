/** The subset of Blockly's JSON serialization format that Stitch reads and writes. */
export interface InputJson {
  block?: BlockJson;
  shadow?: BlockJson;
}

export interface BlockJson {
  type: string;
  id: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, InputJson>;
  next?: InputJson;
  extraState?: Record<string, unknown>;
  icons?: { comment?: { text: string; pinned?: boolean; height?: number; width?: number } };
  [other: string]: unknown;
}

export interface Position {
  x: number;
  y: number;
}
