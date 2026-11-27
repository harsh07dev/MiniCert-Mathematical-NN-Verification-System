import { apiRequest, buildApiUrl } from './client';
import type {
  ComparisonRequest,
  ComparisonResponse,
  ExperimentCreateRequest,
  ExperimentJobAcceptedResponse,
  ExperimentJobStatusResponse,
  ExperimentResultsResponse,
  HealthResponse,
  HistoryDetailResponse,
  HistoryListResponse,
  HistoryRefreshResponse,
  ModelArchitectureResponse,
  OverviewResponse,
  SamplePreviewResponse,
  VerificationRequest,
  VerificationResponse,
} from './types';

export const minicertApi = {
  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return apiRequest<HealthResponse>('/api/health', { signal });
  },

  getOverview(signal?: AbortSignal): Promise<OverviewResponse> {
    return apiRequest<OverviewResponse>('/api/overview', { signal });
  },

  getModelArchitecture(signal?: AbortSignal): Promise<ModelArchitectureResponse> {
    return apiRequest<ModelArchitectureResponse>('/api/model/architecture', { signal });
  },

  getSamplePreview(
    sampleIndex: number,
    signal?: AbortSignal,
  ): Promise<SamplePreviewResponse> {
    return apiRequest<SamplePreviewResponse>(`/api/samples/${sampleIndex}`, { signal });
  },

  verifySample(
    payload: VerificationRequest,
    signal?: AbortSignal,
  ): Promise<VerificationResponse> {
    return apiRequest<VerificationResponse>('/api/verification', {
      method: 'POST',
      body: payload,
      signal,
    });
  },

  createExperiment(
    payload: ExperimentCreateRequest,
    signal?: AbortSignal,
  ): Promise<ExperimentJobAcceptedResponse> {
    return apiRequest<ExperimentJobAcceptedResponse>('/api/experiments', {
      method: 'POST',
      body: payload,
      signal,
    });
  },

  getExperimentStatus(
    experimentId: string,
    signal?: AbortSignal,
  ): Promise<ExperimentJobStatusResponse> {
    return apiRequest<ExperimentJobStatusResponse>(
      `/api/experiments/${encodeURIComponent(experimentId)}/status`,
      { signal },
    );
  },

  getExperimentEventsUrl(experimentId: string): string {
    return buildApiUrl(`/api/experiments/${encodeURIComponent(experimentId)}/events`);
  },

  getExperimentResults(
    experimentId: string,
    signal?: AbortSignal,
  ): Promise<ExperimentResultsResponse> {
    return apiRequest<ExperimentResultsResponse>(
      `/api/experiments/${encodeURIComponent(experimentId)}/results`,
      { signal },
    );
  },

  getHistory(signal?: AbortSignal): Promise<HistoryListResponse> {
    return apiRequest<HistoryListResponse>('/api/history', { signal });
  },

  refreshHistory(signal?: AbortSignal): Promise<HistoryRefreshResponse> {
    return apiRequest<HistoryRefreshResponse>('/api/history/refresh', {
      method: 'POST',
      signal,
    });
  },

  getHistoryDetail(
    experimentId: string,
    signal?: AbortSignal,
  ): Promise<HistoryDetailResponse> {
    return apiRequest<HistoryDetailResponse>(
      `/api/history/${encodeURIComponent(experimentId)}`,
      { signal },
    );
  },

  compareExperiments(
    payload: ComparisonRequest,
    signal?: AbortSignal,
  ): Promise<ComparisonResponse> {
    return apiRequest<ComparisonResponse>('/api/comparison', {
      method: 'POST',
      body: payload,
      signal,
    });
  },

  getExportCsvUrl(experimentId: string): string {
    return buildApiUrl(`/api/exports/${encodeURIComponent(experimentId)}/csv`);
  },

  getExportJsonUrl(experimentId: string): string {
    return buildApiUrl(`/api/exports/${encodeURIComponent(experimentId)}/json`);
  },
};
