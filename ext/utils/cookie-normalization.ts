export interface CookieNormalizationResult {
  details: Record<string, any>;
  warnings: string[];
}

export function createCookieSetFallbacks(
  details: Record<string, any>,
): Record<string, any>[] {
  const fallbacks: Record<string, any>[] = [];
  const seen = new Set<string>();
  const add = (candidate: Record<string, any>) => {
    const key = JSON.stringify(candidate);
    if (!seen.has(key) && key !== JSON.stringify(details)) {
      seen.add(key);
      fallbacks.push(candidate);
    }
  };

  let current = { ...details };
  if (typeof current.domain === 'string' && current.domain.startsWith('.')) {
    current = { ...current, domain: current.domain.replace(/^\.+/, '') };
    add(current);
  }
  if ('sameSite' in current) {
    const { sameSite: _sameSite, ...withoutSameSite } = current;
    current = withoutSameSite;
    add(current);
  }
  if ('expirationDate' in current) {
    const { expirationDate: _expirationDate, ...withoutExpiration } = current;
    current = withoutExpiration;
    add(current);
  }
  if (!current.secure && typeof current.url === 'string' && current.url.startsWith('http://')) {
    current = {
      ...current,
      secure: true,
      url: current.url.replace(/^http:\/\//, 'https://'),
    };
    add(current);
  }
  if ('domain' in current) {
    const { domain: _domain, ...hostOnly } = current;
    current = hostOnly;
    add(current);
  }

  return fallbacks;
}

const VALID_SAME_SITE = new Set(['no_restriction', 'lax', 'strict']);

function normalizedPath(path: unknown): string {
  const value = typeof path === 'string' && path.length ? path : '/';
  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizeCookieForSet(
  cookie: Record<string, any>,
  expireMinutes?: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): CookieNormalizationResult {
  const warnings: string[] = [];
  const name = typeof cookie.name === 'string' ? cookie.name : '';
  const value = typeof cookie.value === 'string' ? cookie.value : '';
  const rawDomain = typeof cookie.domain === 'string' ? cookie.domain.trim() : '';
  const hostname = rawDomain.replace(/^\.+/, '');

  if (!hostname) {
    throw new Error('Cookie domain is empty');
  }

  let path = normalizedPath(cookie.path);
  let secure = Boolean(cookie.secure);
  let httpOnly = Boolean(cookie.httpOnly);
  const isHostPrefixed = name.startsWith('__Host-');
  const isHostHttpPrefixed = name.startsWith('__Host-Http-');
  const isSecurePrefixed = name.startsWith('__Secure-');

  if (isHostPrefixed || isHostHttpPrefixed) {
    path = '/';
    secure = true;
  }
  if (isHostHttpPrefixed) {
    httpOnly = true;
  }
  if (isSecurePrefixed) {
    secure = true;
  }

  const details: Record<string, any> = {
    url: `http${secure ? 's' : ''}://${hostname}${path}`,
    name,
    value,
    path,
    secure,
    httpOnly,
  };

  // Supplying Domain converts a host-only cookie into a domain cookie. The
  // __Host- family explicitly forbids Domain, so omit it in both cases.
  if (!cookie.hostOnly && !isHostPrefixed && !isHostHttpPrefixed) {
    details.domain = rawDomain;
  }

  if (VALID_SAME_SITE.has(cookie.sameSite)) {
    details.sameSite = cookie.sameSite;
  } else if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
    warnings.push(`Unsupported SameSite value omitted: ${cookie.sameSite}`);
  }

  const topLevelSite = cookie.partitionKey?.topLevelSite;
  if (typeof topLevelSite === 'string' && topLevelSite.length) {
    details.partitionKey = { topLevelSite };
  } else if (cookie.partitionKey) {
    warnings.push('Partition key without topLevelSite was omitted');
  }

  const requestedMinutes = Number(expireMinutes);
  if (Number.isFinite(requestedMinutes) && requestedMinutes > 0) {
    details.expirationDate = nowSeconds + requestedMinutes * 60;
  } else if (!cookie.session && Number.isFinite(Number(cookie.expirationDate))) {
    details.expirationDate = Number(cookie.expirationDate);
  }

  return { details, warnings };
}
