import { sql, type SQL } from "drizzle-orm";

const VI_FOLD: [string, string][] = [
  ["à", "a"], ["á", "a"], ["ả", "a"], ["ã", "a"], ["ạ", "a"],
  ["ă", "a"], ["ằ", "a"], ["ắ", "a"], ["ẳ", "a"], ["ẵ", "a"], ["ặ", "a"],
  ["â", "a"], ["ầ", "a"], ["ấ", "a"], ["ẩ", "a"], ["ẫ", "a"], ["ậ", "a"],
  ["è", "e"], ["é", "e"], ["ẻ", "e"], ["ẽ", "e"], ["ẹ", "e"],
  ["ê", "e"], ["ề", "e"], ["ế", "e"], ["ể", "e"], ["ễ", "e"], ["ệ", "e"],
  ["ì", "i"], ["í", "i"], ["ỉ", "i"], ["ĩ", "i"], ["ị", "i"],
  ["ò", "o"], ["ó", "o"], ["ỏ", "o"], ["õ", "o"], ["ọ", "o"],
  ["ô", "o"], ["ồ", "o"], ["ố", "o"], ["ổ", "o"], ["ỗ", "o"], ["ộ", "o"],
  ["ơ", "o"], ["ờ", "o"], ["ớ", "o"], ["ở", "o"], ["ỡ", "o"], ["ợ", "o"],
  ["ù", "u"], ["ú", "u"], ["ủ", "u"], ["ũ", "u"], ["ụ", "u"],
  ["ư", "u"], ["ừ", "u"], ["ứ", "u"], ["ử", "u"], ["ữ", "u"], ["ự", "u"],
  ["ỳ", "y"], ["ý", "y"], ["ỷ", "y"], ["ỹ", "y"], ["ỵ", "y"],
  ["đ", "d"],
];

export function foldSearchText(value: string) {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sqlLit(value: string) {
  return sql.raw(`'${value.replace(/'/g, "''")}'`);
}

const FOLD_PAIRS: [string, string][] = [...VI_FOLD, ...VI_FOLD.map(([from, to]) => [from.toUpperCase(), to] as [string, string])];
const FOLD_CHUNK = 8;

export function sqlFolded(column: SQL) {
  return sql`replace(replace(lower(${column}), ${sqlLit("đ")}, 'd'), ${sqlLit("Đ")}, 'd')`;
}

export function sqlFoldSteps(column: SQL) {
  const steps: SQL[] = [];
  for (let index = 0; index < FOLD_PAIRS.length; index += FOLD_CHUNK) {
    const start = index === 0 ? column : sql`hay`;
    steps.push(
      FOLD_PAIRS.slice(index, index + FOLD_CHUNK).reduce(
        (expr, [from, to]) => sql`replace(${expr}, ${sqlLit(from)}, ${sqlLit(to)})`,
        start,
      ),
    );
  }
  return steps;
}

export function sqlCompact(column: SQL) {
  return sql`replace(replace(replace(replace(lower(${column}), ' ', ''), '.', ''), '-', ''), '/', '')`;
}

export function searchTokens(query: string) {
  return foldSearchText(query)
    .split(/\s+/)
    .filter(Boolean);
}

export function compactSearchText(value: string) {
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
