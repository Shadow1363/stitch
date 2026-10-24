import { onThemeChange } from './theme';

let n = $state(0);
onThemeChange(() => n++);

/** Read inside an effect that draws with tokens, so it redraws when the theme changes. */
export const themeVersion = () => n;
