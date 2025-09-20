// FlowReader UI Component Library
// 
// A comprehensive design system for the FlowReader application
// providing consistent, accessible, and beautiful components.

export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Input } from './Input.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Badge } from './Badge.svelte';
export { default as Progress } from './Progress.svelte';
export { default as Loading } from './Loading.svelte';
export { default as Toast } from './Toast.svelte';

// Re-export commonly used types
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ai' | 'audio' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type ToastType = 'success' | 'error' | 'warning' | 'info';