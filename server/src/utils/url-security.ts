import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../middleware/error-handler.js';

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  allowedContentTypes?: string[];
}

const DEFAULT_OPTIONS: Required<SafeFetchOptions> = {
  maxRedirects: 5,
  timeoutMs: 10000,
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  allowedContentTypes: [
    'text/html',
    'application/xhtml+xml',
    'text/plain',
  ],
};

/**
 * Checks whether an IPv4 address is in a private, loopback, or reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed, treat as unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (b0 === 10) return true;
  // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata service 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16 (Private network)
  if (b0 === 192 && b1 === 168) return true;
  // 198.18.0.0/15 (Network benchmark tests)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is in a private, loopback, or reserved range.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback (::1) & unspecified (::)
  if (normalized === '::1' || normalized === '::') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part);
    }
  }

  // Unique local address (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-local address (fe80::/10 -> fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(normalized)) return true;

  return false;
}

/**
 * Validates a URL and its resolved IP addresses to protect against SSRF.
 */
export async function validateUrlSafety(urlStr: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw new AppError('The provided URL is malformed or invalid.', 400, 'INVALID_URL');
  }

  // Protocol validation: must be http or https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new AppError(
      `Unsupported protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are allowed.`,
      400,
      'INVALID_PROTOCOL',
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Reject explicit localhost or numerical dot representations of loopback
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  ) {
    throw new AppError(
      'Requests to localhost or loopback addresses are blocked for security.',
      403,
      'SSRF_BLOCKED',
    );
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      throw new AppError(
        'Requests to private or internal IP addresses are blocked for security.',
        403,
        'SSRF_BLOCKED',
      );
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      throw new AppError(
        'Requests to private or local IPv6 addresses are blocked for security.',
        403,
        'SSRF_BLOCKED',
      );
    }
  } else {
    // Resolve DNS and inspect resolved IPs
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (!records || records.length === 0) {
        throw new AppError(`Could not resolve hostname "${hostname}".`, 404, 'DNS_LOOKUP_FAILED');
      }

      for (const rec of records) {
        if (rec.family === 4 && isPrivateIPv4(rec.address)) {
          throw new AppError(
            `Hostname "${hostname}" resolved to a private/internal IP address (${rec.address}) which is blocked.`,
            403,
            'SSRF_BLOCKED',
          );
        }
        if (rec.family === 6 && isPrivateIPv6(rec.address)) {
          throw new AppError(
            `Hostname "${hostname}" resolved to an internal IPv6 address which is blocked.`,
            403,
            'SSRF_BLOCKED',
          );
        }
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Failed to resolve domain "${hostname}": ${err.message || 'Domain not found'}`,
        400,
        'DNS_ERROR',
      );
    }
  }

  return parsedUrl;
}

export interface SafeFetchResult {
  finalUrl: string;
  html: string;
  contentType: string;
}

export function describeSafeFetchConnectionError(url: URL, error: unknown): AppError {
  const err = error as { code?: string; cause?: { code?: string } };
  const networkCode = String(err?.code || err?.cause?.code || '').toUpperCase();
  if (url.protocol === 'https:' && /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(networkCode)) {
    return new AppError(
      'The website HTTPS certificate could not be verified. Check the address or open the page in Chrome, press Ctrl+P, choose Save as PDF, and upload the PDF; you can also paste the article text.',
      502,
      'HTTPS_CERTIFICATE_ERROR',
    );
  }
  return new AppError(
    `Could not securely connect to ${url.hostname}. Check the web address and connection, or open the page in Chrome, press Ctrl+P, choose Save as PDF, and upload it; you can also paste the article text.`,
    502,
    'NETWORK_ERROR',
  );
}

/**
 * Safely fetches an HTTP(S) URL following redirects, validating every hop against SSRF,
 * enforcing timeouts and response byte limits.
 */
export async function safeFetchUrl(
  inputUrl: string,
  userOptions?: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  let currentUrl = inputUrl;
  let redirectCount = 0;

  while (true) {
    const validatedUrl = await validateUrlSafety(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    let res: Response;
    try {
      res = await fetch(validatedUrl.toString(), {
        method: 'GET',
        redirect: 'manual', // handle redirects manually so each hop is verified
        signal: controller.signal,
        headers: {
          'User-Agent': 'ListenWise/1.0 (+https://listenwise.local; Educational content extractor)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new AppError(
          `Request timed out after ${options.timeoutMs / 1000} seconds. The server took too long to respond.`,
          504,
          'FETCH_TIMEOUT',
        );
      }
      throw describeSafeFetchConnectionError(validatedUrl, err);
    }

    clearTimeout(timeout);

    // Handle redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      redirectCount++;
      if (redirectCount > options.maxRedirects) {
        throw new AppError(
          `Too many redirects (exceeded limit of ${options.maxRedirects}).`,
          400,
          'TOO_MANY_REDIRECTS',
        );
      }
      const location = res.headers.get('location');
      if (!location) {
        throw new AppError('Redirect response without Location header.', 400, 'INVALID_REDIRECT');
      }
      // Resolve relative redirect against current URL
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new AppError(
          'This website requires sign-in. Open the page in Chrome where you can access it, press Ctrl+P, choose Save as PDF, and upload that PDF; or paste the article text.',
          422,
          'SOURCE_LOGIN_REQUIRED',
        );
      }
      if (res.status === 403 || res.status === 429) {
        throw new AppError(
          'This website denied automated access and may require sign-in or anti-bot verification. Open it in Chrome, press Ctrl+P, choose Save as PDF, and upload that PDF; or paste the article text.',
          422,
          'SOURCE_AUTOMATED_ACCESS_BLOCKED',
        );
      }
      if (res.status >= 500) {
        throw new AppError('The website is temporarily unavailable. Try again later, or save the page as a PDF in Chrome and upload it.', 503, 'WEBSITE_TEMPORARILY_UNAVAILABLE');
      }
      if (res.status === 404 || res.status === 410) {
        throw new AppError('This webpage was not found. Check the URL or open the page in Chrome and save it as a PDF.', 404, 'WEBSITE_PAGE_NOT_FOUND');
      }
      throw new AppError(
        `The website returned HTTP ${res.status}. Check that the address is correct and publicly accessible, or paste the article text.`,
        res.status >= 400 && res.status < 500 ? 400 : 502,
        'HTTP_STATUS_ERROR',
      );
    }

    // Validate Content-Type
    const contentTypeHeader = res.headers.get('content-type') || 'text/html';
    const mime = contentTypeHeader.split(';')[0].trim().toLowerCase();

    const isAllowed = options.allowedContentTypes.some((type) => mime.includes(type));
    if (!isAllowed) {
      throw new AppError(
        `Unsupported content type: "${mime}". ListenWise only accepts HTML and plain text web pages.`,
        415,
        'UNSUPPORTED_CONTENT_TYPE',
      );
    }

    // Read body with byte size limit
    if (!res.body) {
      throw new AppError('Empty response body received from server.', 400, 'EMPTY_BODY');
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        if (receivedBytes > options.maxSizeBytes) {
          reader.cancel();
          throw new AppError(
            `Page size exceeded the allowed limit of ${Math.round(options.maxSizeBytes / (1024 * 1024))} MB.`,
            413,
            'CONTENT_TOO_LARGE',
          );
        }
        chunks.push(value);
      }
    }

    const totalBuffer = Buffer.concat(chunks);
    const html = totalBuffer.toString('utf-8');

    return {
      finalUrl: currentUrl,
      html,
      contentType: mime,
    };
  }
}
