export function foldSearchText(value: string) {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function searchTokens(query: string) {
  return foldSearchText(query)
    .split(/\s+/)
    .filter(Boolean);
}

function compactSearchText(value: string) {
  return value.replace(/[^a-z0-9]+/g, "");
}

function searchWords(value: string) {
  return foldSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function wordMatchesToken(word: string, token: string) {
  if (word === token) return true;
  return token.length >= 4 && word.startsWith(token);
}

export function matchesSearchText(haystack: string, query: string) {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const words = searchWords(haystack);
  const compactHay = compactSearchText(foldSearchText(haystack));
  return tokens.every((token) => {
    const compactToken = compactSearchText(token);
    if (compactToken && /\d/.test(compactToken) && compactHay.includes(compactToken)) return true;
    const parts = token.split(/[^a-z0-9]+/).filter(Boolean);
    const pieces = parts.length ? parts : [token];
    return pieces.every((part) => words.some((word) => wordMatchesToken(word, part)));
  });
}
