import { measureColumnWidth, padToWidth, style, symbols } from '#cli/output.js';
import type { AuthLoginResult } from '#cli/auth/handlers/auth-login.handler.js';
import type { AuthLogoutResult } from '#cli/auth/handlers/auth-logout.handler.js';
import type { ProviderAuthStatus } from '#installation/provider/auth.js';
import type { AuthStatusResult } from '#cli/auth/handlers/auth-status.handler.js';

function providerAuthSymbol(status: ProviderAuthStatus): string {
  switch (status.status) {
    case 'signed-in':
      return symbols.ok;
    case 'signed-out':
      return symbols.pending;
    case 'cli-not-found':
    case 'check-failed':
      return symbols.warn;
  }
}

function providerAuthColor(status: ProviderAuthStatus): (text: string) => string {
  switch (status.status) {
    case 'signed-in':
      return style.success;
    case 'signed-out':
      return style.muted;
    case 'cli-not-found':
    case 'check-failed':
      return style.warn;
  }
}

function providerAuthDetail(status: ProviderAuthStatus): string {
  switch (status.status) {
    case 'signed-in':
      return status.method;
    case 'signed-out':
      return 'not signed in';
    case 'cli-not-found':
      return 'CLI not found';
    case 'check-failed':
      return 'check failed';
  }
}

function renderNoProviderAuthWarning(): void {
  console.log('');
  console.log(`${style.warn(symbols.warn)} No AI provider is signed in.`);
  console.log(style.muted('  Agent nodes need one — bash-only workflows run without it.'));
  console.log(style.muted('  Sign in with "orc auth login <provider>".'));
}

export function renderProviderAuths(result: AuthStatusResult): void {
  const { providerAuths: auths } = result;

  console.log('');
  console.log(style.strong('Providers'));

  const idWidth = measureColumnWidth(auths.map((auth) => auth.id));
  for (const auth of auths) {
    const symbol = providerAuthColor(auth.status)(providerAuthSymbol(auth.status));
    const id = padToWidth(auth.id, idWidth);
    const detail = style.muted(providerAuthDetail(auth.status));
    console.log(`  ${symbol} ${id}   ${detail}`);
  }

  const hasProviderAuth = auths.some((auth) => auth.status.status === 'signed-in');
  if (!hasProviderAuth) {
    renderNoProviderAuthWarning();
  }
}

export function renderProviderSignInNote(note: string): void {
  console.log('');
  console.log(style.muted(`  ${note}`));
  console.log('');
}

function renderProviderSignedIn(id: string, method: string): void {
  console.log('');
  console.log(`${style.success(symbols.ok)} ${id} signed in  ${style.muted(`·  ${method}`)}`);
}

function renderProviderCliNotFound(id: string): void {
  console.log('');
  console.log(`${style.error(symbols.fail)} The ${id} CLI is not available.`);
}

function renderProviderAlreadySignedIn(id: string, method: string): void {
  console.log('');
  console.log(
    `${style.muted(symbols.info)} ${id} is already signed in  ${style.muted(`·  ${method}`)}`,
  );
  console.log(style.muted(`  Run "orc auth logout ${id}" first to sign in as someone else.`));
}

function renderProviderSignInFailed(id: string): void {
  console.log('');
  console.log(`${style.error(symbols.fail)} ${id} is not signed in.`);
}

export function renderAuthLoginResult(result: AuthLoginResult): void {
  switch (result.outcome) {
    case 'cli-not-found':
      renderProviderCliNotFound(result.providerId);
      break;
    case 'already-signed-in':
      renderProviderAlreadySignedIn(result.providerId, result.method);
      break;
    case 'signed-in':
      renderProviderSignedIn(result.providerId, result.method);
      break;
    case 'sign-in-failed':
      renderProviderSignInFailed(result.providerId);
      break;
    default:
      result satisfies never;
  }
}

function renderProviderSignedOut(id: string): void {
  console.log('');
  console.log(`${style.success(symbols.ok)} ${id} signed out`);
}

function renderProviderAlreadySignedOut(id: string): void {
  console.log('');
  console.log(`${style.muted(symbols.info)} ${id} is already signed out.`);
}

function renderProviderSignOutFailed(id: string): void {
  console.log('');
  console.log(`${style.error(symbols.fail)} ${id} is still signed in.`);
}

export function renderAuthLogoutResult(result: AuthLogoutResult): void {
  const { outcome, providerId } = result;

  switch (outcome) {
    case 'cli-not-found':
      renderProviderCliNotFound(providerId);
      break;
    case 'already-signed-out':
      renderProviderAlreadySignedOut(providerId);
      break;
    case 'signed-out':
      renderProviderSignedOut(providerId);
      break;
    case 'sign-out-failed':
      renderProviderSignOutFailed(providerId);
      break;
    default:
      outcome satisfies never;
  }
}
