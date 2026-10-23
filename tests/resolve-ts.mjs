// Resolve extensionless TypeScript imports for the adopted engine's Node tests.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
}
