export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11')
];

export const server_loads = [0];

export const dictionary = {
		"/": [2],
		"/auth/login": [~3],
		"/auth/register": [~4],
		"/design-system": [5],
		"/library": [~6],
		"/notes": [~7],
		"/notes/search": [9],
		"/notes/[id]": [~8],
		"/read/[bookId]": [~10],
		"/read/[bookId]/notes": [11]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
};

export { default as root } from '../root.svelte';