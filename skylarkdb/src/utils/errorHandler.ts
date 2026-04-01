/**
 * 统一的错误处理工具
 * 在开发环境输出到 console，生产环境可发送到错误追踪服务
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  module?: string;
}

export enum ErrorType {
  CONNECTION = 'CONNECTION',
  DATABASE = 'DATABASE',
  QUERY = 'QUERY',
  PERMISSION = 'PERMISSION',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

export interface UserFriendlyError {
  type: ErrorType;
  title: string;
  message: string;
  suggestion?: string;
  originalError?: unknown;
}

/**
 * 将原始错误转换为用户友好的错误消息
 */
export const getUserFriendlyError = (error: unknown, context?: string): UserFriendlyError => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // 数据库连接错误
  if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
    return {
      type: ErrorType.CONNECTION,
      title: '连接失败',
      message: errorMessage,
      suggestion: '请检查数据库服务是否运行，以及主机名、端口和凭据是否正确',
      originalError: error,
    };
  }

  // 认证/权限错误
  if (
    errorMessage.includes('access denied') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('permission')
  ) {
    return {
      type: ErrorType.PERMISSION,
      title: '权限错误',
      message: errorMessage,
      suggestion: '请检查用户名和密码是否正确，或联系管理员获取相应权限',
      originalError: error,
    };
  }

  // SQL 语法错误
  if (errorMessage.includes('syntax') || errorMessage.includes('SQL')) {
    return {
      type: ErrorType.QUERY,
      title: '查询错误',
      message: errorMessage,
      suggestion: '请检查 SQL 语法是否正确',
      originalError: error,
    };
  }

  // 网络错误
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('ECONNREFUSED')
  ) {
    return {
      type: ErrorType.NETWORK,
      title: '网络错误',
      message: '无法连接到数据库服务器',
      suggestion: '请检查网络连接和防火墙设置',
      originalError: error,
    };
  }

  // 数据验证错误
  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('required')
  ) {
    return {
      type: ErrorType.VALIDATION,
      title: '数据验证失败',
      message: errorMessage,
      suggestion: '请检查输入的数据格式是否正确',
      originalError: error,
    };
  }

  // 默认未知错误
  return {
    type: ErrorType.UNKNOWN,
    title: '操作失败',
    message: errorMessage,
    suggestion: context ? `在${context}时发生错误，请稍后重试` : '请稍后重试',
    originalError: error,
  };
};

export const logError = (
  context: string | ErrorContext,
  error: unknown,
  additionalData?: Record<string, unknown>
) => {
  const contextStr =
    typeof context === 'string'
      ? context
      : `${context.module || ''} ${context.action || ''}`.trim();

  const userError = getUserFriendlyError(error, contextStr);

  if (import.meta.env.DEV) {
    console.error(`[SkylarkDB Error] ${contextStr}:`, error, additionalData || '');
    console.error(`[User Message] ${userError.title}: ${userError.message}`);
    if (userError.suggestion) {
      console.error(`[Suggestion] ${userError.suggestion}`);
    }
  }

  // 生产环境错误追踪（预留接口）
  if (import.meta.env.PROD) {
    // TODO: 集成 Sentry、LogRocket 或其他错误追踪服务
    // sendToErrorTracking({ context, error: userError, additionalData });

    // 生产环境只记录用户友好的错误信息
    console.error(`[SkylarkDB] ${userError.title}: ${userError.message}`);
  }
};

export const logWarning = (
  context: string | ErrorContext,
  message: string,
  additionalData?: Record<string, unknown>
) => {
  const contextStr =
    typeof context === 'string'
      ? context
      : `${context.module || ''} ${context.action || ''}`.trim();

  if (import.meta.env.DEV) {
    console.warn(`[SkylarkDB Warning] ${contextStr}:`, message, additionalData || '');
  }
};

export const logInfo = (
  context: string | ErrorContext,
  message: string,
  additionalData?: Record<string, unknown>
) => {
  const contextStr =
    typeof context === 'string'
      ? context
      : `${context.module || ''} ${context.action || ''}`.trim();

  if (import.meta.env.DEV) {
    console.info(`[SkylarkDB Info] ${contextStr}:`, message, additionalData || '');
  }
};

/**
 * 显示错误提示给用户（可集成到 UI 组件）
 */
export const showErrorToast = (error: unknown, context?: string) => {
  const userError = getUserFriendlyError(error, context);

  // 这里可以集成到 toast 通知系统
  // 例如：toast.error(`${userError.title}: ${userError.message}`);

  // 临时使用 alert
  if (typeof window !== 'undefined') {
    alert(`${userError.title}\n\n${userError.message}\n\n建议：${userError.suggestion}`);
  }
};
