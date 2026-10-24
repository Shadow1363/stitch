import { mount } from 'svelte';
import App from './App.svelte';
import './lib/theme';
import './app.css';

mount(App, { target: document.getElementById('app')! });
