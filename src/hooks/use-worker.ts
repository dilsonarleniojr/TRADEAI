"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface WorkerResponse<T> {
  result: T | null;
  error: string | null;
}

/**
 * Custom React hook for orchestrating Web Workers in Next.js.
 * Automatically handles lifecycle setup, termination, and cleanups.
 */
export function useWorker<TInput = any, TOutput = any>(workerCreator: () => Worker) {
  const [result, setResult] = useState<TOutput | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const resolversRef = useRef<Map<string, (val: WorkerResponse<TOutput>) => void>>(new Map());

  // Initialize and bind worker
  useEffect(() => {
    try {
      const worker = workerCreator();
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent) => {
        const { id, success, result, error } = e.data;
        const resolve = resolversRef.current.get(id);
        
        if (resolve) {
          if (success) {
            resolve({ result, error: null });
          } else {
            resolve({ result: null, error: error || "Erro interno do worker" });
          }
          resolversRef.current.delete(id);
        }
      };

      worker.onerror = (e) => {
        setError(e.message || "Erro inesperado do thread secundário");
        setIsRunning(false);
      };

      return () => {
        worker.terminate();
      };
    } catch (err: any) {
      setError(err?.message || "Falha ao inicializar o Web Worker");
    }
  }, [workerCreator]);

  const execute = useCallback((type: string, payload: TInput): Promise<TOutput> => {
    if (!workerRef.current) {
      const err = "O Web Worker não está ativo ou falhou na inicialização.";
      setError(err);
      return Promise.reject(new Error(err));
    }

    setIsRunning(true);
    setError(null);
    const id = Math.random().toString(36).substring(2, 11);

    return new Promise<TOutput>((resolve, reject) => {
      resolversRef.current.set(id, (response) => {
        setIsRunning(false);
        if (response.error) {
          setError(response.error);
          reject(new Error(response.error));
        } else if (response.result !== null) {
          setResult(response.result);
          resolve(response.result);
        } else {
          const unknownErr = "Resposta vazia do worker.";
          setError(unknownErr);
          reject(new Error(unknownErr));
        }
      });

      workerRef.current?.postMessage({ id, type, payload });
    });
  }, []);

  return { result, isRunning, error, execute };
}
