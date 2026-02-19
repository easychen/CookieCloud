function readHeader(req, headerName) {
  return String(req.headers[headerName] || '').trim();
}

function getLazycatIdentity(req) {
  const userId = readHeader(req, 'x-hc-user-id')
    || readHeader(req, 'x-lzc-user-id')
    || readHeader(req, 'x-lazycat-user-id');

  const userName = readHeader(req, 'x-hc-user-name')
    || readHeader(req, 'x-lzc-user-name')
    || readHeader(req, 'x-lazycat-user-name');

  const displayName = readHeader(req, 'x-hc-user-display-name')
    || readHeader(req, 'x-lzc-user-display-name');

  return {
    user_id: userId,
    user_name: userName,
    display_name: displayName
  };
}

function getClientIp(req) {
  const xForwardedFor = readHeader(req, 'x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  return String(req.ip || req.connection?.remoteAddress || '').trim();
}

function createSetupAuthMiddleware(options = {}) {
  const logger = options.logger || console;

  return function setupAuthMiddleware(req, res, next) {
    const identity = getLazycatIdentity(req);

    if (!identity.user_id) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('setup auth blocked request: missing lazycat user header', {
          path: req.originalUrl,
          method: req.method
        });
      }

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing LazyCat login header (X-HC-User-ID)'
      });
      return;
    }

    req.lazycat_user = identity;
    next();
  };
}

module.exports = {
  getLazycatIdentity,
  getClientIp,
  createSetupAuthMiddleware
};
