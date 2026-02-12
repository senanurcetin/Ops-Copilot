import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type AppEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

class TypedEventEmitter<T extends Record<string, (...args: any[]) => void>> {
  private emitter = new EventEmitter();

  on<E extends keyof T>(event: E, listener: T[E]): void {
    this.emitter.on(event as string, listener);
  }

  off<E extends keyof T>(event: E, listener: T[E]): void {
    this.emitter.off(event as string, listener);
  }

  emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): void {
    this.emitter.emit(event as string, ...args);
  }
}

export const errorEmitter = new TypedEventEmitter<AppEvents>();
