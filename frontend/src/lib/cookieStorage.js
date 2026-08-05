/**
 * A supabase-js storage adapter backed by document.cookie instead of
 * localStorage, so the session travels with same-origin requests to the API.
 *
 * Browsers cap a cookie at roughly 4096 bytes across name, value, and
 * attributes. A Supabase session carrying OAuth user metadata regularly
 * exceeds that, so values are split across numbered chunks (`key.0`, `key.1`,
 * ...) and rejoined on read -- the same approach @supabase/ssr takes.
 */

// 4096 minus headroom for the cookie name and the attribute string.
const MAX_CHUNK_SIZE = 3000;

function readAllCookies() {
  const jar = {};

  for (const pair of document.cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;

    jar[pair.slice(0, separator).trim()] = pair.slice(separator + 1);
  }

  return jar;
}

function buildAttributes() {
  const attributes = ["Path=/", "SameSite=Lax", `Max-Age=${60 * 60 * 24 * 365}`];

  // Secure would make the cookie unwritable over plain http://localhost.
  if (window.location.protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function writeCookie(name, value) {
  document.cookie = `${name}=${value}; ${buildAttributes()}`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Every cookie name currently holding part of `key`, chunked or whole. */
function existingNames(key, jar = readAllCookies()) {
  return Object.keys(jar).filter((name) => name === key || name.startsWith(`${key}.`));
}

export const cookieStorage = {
  getItem(key) {
    const jar = readAllCookies();

    // Unchunked values are stored under the bare key.
    if (jar[key] !== undefined) {
      return decodeURIComponent(jar[key]);
    }

    let encoded = "";

    // Chunks are contiguous from 0; the first gap marks the end.
    for (let index = 0; jar[`${key}.${index}`] !== undefined; index += 1) {
      encoded += jar[`${key}.${index}`];
    }

    return encoded ? decodeURIComponent(encoded) : null;
  },

  setItem(key, value) {
    // Encode before splitting so a chunk boundary can never land inside a
    // percent escape -- chunks are rejoined before decoding.
    const encoded = encodeURIComponent(value);

    // Clear first: a shrinking value would otherwise strand stale chunks that
    // getItem would happily read back.
    for (const name of existingNames(key)) {
      deleteCookie(name);
    }

    if (encoded.length <= MAX_CHUNK_SIZE) {
      writeCookie(key, encoded);
      return;
    }

    for (let index = 0; index * MAX_CHUNK_SIZE < encoded.length; index += 1) {
      const start = index * MAX_CHUNK_SIZE;
      writeCookie(`${key}.${index}`, encoded.slice(start, start + MAX_CHUNK_SIZE));
    }
  },

  removeItem(key) {
    for (const name of existingNames(key)) {
      deleteCookie(name);
    }
  },
};
