export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getWebEnvironment } = await import('./server/config');
    getWebEnvironment();
  }
}
