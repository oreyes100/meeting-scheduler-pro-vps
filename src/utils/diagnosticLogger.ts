export const diagnosticLogger = (msg: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[Diagnostic ${timestamp}] ${msg}`, data ?? '');
};
