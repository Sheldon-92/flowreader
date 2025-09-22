import { writable, get } from 'svelte/store';
import type { Book } from '@flowreader/shared';

// Local storage key
const STORAGE_KEY = 'flowreader_local_books';

// Create a writable store for books
function createLocalBooksStore() {
  // Initialize from localStorage if available
  const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const initialBooks: Book[] = stored ? JSON.parse(stored) : [];

  const { subscribe, set, update } = writable<Book[]>(initialBooks);

  return {
    subscribe,

    addBook: (book: Book) => {
      update(books => {
        const newBooks = [...books, book];
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks));
        }
        return newBooks;
      });
    },

    removeBook: (bookId: string) => {
      update(books => {
        const newBooks = books.filter(b => b.id !== bookId);
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks));
        }
        return newBooks;
      });
    },

    updateBook: (bookId: string, updates: Partial<Book>) => {
      update(books => {
        const newBooks = books.map(book =>
          book.id === bookId ? { ...book, ...updates } : book
        );
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks));
        }
        return newBooks;
      });
    },

    getBooks: () => get(localBooks),

    clear: () => {
      set([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };
}

export const localBooks = createLocalBooksStore();