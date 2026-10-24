import { mount } from 'svelte';
import '../lib/theme';
import '../app.css';
import Docs from './Docs.svelte';

mount(Docs, { target: document.getElementById('app')! });
