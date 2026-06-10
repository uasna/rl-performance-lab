import { useCallback, useEffect, useMemo, useState } from 'react';

type SetValue<T> = T | ((currentValue: T) => T);

interface UseLocalStorageOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  validate?: (value: unknown) => value is T;
  onError?: (error: unknown) => void;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}

function defaultDeserialize<T>(value: string): T {
  return JSON.parse(value) as T;
}

function resolveValue<T>(value: SetValue<T>, currentValue: T): T {
  return typeof value === 'function' ? (value as (currentValue: T) => T)(currentValue) : value;
}

export function useLocalStorage<T>(key: string, fallbackValue: T, options: UseLocalStorageOptions<T> = {}) {
  const { serialize = defaultSerialize, deserialize = defaultDeserialize<T>, validate, onError } = options;

  const readValue = useCallback((): T => {
    if (!canUseLocalStorage()) return fallbackValue;

    try {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) return fallbackValue;
      const parsedValue = deserialize(rawValue);
      return validate && !validate(parsedValue) ? fallbackValue : parsedValue;
    } catch (error) {
      onError?.(error);
      return fallbackValue;
    }
  }, [deserialize, fallbackValue, key, onError, validate]);

  const [value, setValueState] = useState<T>(() => readValue());

  const setValue = useCallback(
    (nextValue: SetValue<T>) => {
      setValueState((currentValue) => {
        const resolvedValue = resolveValue(nextValue, currentValue);

        if (canUseLocalStorage()) {
          try {
            window.localStorage.setItem(key, serialize(resolvedValue));
          } catch (error) {
            onError?.(error);
          }
        }

        return resolvedValue;
      });
    },
    [key, onError, serialize],
  );

  const removeValue = useCallback(() => {
    if (canUseLocalStorage()) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        onError?.(error);
      }
    }
    setValueState(fallbackValue);
  }, [fallbackValue, key, onError]);

  const refreshValue = useCallback(() => {
    setValueState(readValue());
  }, [readValue]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) refreshValue();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, refreshValue]);

  const controls = useMemo(
    () => ({
      remove: removeValue,
      refresh: refreshValue,
    }),
    [refreshValue, removeValue],
  );

  return [value, setValue, controls] as const;
}
