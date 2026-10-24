/**
 * Themed replacements for confirm/prompt/alert. Each call queues a dialog that `Dialogs.svelte`
 * shows (one at a time, as a modal <dialog>) and resolves when the user answers.
 */
export interface DialogRequest {
  title: string;
  message?: string;
  /** Shown in the mono font after the message, e.g. a host name. */
  code?: string;
  /** A second paragraph, after the code. */
  note?: string;
  ok: string;
  /** Omitted for alerts, which have one button. */
  cancel?: string;
  /** Styles the OK button as destructive. */
  danger?: boolean;
  /** Present for prompts: the starting text. */
  input?: { value: string; placeholder?: string; label: string };
  resolve: (answer: string | boolean | undefined) => void;
}

export const dialogs = $state<{ queue: DialogRequest[] }>({ queue: [] });

const open = (r: Omit<DialogRequest, 'resolve'>) =>
  new Promise<string | boolean | undefined>((resolve) => dialogs.queue.push({ ...r, resolve }));

/** Yes/no. Resolves true for OK. */
export async function ask(
  title: string,
  opts: {
    message?: string;
    code?: string;
    note?: string;
    ok?: string;
    cancel?: string;
    danger?: boolean;
  } = {},
): Promise<boolean> {
  return (await open({ title, ok: 'OK', cancel: 'Cancel', ...opts })) === true;
}

/** A line of text, or undefined when cancelled. */
export async function askText(
  title: string,
  opts: {
    message?: string;
    value?: string;
    placeholder?: string;
    label?: string;
    ok?: string;
  } = {},
): Promise<string | undefined> {
  const { value = '', placeholder, label = title, ...rest } = opts;
  const answer = await open({
    title,
    ok: 'OK',
    cancel: 'Cancel',
    ...rest,
    input: { value, label, ...(placeholder ? { placeholder } : {}) },
  });
  return typeof answer === 'string' ? answer : undefined;
}

/** A message with one button. */
export async function tell(title: string, message?: string): Promise<void> {
  await open({ title, ok: 'OK', ...(message ? { message } : {}) });
}
