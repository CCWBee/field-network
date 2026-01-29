/**
 * Helper to safely extract string from query param
 */
export function queryString(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}

/**
 * Helper to safely extract required string from query param
 */
export function queryStringRequired(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param || '';
}
