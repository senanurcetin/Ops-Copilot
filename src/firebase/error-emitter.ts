import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type AppEvents = {
  'permission-error': [error: FirestorePermissionError];
};

class TypedEventEmitter<T extends Record<string, unknown[]>> {
  private emitter = new EventEmitter();

  on<E extends keyof T>(event: E, listener: (...args: T[E]) => void): void {
    this.emitter.on(event as string, listener);
  }

  off<E extends keyof T>(event: E, listener: (...args: T[E]) => void): void {
    this.emitter.off(event as string, listener);
  }

  emit<E extends keyof T>(event: E, ...args: T[E]): void {
    this.emitter.emit(event as string, ...args);
  }
}

export const errorEmitter = new TypedEventEmitter<AppEvents>();
