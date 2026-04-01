/**
 * API 调用包装器，提供统一的错误处理和类型安全
 */

import { logError } from './errorHandler';
import { ApiResponse } from '@/types/api';

export interface ApiCallOptions {
  timeout?: number;
  retries?: number;
  context?: string;
}

export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: string,
  options: ApiCallOptions = {}
): Promise<T> => {
  const { timeout = 30000, retries = 0, context: customContext } = options;
  const finalContext = customContext || context;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 添加超时控制
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timeout after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } catch (error) {
      lastError = error;

      // 最后一次重试或不是网络错误时不重试
      if (attempt === retries || !isRetriableError(error)) {
        logError(finalContext, error, { attempt: attempt + 1, maxRetries: retries });
        throw error;
      }

      // 指数退避重试
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

const isRetriableError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const retriableMessages = [
      'network',
      'timeout',
      'connection refused',
      'service unavailable',
      'internal server error',
    ];

    return retriableMessages.some(msg => error.message.toLowerCase().includes(msg));
  }
  return false;
};

export const safeApiCall = async <T>(
  apiCall: Promise<ApiResponse<T>>,
  context: string
): Promise<T> => {
  try {
    const response = await apiCall;

    if (!response.success) {
      throw new Error(response.error || response.message || 'API call failed');
    }

    if (!response.data) {
      throw new Error('API response missing data');
    }

    return response.data;
  } catch (error) {
    logError(context, error);
    throw error;
  }
};

export const createApiContext = (module: string, action: string) => ({
  module,
  action,
});
