import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type { ModelArchitectureResponse, OverviewResponse } from '@/api/types';

const ACTIVE_EXP_STORAGE_KEY = 'minicert.activeExperimentId';
const ACTIVE_JOB_STORAGE_KEY = 'minicert.activeJobId';

interface WorkspaceContextValue {
  overview: OverviewResponse | null;
  architecture: ModelArchitectureResponse | null;
  activeExperimentId: string | null;
  setActiveExperimentId: (id: string | null) => void;
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  refreshWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function readStoredString(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string | null): void {
  try {
    if (value) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [architecture, setArchitecture] = useState<ModelArchitectureResponse | null>(null);
  const [activeExperimentId, setActiveExperimentIdState] = useState<string | null>(() =>
    readStoredString(ACTIVE_EXP_STORAGE_KEY),
  );
  const [activeJobId, setActiveJobIdState] = useState<string | null>(() =>
    readStoredString(ACTIVE_JOB_STORAGE_KEY),
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  const setActiveExperimentId = useCallback((id: string | null) => {
    setActiveExperimentIdState(id);
    writeStoredString(ACTIVE_EXP_STORAGE_KEY, id);
  }, []);

  const setActiveJobId = useCallback((id: string | null) => {
    setActiveJobIdState(id);
    writeStoredString(ACTIVE_JOB_STORAGE_KEY, id);
  }, []);

  const refreshWorkspace = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      minicertApi.getOverview(controller.signal),
      minicertApi.getModelArchitecture(controller.signal),
    ])
      .then(([ovData, archData]) => {
        setOverview(ovData);
        setArchitecture(archData);
        setError(null);
        setActiveExperimentIdState((current) => {
          const resolved =
            current ?? ovData.latest_completed_experiment?.experiment_id ?? null;
          writeStoredString(ACTIVE_EXP_STORAGE_KEY, resolved);
          return resolved;
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiError) {
          setError(err.detail);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Unexpected error while loading MiniCert workspace metadata.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadTick]);

  return (
    <WorkspaceContext.Provider
      value={{
        overview,
        architecture,
        activeExperimentId,
        setActiveExperimentId,
        activeJobId,
        setActiveJobId,
        loading,
        error,
        refreshWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
