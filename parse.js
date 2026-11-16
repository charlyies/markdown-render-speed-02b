// A fast CommonMark 0.31.2 + GFM 0.29 renderer whose parse(markdown) returns
// the HTML marked 18.1.3 renders with its default options. Written from the
// CommonMark and GFM specifications, with marked's observed behaviour (as
// shown by the competition's practice set) winning wherever it departs
// from the specs.

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
function isAsciiPunctCode(c) {
  return c < 128 ? PUNCT.indexOf(String.fromCharCode(c)) >= 0 : false;
}
// CommonMark "Unicode punctuation": general category P or S.
function isPunctCode(c) {
  return c < 128 ? PUNCT.indexOf(String.fromCharCode(c)) >= 0 : /[\p{P}\p{S}]/u.test(String.fromCodePoint(c));
}
function isWsCode(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 0x85 ||
    c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 ||
    c === 0x202f || c === 0x205f || c === 0x3000;
}
function isDigitCode(c) { return c >= 48 && c <= 57; }
function isAlphaCode(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isAlnumCode(c) { return isAlphaCode(c) || isDigitCode(c); }

// Escape text for HTML output. `&` is left alone when it starts a valid
// named or numeric entity reference (marked passes those through verbatim
// in text); every other `&` becomes `&amp;`. `<`, `>`, `"` and `'` are
// always escaped.
function esc(s) {
  let out = '';
  let i = 0;
  const n = s.length;
  let j = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 38) { // &
      const e = entityAt(s, i, n);
      if (e > 0) {
        if (j < i) out += s.slice(j, i);
        out += s.slice(i, i + e);
        i += e; j = i;
        continue;
      }
      if (j < i) out += s.slice(j, i);
      out += '&amp;';
      i++; j = i;
    } else if (c === 60) {
      if (j < i) out += s.slice(j, i);
      out += '&lt;'; i++; j = i;
    } else if (c === 62) {
      if (j < i) out += s.slice(j, i);
      out += '&gt;'; i++; j = i;
    } else if (c === 34) {
      if (j < i) out += s.slice(j, i);
      out += '&quot;'; i++; j = i;
    } else if (c === 39) {
      if (j < i) out += s.slice(j, i);
      out += '&#39;'; i++; j = i;
    } else {
      i++;
    }
  }
  if (j < n) out += s.slice(j, n);
  return out;
}

// Escape for code spans / code blocks: every `&` is escaped (entities are
// not recognised inside code), as are `<`, `>`, `"` and `'`.
function escCode(s) {
  let out = '';
  let i = 0;
  const n = s.length;
  let j = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 38) {
      if (j < i) out += s.slice(j, i);
      out += '&amp;'; i++; j = i;
    } else if (c === 60) {
      if (j < i) out += s.slice(j, i);
      out += '&lt;'; i++; j = i;
    } else if (c === 62) {
      if (j < i) out += s.slice(j, i);
      out += '&gt;'; i++; j = i;
    } else if (c === 34) {
      if (j < i) out += s.slice(j, i);
      out += '&quot;'; i++; j = i;
    } else if (c === 39) {
      if (j < i) out += s.slice(j, i);
      out += '&#39;'; i++; j = i;
    } else {
      i++;
    }
  }
  if (j < n) out += s.slice(j, n);
  return out;
}

// If s has a valid entity reference starting at i, return its length in
// characters; else return 0. Named references are any &name; with name
// matching [A-Za-z][A-Za-z0-9]* (marked passes them through verbatim
// whether or not the name is a defined entity). Numeric references must
// decode to a usable code point.
function entityAt(s, i, n) {
  if (i + 1 >= n) return 0;
  const c1 = s.charCodeAt(i + 1);
  if (c1 === 35) { // #
    let j = i + 2;
    let hex = false;
    if (j < n && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) { hex = true; j++; }
    const start = j;
    let v = 0;
    let ok = false;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (hex ? (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70)
              : (c >= 48 && c <= 57)) {
        v = v * (hex ? 16 : 10) + (c >= 48 && c <= 57 ? c - 48 : (c >= 97 ? c - 87 : c - 55));
        if (v > 0x10ffff) return 0;
        j++;
        ok = true;
      } else break;
    }
    if (!ok || j >= n || s.charCodeAt(j) !== 59) return 0;
    return j + 1 - i;
  }
  if (isAlphaCode(c1)) {
    let j = i + 1;
    while (j < n && isAlnumCode(s.charCodeAt(j))) j++;
    if (j < n && s.charCodeAt(j) === 59 && j > i + 1) return j + 1 - i;
  }
  return 0;
}

// Decode a numeric entity reference starting at i (entityAt has already
// validated it). Returns the replacement string (a single character, or
// U+FFFD for 0 / surrogates).
function decodeNumeric(s, i, n) {
  let j = i + 2;
  let hex = false;
  if (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88) { hex = true; j++; }
  let v = 0;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (hex ? (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70)
            : (c >= 48 && c <= 57)) {
      v = v * (hex ? 16 : 10) + (c >= 48 && c <= 57 ? c - 48 : (c >= 97 ? c - 87 : c - 55));
      j++;
    } else break;
  }
  if (v === 0 || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) return '\uFFFD';
  return String.fromCodePoint(v);
}

// Resolve backslash escapes in a string: `\` + ASCII punctuation becomes
// the punctuation itself; anything else keeps the backslash.
function unescape(s) {
  if (s.indexOf('\\') < 0) return s;
  let out = '';
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 92 && i + 1 < s.length && isAsciiPunctCode(s.charCodeAt(i + 1))) {
      out += s.slice(j, i) + s[i + 1];
      i++;
      j = i + 1;
    }
  }
  return j === 0 ? s : out + s.slice(j);
}

// Clean a link destination the way marked does: percent-encode it (spaces,
// non-ASCII, backslashes, brackets and the like) while leaving any %XX
// sequences already present intact.
function cleanUrl(href) {
  try {
    return encodeURI(href).replace(/%25/g, '%');
  } catch (e) {
    return null;
  }
}

// Normalise a link label: resolve backslash escapes, collapse runs of
// whitespace to a single space, trim, and lower-case.
function normalizeLabel(raw) {
  // labels match on the raw text (backslashes included): `[foo\!]`
  // does not match a `[foo!]` definition (cm-545)
  let s = raw.replace(/\s+/g, ' ');
  // Unicode case folding: sharp s folds to "ss"
  return s.trim().toLowerCase().replace(/ß/g, 'ss');
}

// Parse a link destination starting at position i of s (after any
// whitespace has been skipped). Returns [dest, nextIndex] or null.
// A destination is <...> (no line ending, no unescaped < or > inside) or
// a bare run of non-space characters with balanced parentheses.
function parseDest(s, i, n) {
  if (i >= n) return null;
  const c = s.charCodeAt(i);
  if (c === 60) { // <
    let j = i + 1;
    let out = '';
    let k = j;
    while (j < n) {
      const ch = s.charCodeAt(j);
      if (ch === 10 || ch === 13) return null;
      if (ch === 62) { // >
        out += s.slice(k, j);
        return [unescape(out), j + 1];
      }
      if (ch === 60 || ch === 92) {
        if (ch === 92 && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) {
          out += s.slice(k, j) + s[j + 1];
          j += 2; k = j;
          continue;
        }
        if (ch === 60) return null;
      }
      j++;
    }
    return null;
  }
  // bare destination
  let j = i;
  let depth = 0;
  let out = '';
  let k = j;
  while (j < n) {
    const ch = s.charCodeAt(j);
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13) break;
    if (ch === 40) { depth++; j++; continue; }
    if (ch === 41) {
      if (depth === 0) break;
      depth--; j++; continue;
    }
    if (ch === 92 && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) {
      out += s.slice(k, j) + s[j + 1];
      j += 2; k = j;
      continue;
    }
    j++;
  }
  if (j === i) return ['', i];
  out += s.slice(k, j);
  return [out, j];
}

// Parse a link title starting at i (after whitespace). Returns
// [title, nextIndex] or null. Titles are "..." or '...' or (...), may
// span line endings, and resolve backslash escapes.
function parseTitle(s, i, n) {
  if (i >= n) return null;
  const c = s.charCodeAt(i);
  let open, close;
  if (c === 34) { open = 34; close = 34; }
  else if (c === 39) { open = 39; close = 39; }
  else if (c === 40) { open = 40; close = 41; }
  else return null;
  let j = i + 1;
  let out = '';
  let k = j;
  while (j < n) {
    const ch = s.charCodeAt(j);
    if (ch === close) {
      out += s.slice(k, j);
      return [unescape(out), j + 1];
    }
    if (open === 40 && ch === 40) return null; // unescaped ( inside (...) title
    if (ch === 92 && j + 1 < n) {
      const nc = s.charCodeAt(j + 1);
      if (isAsciiPunctCode(nc) || nc === 10) {
        out += s.slice(k, j) + (nc === 10 ? '\n' : s[j + 1]);
        j += 2; k = j;
        continue;
      }
    }
    j++;
  }
  return null;
}

// Skip spaces/tabs/newlines from i. Returns the new index.
function skipWs(s, i, n) {
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) i++;
    else break;
  }
  return i;
}

// ---- line cursor (tab-aware) ----
// A cursor tracks a position in one line. `tab` is the number of virtual
// spaces remaining from a tab that was only partly consumed.
function cur(s) { return { s: s, i: 0, col: 0, tab: 0, len: s.length }; }
function cch(c) {
  if (c.tab > 0) return 32;
  return c.i < c.len ? c.s.charCodeAt(c.i) : -1;
}
function adv(c, n) {
  while (n > 0) {
    if (c.tab > 0) {
      const d = n < c.tab ? n : c.tab;
      c.tab -= d; c.col += d; n -= d;
    } else if (c.i < c.len) {
      const ch = c.s.charCodeAt(c.i);
      if (ch === 9) {
        const w = 4 - (c.col & 3);
        if (n < w) { c.tab = w - n; c.col += n; c.i++; n = 0; }
        else { c.i++; c.col += w; n -= w; }
      } else { c.i++; c.col++; n--; }
    } else break;
  }
}
function rest(c) {
  return (c.tab > 0 ? ' '.repeat(c.tab) : '') + c.s.slice(c.i);
}

// Code-block content line: like rest(), but leading tabs are expanded to
// spaces (tab stops of 4) from the cursor's column; internal tabs pass
// through literally. A tab that is the very first character at column 0
// is content, not indentation, and stays a literal tab.
function codeLine(c) {
  if (c.tab === 0 && c.col === 0 && c.i < c.len && c.s.charCodeAt(c.i) === 9) return rest(c);
  let out = '';
  let col = c.col;
  if (c.tab > 0) { out += ' '.repeat(c.tab); col += c.tab; }
  let i = c.i;
  const s = c.s, n = c.len;
  while (i < n) {
    const ch = s.charCodeAt(i);
    if (ch === 32) { out += ' '; col++; i++; }
    else if (ch === 9) {
      const w = 4 - (col & 3);
      out += ' '.repeat(w); col += w; i++;
    } else break;
  }
  out += s.slice(i);
  return out;
}
function indentCols(c) {
  let i = c.i, col = c.col, tab = c.tab, n = 0;
  while (tab > 0) { n++; tab--; col++; }
  while (i < c.len) {
    const ch = c.s.charCodeAt(i);
    if (ch === 32) { n++; i++; col++; }
    else if (ch === 9) { const w = 4 - (col & 3); n += w; col += w; i++; }
    else break;
  }
  return n;
}
function isBlankStr(s) {
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch !== 32 && ch !== 9) return false;
  }
  return true;
}
// is the remainder of the line from cursor c blank (spaces/tabs only)?
function isBlankFrom(c) {
  for (let i = c.i; i < c.len; i++) {
    const ch = c.s.charCodeAt(i);
    if (ch !== 32 && ch !== 9) return false;
  }
  return true;
}

// ---- HTML tag grammar (CommonMark 6.10) ----
function parseTag(s, i, n) {
  // returns the index just past the tag, or -1
  if (i >= n || s.charCodeAt(i) !== 60) return -1; // <
  let j = i + 1;
  let closing = false;
  if (j < n && s.charCodeAt(j) === 47) { closing = true; j++; }
  if (j >= n || !isAlphaCode(s.charCodeAt(j))) return -1;
  j++;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (isAlnumCode(c) || c === 45) j++;
    else break;
  }
  if (closing) {
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++;
    if (j < n && s.charCodeAt(j) === 62) return j + 1;
    return -1;
  }
  // attributes
  while (true) {
    const wsStart = j;
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10)) j++;
    const hadWs = j > wsStart;
    if (j >= n) return -1;
    const c = s.charCodeAt(j);
    if (c === 62) return j + 1;
    if (c === 47) {
      if (j + 1 < n && s.charCodeAt(j + 1) === 62) return j + 2;
      return -1;
    }
    // an attribute name must be preceded by whitespace
    if (!hadWs) return -1;
    // attribute name
    if (!(isAlphaCode(c) || c === 95 || c === 58)) return -1;
    j++;
    while (j < n) {
      const d = s.charCodeAt(j);
      if (isAlnumCode(d) || d === 95 || d === 46 || d === 58 || d === 45) j++;
      else break;
    }
    // a boolean attribute has no `=`; back up over the whitespace we
    // skipped looking for one, so the next attribute still sees it
    const afterName = j;
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++;
    if (j < n && s.charCodeAt(j) === 61) { // =
      j++;
      while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++;
      if (j >= n) return -1;
      const q = s.charCodeAt(j);
      if (q === 34 || q === 39) {
        j++;
        while (j < n && s.charCodeAt(j) !== q) j++;
        if (j >= n) return -1;
        j++;
      } else {
        if (j >= n) return -1;
        let ok = false;
        while (j < n) {
          const d = s.charCodeAt(j);
          if (d === 32 || d === 9 || d === 10 || d === 34 || d === 39 || d === 61 || d === 60 || d === 62 || d === 96) break;
          j++; ok = true;
        }
        if (!ok) return -1;
      }
    } else {
      j = afterName;
    }
  }
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));

// Check for an HTML block start at position i of line string s (already
// past up to 3 spaces of indent). Returns {cond, end} or null. `end` is
// the string that ends the block (for conditions 1-5); conditions 6 and 7
// end at a blank line. `inPara` is true when a paragraph is open (then
// condition 7 does not apply).
function htmlBlockStart(s, i, n, inPara) {
  if (i >= n || s.charCodeAt(i) !== 60) return null;
  const rest = s.slice(i);
  const low = rest.toLowerCase();
  if (low.startsWith('<script') || low.startsWith('<pre') || low.startsWith('<style') || low.startsWith('<textarea')) {
    const tag = low.startsWith('<script') ? 'script' : low.startsWith('<pre') ? 'pre' : low.startsWith('<style') ? 'style' : 'textarea';
    const after = rest.charAt(1 + tag.length);
    if (after === '' || after === ' ' || after === '\t' || after === '\n' || after === '>') {
      return { cond: 1, end: '</' + tag + '>' };
    }
  }
  if (rest.startsWith('<!--')) return { cond: 2, end: '-->' };
  if (rest.startsWith('<?')) return { cond: 3, end: '?>' };
  if (rest.startsWith('<!') && i + 2 < n && isAlphaCode(s.charCodeAt(i + 2))) return { cond: 4, end: '>' };
  if (rest.startsWith('<![CDATA[')) return { cond: 5, end: ']]>' };
  // tag-based conditions
  let j = i + 1;
  let closing = false;
  if (j < n && s.charCodeAt(j) === 47) { closing = true; j++; }
  if (j >= n || !isAlphaCode(s.charCodeAt(j))) return null;
  const nameStart = j;
  j++;
  while (j < n && (isAlnumCode(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
  const name = s.slice(nameStart, j).toLowerCase();
  const after = j < n ? s.charCodeAt(j) : -1;
  if (BLOCK_TAGS.has(name) && (after === 32 || after === 9 || after === -1 || after === 62 || after === 47)) {
    return { cond: 6, end: null };
  }
  if (!inPara) {
    // condition 7: the whole line must be a single complete tag
    const end = parseTag(s, i, n);
    if (end > 0) {
      let k = end;
      while (k < n && (s.charCodeAt(k) === 32 || s.charCodeAt(k) === 9)) k++;
      if (k >= n) return { cond: 7, end: null };
    }
  }
  return null;
}

// Split a table row line into cells. Returns an array of raw cell strings.
function splitCells(line) {
  const cells = [];
  let cur = '';
  let i = 0;
  const n = line.length;
  // skip leading whitespace and an optional leading pipe
  while (i < n && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  if (i < n && line.charCodeAt(i) === 124) i++;
  let start = i;
  while (i < n) {
    const c = line.charCodeAt(i);
    if (c === 124) {
      // count preceding backslashes
      let bs = 0;
      for (let k = i - 1; k >= start && line.charCodeAt(k) === 92; k--) bs++;
      if (bs % 2 === 0) {
        cur += line.slice(start, i);
        cells.push(cur);
        cur = '';
        i++;
        start = i;
        continue;
      }
      // escaped pipe: drop the escaping backslash, keep the pipe
      cur += line.slice(start, i - 1) + '|';
      i++;
      start = i;
      continue;
    }
    i++;
  }
  cur += line.slice(start, n);
  cells.push(cur);
  // drop a trailing empty cell when the line ends with an (unescaped) pipe
  if (cells.length > 1) {
    const last = cells[cells.length - 1];
    if (/^[ \t]*$/.test(last)) cells.pop();
  }
  return cells.map(x => x.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''));
}

// Is this line (already past container offsets, up to 3 spaces indent
// skipped) a table delimiter row? If so return the alignments array,
// else null. `ncols` is the header's cell count (must match).
function delimiterRow(line, ncols) {
  const cells = splitCells(line);
  if (cells.length !== ncols) return null;
  const align = [];
  for (const cell of cells) {
    if (/^:-+:$/.test(cell)) align.push('center');
    else if (/^-+:$/.test(cell)) align.push('right');
    else if (/^:-+$/.test(cell)) align.push('left');
    else if (/^-+$/.test(cell)) align.push(null);
    else return null;
  }
  return align;
}

// Does the delimiter row contain a pipe or a colon (used to keep a plain
// `---` setext underline from being mistaken for a table delimiter)?
function delimHasPipeOrColon(line) {
  return line.indexOf('|') >= 0 || line.indexOf(':') >= 0;
}

// ---- link reference definitions ----
// Skip spaces/tabs, then at most one line ending, then spaces/tabs.
// Returns the new index.
function skipWs1(s, i, n) {
  while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
  if (i < n && s.charCodeAt(i) === 10) {
    i++;
    while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
  }
  return i;
}

// Parse link reference definitions from the start of `lines` (a
// paragraph's lines). Registers them in `refs` (first definition wins)
// and returns the number of lines consumed.
// Parse link reference definitions at the start of a paragraph's lines
// (consecutive definitions from the first line; parsing stops at the first
// non-definition line). Returns a new array with the definition lines
// removed; definitions are added to refs (first definition wins). A
// definition's destination may be followed by an optional title, but the
// title must be separated from the destination by whitespace; if the title
// is malformed the definition still stands without it (the offending line
// is left as text).
function parseDefs(lines, refs) {
  const s = lines.join('\n');
  const n = s.length;
  let pos = 0;
  let consumed = 0;
  while (pos < n) {
    let i = pos;
    let sp = 0;
    while (i < n && s.charCodeAt(i) === 32 && sp < 3) { i++; sp++; }
    if (i >= n || s.charCodeAt(i) !== 91) break; // [
    let j = i + 1;
    let ok = false;
    while (j < n) {
      const ch = s.charCodeAt(j);
      if (ch === 92 && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (ch === 91) break; // unescaped [
      if (ch === 93) { ok = true; break; } // ]
      j++;
    }
    if (!ok) break;
    const norm = normalizeLabel(s.slice(i + 1, j));
    if (!norm || norm.length > 999) break;
    let p = j + 1;
    if (p >= n || s.charCodeAt(p) !== 58) break; // :
    p++;
    p = skipWs1(s, p, n);
    const d = parseDest(s, p, n);
    if (!d) break;
    const dest = d[0];
    // optional title: same line (needs whitespace before it) or next line
    let title = null;
    let titleEnd = -1;
    let pTry = d[1];
    while (pTry < n && (s.charCodeAt(pTry) === 32 || s.charCodeAt(pTry) === 9)) pTry++;
    if (pTry < n && s.charCodeAt(pTry) === 10) {
      let pNext = pTry + 1;
      while (pNext < n && (s.charCodeAt(pNext) === 32 || s.charCodeAt(pNext) === 9)) pNext++;
      const tNext = parseTitle(s, pNext, n);
      if (tNext) {
        let q2 = tNext[1];
        while (q2 < n && (s.charCodeAt(q2) === 32 || s.charCodeAt(q2) === 9)) q2++;
        if (q2 >= n || s.charCodeAt(q2) === 10) { title = tNext[0]; titleEnd = tNext[1]; }
      }
    } else if (pTry > d[1]) {
      const t = parseTitle(s, pTry, n);
      if (t) {
        let q2 = t[1];
        while (q2 < n && (s.charCodeAt(q2) === 32 || s.charCodeAt(q2) === 9)) q2++;
        if (q2 >= n || s.charCodeAt(q2) === 10) { title = t[0]; titleEnd = t[1]; }
      }
    }
    let q = titleEnd >= 0 ? titleEnd : d[1];
    while (q < n && (s.charCodeAt(q) === 32 || s.charCodeAt(q) === 9)) q++;
    if (q < n && s.charCodeAt(q) !== 10) break;
    let cnt = 1;
    for (let m = pos; m < q; m++) if (s.charCodeAt(m) === 10) cnt++;
    if (!refs.has(norm)) refs.set(norm, { dest: dest, title: title });
    consumed += cnt;
    if (q >= n) { pos = n; break; }
    pos = q + 1;
  }
  if (consumed === 0) return lines;
  return lines.slice(consumed);
}

// Check whether the string cs (a line after container offsets, with up to
// 3 spaces of indent skipped) is a setext heading underline. Returns
// 1 for `=`, 2 for `-`, 0 otherwise.
function setextLevel(cs) {
  if (!cs) return 0;
  const c0 = cs.charCodeAt(0);
  if (c0 !== 61 && c0 !== 45) return 0;
  let i = 1;
  while (i < cs.length && cs.charCodeAt(i) === c0) i++;
  while (i < cs.length && (cs.charCodeAt(i) === 32 || cs.charCodeAt(i) === 9)) i++;
  if (i < cs.length) return 0;
  return c0 === 61 ? 1 : 2;
}

// Check whether cs is a thematic break. Markers are `*`, `-` or `_`,
// at least three, with only spaces/tabs between them.
function isThematicBreak(cs) {
  if (!cs) return false;
  const c0 = cs.charCodeAt(0);
  if (c0 !== 42 && c0 !== 45 && c0 !== 95) return false;
  let count = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs.charCodeAt(i);
    if (c === c0) count++;
    else if (c !== 32 && c !== 9) return false;
  }
  return count >= 3;
}

// Return the string from the cursor after skipping up to `max` columns
// of leading spaces/tabs.
function peekRest(c, max) {
  const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
  let n = 0;
  while (n < max) {
    const ch = cch(d);
    if (ch === 32 || ch === 9) { adv(d, 1); n++; }
    else break;
  }
  return rest(d);
}

function computeTight(list) {
  let tight = true;
  for (let i = 0; i < list.ch.length; i++) {
    const item = list.ch[i];
    // a blank line before an item (other than the first) makes it loose
    if (i > 0 && item.blankBefore) tight = false;
    // a block removed as a definition-only paragraph still counts:
    // a blank line before it separated two blocks inside this item
    if (item.loose) tight = false;
    // a blank line between two blocks inside an item makes it loose
    for (let k = 1; k < item.ch.length; k++) {
      if (item.ch[k].blankBefore) { tight = false; break; }
    }
  }
  list.tight = tight;
}

// ---- block parsing ----
function blockParse(lines, refs) {
  const doc = { t: 'doc', ch: [] };
  const stack = [doc];
  let sawBlank = false;
  // deepest container index a blank line was inside: a true blank line
  // counts at every level (depth 0); a marker-only line (e.g. `>`) only
  // counts inside the container it was matched in
  let blankDepth = -1;

  function isLeaf(b) {
    return b.t === 'para' || b.t === 'head' || b.t === 'code' || b.t === 'html' || b.t === 'table' || b.t === 'hr';
  }

  function closeTo(idx) {
    while (stack.length > idx + 1) {
      const b = stack.pop();
      const parent = stack[stack.length - 1];
      if (b.t === 'para') {
        b.lines = parseDefs(b.lines, refs);
        if (b.lines.length === 0 || b.lines.join('').trim() === '') {
          // a definition-only paragraph still separated the blocks
          // around it: a blank line before it loosens its item
          if (b.blankBefore && parent.t === 'item') parent.loose = true;
          parent.ch.length--;
          continue;
        }
      } else if (b.t === 'code' && !b.fenced) {
        while (b.lines.length && b.lines[b.lines.length - 1] === '') b.lines.pop();
      } else if (b.t === 'code' && b.fenced) {
        // a fenced block drops one trailing completely-empty line
        // (a line of spaces is kept, cm-129; an empty line is not, cm-318)
        if (b.lines.length && b.lines[b.lines.length - 1] === '') b.lines.pop();
      } else if (b.t === 'list') {
        computeTight(b);
      }
    }
  }

  function addChild(parent, b, bb) {
    b.blankBefore = bb;
    parent.ch.push(b);
    return b;
  }

  function isClosingFence(c, tip) {
    const ind = indentCols(c);
    if (ind > 3) return false;
    const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
    adv(d, ind);
    if (d.tab > 0) return false;
    const s = d.s, n = d.len;
    let k = 0;
    while (d.i + k < n && s.charCodeAt(d.i + k) === tip.fenceChar) k++;
    if (k < tip.fenceLen) return false;
    let j = d.i + k;
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++;
    return j >= n;
  }

  // Try block starts at the cursor. Returns true if the line was consumed.
  // `contIdx` is the index of the deepest matched container; `allMatched`
  // says whether every open container matched; `tableMode` means the open
  // leaf is a table (no setext/table conversion, no indented code, and a
  // failure means "add a table row" rather than "add to a paragraph").
  function handleLine(c, contIdx, allMatched, bb, tableMode, ln) {
    // `tm` is tableMode, but once a blockquote/list is opened the table
    // has ended and the line's content is parsed normally
    let tm = tableMode;
    while (true) {
      const tip = stack[stack.length - 1];
      const baseCol = c.col;
      const ind = indentCols(c);
      // ---- setext heading ----
      if (!tm && tip.t === 'para' && allMatched && ind <= 3) {
        const sl = setextLevel(peekRest(c, 3));
        if (sl) {
          const stripped = parseDefs(tip.lines, refs);
          if (stripped.length > 0) {
            const text = stripped.join('\n').replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
            if (text) {
              tip.t = 'head'; tip.level = sl; tip.text = text; delete tip.lines;
              closeTo(contIdx);
              return true;
            }
          }
          // not a heading (paragraph was only definitions): fall through
        }
        // ---- table conversion ----
        const delimLine = peekRest(c, 3);
        if (delimHasPipeOrColon(delimLine) && tip.lines.length <= 10) {
          const stripped = parseDefs(tip.lines, refs);
          if (stripped.length === 1) {
            const headerLine = stripped[0];
            const headCells = splitCells(headerLine);
            const align = delimiterRow(delimLine, headCells.length);
            if (align) {
              const blankB = tip.blankBefore;
              stack.pop();
              stack[contIdx].ch.pop();
              const table = { t: 'table', head: headCells, align: align, rows: [] };
              addChild(stack[contIdx], table, blankB);
              stack.push(table);
              return true;
            }
          }
        }
      }
      // ---- ATX heading ----
      if (ind <= 3) {
        const cs = peekRest(c, 3);
        let k = 0;
        while (k < cs.length && cs.charCodeAt(k) === 35) k++;
        if (k >= 1 && k <= 6 && (k === cs.length || cs.charCodeAt(k) === 32 || cs.charCodeAt(k) === 9)) {
          let text = cs.slice(k).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
          if (/^#+$/.test(text)) text = '';
          else {
            const cm = /[ \t]+#+$/.exec(text);
            if (cm) text = text.slice(0, cm.index).replace(/[ \t]+$/, '');
          }
          const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
          closeTo(pi);
          addChild(stack[pi], { t: 'head', level: k, text: text }, bb);
          return true;
        }
      }
      // ---- fenced code ----
      if (ind <= 3) {
        const cs = peekRest(c, 3);
        const fc = cs.length ? cs.charCodeAt(0) : -1;
        if (fc === 96 || fc === 126) {
          let k = 0;
          while (k < cs.length && cs.charCodeAt(k) === fc) k++;
          if (k >= 3) {
            let info = cs.slice(k);
            if (!(fc === 96 && info.indexOf('`') >= 0)) {
              info = info.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
              let lang = '';
              for (let q = 0; q < info.length; q++) {
                const ch = info.charCodeAt(q);
                if (ch === 32 || ch === 9) break;
                lang += info[q];
              }
              lang = unescape(lang);
              const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
              closeTo(pi);
              const code = { t: 'code', fenced: true, info: lang, lines: [], fenceChar: fc, fenceLen: k, fenceIndent: ind };
              addChild(stack[pi], code, bb);
              stack.push(code);
              return true;
            }
          }
        }
      }
      // ---- HTML block ----
      if (ind <= 3) {
        const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
        adv(d, Math.min(ind, 3));
        const hb = htmlBlockStart(c.s, d.i, c.len, tip.t === 'para');
        if (hb) {
          const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
          closeTo(pi);
          const html = { t: 'html', lines: [rest(c)], cond: hb.cond, end: hb.end, lastLine: ln };
          addChild(stack[pi], html, bb);
          // a cond 1-5 block whose end tag is already on the first line
          // closes immediately
          if (!(hb.cond <= 5 && rest(c).toLowerCase().indexOf(hb.end) >= 0)) stack.push(html);
          return true;
        }
      }
      // ---- thematic break ----
      if (ind <= 3 && isThematicBreak(peekRest(c, 3))) {
        const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
        closeTo(pi);
        addChild(stack[pi], { t: 'hr' }, bb);
        return true;
      }
      // ---- list item ----
      if (ind <= 3) {
        const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
        adv(d, Math.min(ind, 3));
        let markerLen = 0, ordered = false, startNum = 0, delim = '';
        if (d.tab === 0) {
          const s = d.s, i0 = d.i, n = d.len;
          const m0 = i0 < n ? s.charCodeAt(i0) : -1;
          if (m0 === 45 || m0 === 43 || m0 === 42) {
            const nx = i0 + 1 < n ? s.charCodeAt(i0 + 1) : -1;
            if (nx === 32 || nx === 9 || nx === -1) { markerLen = 1; delim = String.fromCharCode(m0); }
          } else if (m0 >= 48 && m0 <= 57) {
            let num = 0, nd = 0, j = i0;
            while (j < n && nd < 9 && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) {
              num = num * 10 + (s.charCodeAt(j) - 48); nd++; j++;
            }
            if (nd >= 1 && j < n && (s.charCodeAt(j) === 46 || s.charCodeAt(j) === 41)) {
              const nx = j + 1 < n ? s.charCodeAt(j + 1) : -1;
              if (nx === 32 || nx === 9 || nx === -1) {
                markerLen = j - i0 + 1; ordered = true; startNum = num;
                delim = String.fromCharCode(s.charCodeAt(j));
              }
            }
          }
        }
        if (markerLen > 0) {
          // whitespace after the marker
          adv(d, markerLen);
          const markerEndCol = d.col;
          const e = { s: d.s, i: d.i, col: d.col, tab: d.tab, len: d.len };
          while (true) {
            const ch = cch(e);
            if (ch === 32) adv(e, 1);
            else if (ch === 9) adv(e, 4 - (e.col & 3));
            else break;
          }
          const W = e.col - markerEndCol;
          const afterWs = cch(e);
          const isEmpty = afterWs === -1;
          // a list item can only "interrupt" a paragraph when the paragraph
          // is at the same level (its parent is the deepest matched
          // container); an empty item can never interrupt one, and an
          // ordered item needs to start with 1. But a list nested inside
          // the paragraph's parent item is a new block within that item,
          // not an interruption of the paragraph.
          const paraParent = stack.length >= 2 ? stack[stack.length - 2] : null;
          const paraAtLevel = tip.t === 'para' && paraParent !== null &&
            paraParent === stack[contIdx] && paraParent.t !== 'item';
          if ((paraAtLevel && isEmpty) || (paraAtLevel && ordered && startNum !== 1)) {
            // not a list item here; fall through to the other block checks
          } else {
          let contentIndent;
          if (afterWs === -1) contentIndent = markerEndCol + 1;
          else if (W >= 5) contentIndent = markerEndCol + 1;
          else contentIndent = markerEndCol + W;
          // does it join the existing list?
          let list = stack[contIdx].t === 'list' ? stack[contIdx] : null;
          if (list) {
            if (list.ordered !== ordered || list.delim !== delim) list = null;
          }
          const pi = list ? contIdx : (stack[contIdx].t === 'list' ? contIdx - 1 : contIdx);
          closeTo(pi);
          if (!list) {
            list = { t: 'list', ordered: ordered, delim: delim, start: ordered ? startNum : 0, tight: true, ch: [] };
            addChild(stack[pi], list, bb);
            stack.push(list);
            contIdx = stack.length - 1;
          }
          const item = { t: 'item', indent: contentIndent - baseCol, task: null, ch: [] };
          addChild(list, item, bb);
          stack.push(item);
          if (afterWs === -1) return true; // empty item
          // advance the real cursor to the content start
          adv(d, contentIndent - markerEndCol);
          c.i = d.i; c.col = d.col; c.tab = d.tab;
          contIdx = stack.length - 1;
          tm = false;
          continue; // check for block starts inside the item
          }
        }
      }
      // ---- blockquote ----
      if (ind <= 3) {
        const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
        adv(d, Math.min(ind, 3));
        if (d.tab === 0 && d.i < d.len && d.s.charCodeAt(d.i) === 62) {
          adv(d, 1);
          if (cch(d) === 32 || cch(d) === 9) adv(d, 1);
          // a blockquote is not a list item: if the deepest matched
          // container is a list, close it and attach to its parent
          const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
          closeTo(pi);
          const q = { t: 'quote', ch: [] };
          addChild(stack[pi], q, bb);
          stack.push(q);
          c.i = d.i; c.col = d.col; c.tab = d.tab;
          contIdx = stack.length - 1;
          tm = false;
          continue; // check for block starts inside the quote
        }
      }
      // ---- indented code ----
      if (!tm && tip.t !== 'para' && ind >= 4) {
        const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
        closeTo(pi);
        const code = { t: 'code', fenced: false, lines: [], fenceIndent: 0 };
        addChild(stack[pi], code, bb);
        stack.push(code);
        adv(c, 4);
        code.lines.push(rest(c));
        return true;
      }
      // ---- paragraph ----
      if (!tm) {
        if (tip.t === 'para') {
          let text = rest(c);
          if (!allMatched) {
            // lazy continuation: strip up to 4 leading spaces only when
            // no quote/item container matched at all (fully lazy, e.g.
            // cm-238 `> foo` + ` - bar`, cm-291 list para). When a quote
            // or item did match, the remaining spaces are paragraph
            // content (doc-38 `>  Renderer`, doc-25 tab continuation).
            let realMatched = false;
            for (let k = 1; k <= contIdx; k++) {
              if (stack[k].t === 'quote' || stack[k].t === 'item') { realMatched = true; break; }
            }
            if (!realMatched) {
              if (setextLevel(text) > 0) text = '    ' + text;
              else {
                let strip = 0;
                while (strip < text.length && strip < 4 &&
                       (text.charCodeAt(strip) === 32 || text.charCodeAt(strip) === 9)) strip++;
                if (strip > 0) text = text.slice(strip);
              }
            }
          }
          tip.lines.push(text);
          return true;
        }
        if (rest(c) === '') {
          // only container markers + whitespace: a blank line, no paragraph
          sawBlank = true;
          return true;
        }
        const pi = stack[contIdx].t === 'list' ? contIdx - 1 : contIdx;
        closeTo(pi);
        const parent = stack[pi];
        const para = { t: 'para', lines: [rest(c)] };
        addChild(parent, para, bb);
        stack.push(para);
        // task list item?
        if (parent.t === 'item' && parent.ch.length === 1 && parent.task === null) {
          const first = para.lines[0];
          let q = 0;
          while (q < first.length && (first.charCodeAt(q) === 32 || first.charCodeAt(q) === 9) && q < 3) q++;
          if (first.charCodeAt(q) === 91 && q + 2 < first.length) {
            const m = first.charCodeAt(q + 1);
            if ((m === 32 || m === 120 || m === 88) && first.charCodeAt(q + 2) === 93) {
              const after = q + 3 < first.length ? first.charCodeAt(q + 3) : -1;
              if (after === 32 || after === 9 || after === -1) {
                parent.task = m === 32 ? ' ' : 'x';
                let end = q + 3;
                if (after === 32 || after === 9) end++;
                para.lines[0] = first.slice(end);
              }
            }
          }
        }
        return true;
      }
      return false;
    }
  }

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    const c = cur(line);
    const blank = isBlankStr(line);
    if (blank) {
      // match containers first: a blank line needs `>` to stay in a quote,
      // but is always inside a list item
      let lastMatched = 0;
      for (let k = 1; k < stack.length; k++) {
        const b = stack[k];
        if (b.t === 'quote') {
          if (cch(c) === 62) {
            adv(c, 1);
            if (cch(c) === 32 || cch(c) === 9) adv(c, 1);
            lastMatched = k;
          } else break;
        } else if (b.t === 'item') {
          adv(c, Math.min(indentCols(c), b.indent));
          lastMatched = k;
        } else if (b.t === 'list') {
          lastMatched = k;
        } else break;
      }
      const tipIdx = stack.length - 1;
      const tip = stack[tipIdx];
      const leafOpen = isLeaf(tip) && lastMatched >= tipIdx - 1;
      // a whitespace-only line that contains a tab is a table row
      // (empty cells), not a blank line ending the table (doc-02)
      if (leafOpen && tip.t === 'table' && line.indexOf('\t') >= 0) {
        tip.rows.push(splitCells(rest(c)));
        continue;
      }
      if (leafOpen && tip.t === 'code') {
        if (tip.fenced) tip.lines.push(codeLine(c));
        else {
          const ind = indentCols(c);
          if (ind >= 4) { adv(c, 4); tip.lines.push(codeLine(c)); }
          else tip.lines.push('');
        }
        continue;
      }
      if (leafOpen && tip.t === 'html' && tip.cond <= 5) {
        tip.lines.push(rest(c));
        tip.lastLine = ln;
        continue;
      }
      closeTo(lastMatched);
      sawBlank = true;
      blankDepth = 0;
      continue;
    }
    // match containers
    let lastMatched = 0;
    let allMatched = true;
    let failIdx = -1;
    for (let k = 1; k < stack.length; k++) {
      const b = stack[k];
      if (b.t === 'quote') {
        // `>` may be preceded by up to 3 columns of whitespace
        const ind = indentCols(c);
        let ok = false;
        if (ind <= 3) {
          const d = { s: c.s, i: c.i, col: c.col, tab: c.tab, len: c.len };
          adv(d, ind);
          if (d.tab === 0 && d.i < d.len && d.s.charCodeAt(d.i) === 62) {
            adv(c, ind + 1);
            if (cch(c) === 32 || cch(c) === 9) adv(c, 1);
            lastMatched = k;
            ok = true;
          }
        }
        if (!ok) { allMatched = false; failIdx = k; break; }
      } else if (b.t === 'item') {
        // an empty item cannot be continued after a blank line:
        // the next indented line is a new block outside the list
        if (sawBlank && b.ch.length === 0) { allMatched = false; failIdx = k; break; }
        // a blank remainder is always inside an item
        if (isBlankFrom(c) || indentCols(c) >= b.indent) {
          adv(c, Math.min(indentCols(c), b.indent));
          lastMatched = k;
        } else { allMatched = false; failIdx = k; break; }
      } else if (b.t === 'list') {
        lastMatched = k;
      } else break;
    }
    // a blank line at depth D separates blocks at depth D and at depth
    // D-1 (a new list item is a child of the list, one level below the
    // blank's container), so compare against lastMatched + 1
    const bb = sawBlank && blankDepth <= lastMatched + 1;
    sawBlank = false;
    // a line that is only container markers + whitespace is a blank line
    // (rest(c) empty); whitespace after a marker is paragraph content
    if (rest(c) === '') {
      const tipB = stack[stack.length - 1];
      const leafOpenB = isLeaf(tipB) && lastMatched >= stack.length - 2;
      if (leafOpenB && tipB.t === 'code') {
        if (tipB.fenced) tipB.lines.push(codeLine(c));
        else {
          const indB = indentCols(c);
          if (indB >= 4) { adv(c, 4); tipB.lines.push(codeLine(c)); }
          else tipB.lines.push('');
        }
        continue;
      }
      if (leafOpenB && tipB.t === 'html' && tipB.cond <= 5) {
        tipB.lines.push(rest(c));
        tipB.lastLine = ln;
        continue;
      }
      closeTo(lastMatched);
      sawBlank = true;
      blankDepth = lastMatched;
      continue;
    }
    const tip = stack[stack.length - 1];
    if (tip.t === 'code' && tip.fenced) {
      // A fenced block's content lines need not match a list item's
      // indent, but a missing `>` does end a block inside a quote.
      // The failure may be reported at an earlier container (the item)
      // before the quote is even checked, so test whether the quote
      // itself matched: if lastMatched is before the quote's index,
      // the line is outside the quote and the fence ends.
      let quoteIdx = -1;
      for (let k = 1; k < stack.length - 1; k++) if (stack[k].t === 'quote') quoteIdx = k;
      if (!allMatched && quoteIdx >= 0 && lastMatched < quoteIdx) {
        closeTo(lastMatched);
      } else if (!allMatched && tip.lines.length === 0) {
        // an empty fenced block ends when its first content line is
        // outside its container (doc-17); once it has content, later
        // lines are code regardless of indent (doc-02)
        closeTo(lastMatched);
      } else {
        if (allMatched && isClosingFence(c, tip)) { closeTo(lastMatched); continue; }
        if (allMatched) adv(c, Math.min(indentCols(c), tip.fenceIndent));
        tip.lines.push(codeLine(c));
        continue;
      }
    } else if (tip.t === 'code') {
      if (allMatched && indentCols(c) >= 4) {
        adv(c, 4);
        tip.lines.push(codeLine(c));
        continue;
      }
      closeTo(lastMatched);
    } else if (tip.t === 'html') {
      if (allMatched) {
        const text = rest(c);
        tip.lines.push(text);
        tip.lastLine = ln;
        if (tip.cond <= 5 && text.toLowerCase().indexOf(tip.end) >= 0) closeTo(lastMatched);
        continue;
      }
      closeTo(lastMatched);
    } else if (tip.t === 'table') {
      if (allMatched) {
        if (handleLine(c, lastMatched, allMatched, bb, true, ln)) continue;
        tip.rows.push(splitCells(rest(c)));
        continue;
      }
      closeTo(lastMatched);
    }
    handleLine(c, lastMatched, allMatched, bb, false, ln);
  }
  closeTo(0);
  return doc;
}

// ---- inline parsing ----
// Node types: 0 text (raw, escaped at render), 1 raw verbatim, 2 code span,
// 3 delimiter, 4 hard break, 5 soft break, 6 link, 7 image, 8 bracket.

function parseEmailDomain(s, i, n) {
  let j = i;
  let k = j;
  while (k < n) {
    const c = s.charCodeAt(k);
    if (isAlnumCode(c) || c === 45 || c === 95) k++;
    else break;
  }
  if (k === j) return -1;
  j = k;
  let dots = 0;
  while (j < n && s.charCodeAt(j) === 46) {
    if (j + 1 < n) {
      const nc = s.charCodeAt(j + 1);
      if (isAlnumCode(nc) || nc === 45 || nc === 95) {
        dots++;
        j++;
        k = j;
        while (k < n) {
          const c = s.charCodeAt(k);
          if (isAlnumCode(c) || c === 45 || c === 95) k++;
          else break;
        }
        j = k;
        continue;
      }
    }
    break;
  }
  if (dots < 1) return -1;
  // a domain may not end in `-` or `_`: back up over a trailing one.
  // The caller decides whether that char is part of the email (invalid,
  // gfm-632) or a separate emphasis delimiter (valid, doc-31).
  while (j > i + 1) {
    const last = s.charCodeAt(j - 1);
    if (last === 45 || last === 95) j--;
    else break;
  }
  if (j <= i) return -1;
  return j;
}

// Parse a domain for www. / http(s):// autolinks. Returns the end index
// or -1. Segments are [A-Za-z0-9_-]+ separated by dots; at least two
// segments; no underscores in the last two segments.
function parseWwwDomain(s, i, n) {
  let j = i;
  let segments = 0;
  let lastHasU = false, secondLastHasU = false;
  while (j < n) {
    let k = j;
    let hasU = false;
    while (k < n) {
      const c = s.charCodeAt(k);
      if (isAlnumCode(c)) k++;
      else if (c === 95) { hasU = true; k++; }
      else if (c === 45) k++;
      else break;
    }
    if (k === j) return -1;
    segments++;
    secondLastHasU = lastHasU;
    lastHasU = hasU;
    j = k;
    if (j < n && s.charCodeAt(j) === 46) {
      if (j + 1 < n) {
        const nc = s.charCodeAt(j + 1);
        if (isAlnumCode(nc) || nc === 95 || nc === 45) { j++; continue; }
      }
      break;
    }
    break;
  }
  if (segments < 2) return -1;
  if (lastHasU || secondLastHasU) return -1;
  return j;
}

// Trim the end of an extended autolink per the GFM path-validation rules.
// Loops because stripping a `)` can expose trailing punctuation (and
// vice versa).
function trimAutolinkEnd(s, start, end) {
  // a trailing `;` that ends an entity (`&name;`) removes the whole entity
  if (end > start && s.charCodeAt(end - 1) === 59) {
    let k = end - 2;
    while (k >= start && isAlnumCode(s.charCodeAt(k))) k--;
    if (k >= start && s.charCodeAt(k) === 38 && k < end - 1) end = k;
  }
  for (;;) {
    const before = end;
    while (end > start) {
      const c = s.charCodeAt(end - 1);
      if (c === 63 || c === 33 || c === 46 || c === 44 || c === 58 || c === 59 || c === 42 || c === 95 || c === 126) end--;
      else break;
    }
    if (end > start && s.charCodeAt(end - 1) === 41) {
      let open = 0, close = 0;
      for (let k = start; k < end; k++) {
        const c = s.charCodeAt(k);
        if (c === 40) open++;
        else if (c === 41) close++;
      }
      let strip = close - open;
      while (strip > 0 && end > start && s.charCodeAt(end - 1) === 41) { end--; strip--; }
    }
    if (end === before) break;
  }
  return end;
}

function autolinkPrevOk(s, i) {
  if (i === 0) return true;
  const c = s.charCodeAt(i - 1);
  return c === 32 || c === 9 || c === 10 || c === 40 || c === 42 || c === 95 || c === 126 || c === 60;
}

function autolinkPrevOkEmail(s, i) {
  if (i === 0) return true;
  const c = s.charCodeAt(i - 1);
  return c === 32 || c === 9 || c === 10 || c === 40 || c === 42 || c === 95 || c === 126;
}

// Try to match an extended www. / http(s):// autolink at i. Returns the
// end index and href, or null.
function tryExtUrl(s, i, n, inBrackets) {
  let prefixLen = 0;
  let hrefPrefix = '';
  if (s.startsWith('www.', i)) { prefixLen = 4; hrefPrefix = 'http://'; }
  else {
    const low = s.slice(i, i + 8).toLowerCase();
    if (low.startsWith('http://')) prefixLen = 7;
    else if (low.startsWith('https://')) prefixLen = 8;
    else return null;
  }
  if (!autolinkPrevOk(s, i)) return null;
  // find the raw end (up to space/tab/newline/<), trim it, then validate
  // the domain within the trimmed span (trailing emphasis `_` etc. must
  // not poison domain validation). Inside brackets, a `]` ends the URL
  // (it closes the bracket); otherwise the `](dest)` would be swallowed
  // into the autolink and the outer link could never form (doc-34/12).
  let j = i + prefixLen;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 32 || c === 9 || c === 10 || c === 60) break;
    if (inBrackets && c === 93) break;
    j++;
  }
  const end = trimAutolinkEnd(s, i, j);
  if (end <= i + prefixLen) return null;
  const domEnd = parseWwwDomain(s, i + prefixLen, end);
  if (domEnd < 0) return null;
  const text = s.slice(i, end);
  // the href is percent-encoded (e.g. a trailing backslash becomes %5C,
  // doc-37) while the link text stays raw
  const href = cleanUrl(hrefPrefix + text);
  if (href === null) return null;
  return { end: end, text: text, href: href };
}

// Try to match an email address whose @ is at position `at` in s, with
// the local part ending at `at` in the accumulated text `text`.
// Returns {end, text, href} or null.
function tryExtEmail(s, at, n, text, nodes) {
  // scan the local part backwards in the raw source: a backslash escape
  // breaks it, and the char before it must be start/ws/delimiter (not <)
  let ls = at;
  while (ls > 0) {
    const c = s.charCodeAt(ls - 1);
    if (isAlnumCode(c) || c === 46 || c === 45 || c === 95 || c === 43) ls--;
    else break;
  }
  if (ls === at) return null;
  if (text.length < at - ls) return null;
  if (!autolinkPrevOkEmail(s, ls)) return null;
  const domEnd = parseEmailDomain(s, at + 1, n);
  if (domEnd < 0) return null;
  // a `_`/`-` right after the domain is part of the email (invalid,
  // gfm-632) unless it is an emphasis delimiter closing an open `_`
  // (doc-31): then it belongs to the emphasis, not the email
  if (domEnd < n) {
    const tc = s.charCodeAt(domEnd);
    if (tc === 95 || tc === 45) {
      let isDelim = false;
      if (tc === 95 && nodes) {
        // the `_` can close if right-flanking, and an opener exists
        const after = domEnd + 1 < n ? s.charCodeAt(domEnd + 1) : -1;
        const before = s.charCodeAt(domEnd - 1);
        const afterWs = after === -1 || after === 32 || after === 9 || after === 10;
        const afterPunct = after !== -1 && isPunctCode(after);
        const beforeWs = before === 32 || before === 9 || before === 10;
        const beforePunct = isPunctCode(before);
        const rightFlank = !beforeWs && (!beforePunct || afterWs || afterPunct);
        if (rightFlank) {
          for (let q = 0; q < nodes.length; q++) {
            const nd = nodes[q];
            if (nd.t === 3 && nd.ch === '_' && nd.o && nd.len > 0) { isDelim = true; break; }
          }
        }
      }
      if (!isDelim) return null;
    }
  }
  const local = s.slice(ls, at);
  const email = local + s.slice(at, domEnd);
  return { end: domEnd, localLen: at - ls, text: email, href: 'mailto:' + email };
}

// Try to match a mailto:/xmpp: protocol autolink at i. Returns null or
// {end, text, href}.
function tryProtocol(s, i, n) {
  let schemeLen = 0;
  let isXmpp = false;
  if (s.charCodeAt(i) === 109 || s.charCodeAt(i) === 77) {
    if (s.slice(i, i + 7).toLowerCase() === 'mailto:') schemeLen = 7;
  } else if (s.charCodeAt(i) === 120 || s.charCodeAt(i) === 88) {
    if (s.slice(i, i + 5).toLowerCase() === 'xmpp:') { schemeLen = 5; isXmpp = true; }
  }
  if (!schemeLen) return null;
  let j = i + schemeLen;
  let k = j;
  while (k < n) {
    const c = s.charCodeAt(k);
    if (isAlnumCode(c) || c === 46 || c === 45 || c === 95 || c === 43) k++;
    else break;
  }
  if (k === j || k >= n || s.charCodeAt(k) !== 64) return null;
  const domEnd = parseEmailDomain(s, k + 1, n);
  if (domEnd < 0) return null;
  // a `_`/`-` right after the domain invalidates the email (gfm-633);
  // parseEmailDomain already backed up over it, so it sits at domEnd
  if (domEnd < n) {
    const tc = s.charCodeAt(domEnd);
    if (tc === 95 || tc === 45) return null;
  }
  let end = domEnd;
  if (isXmpp && end < n && s.charCodeAt(end) === 47) {
    // optional /resource of [A-Za-z0-9@.]+
    let r = end + 1;
    let rk = r;
    while (rk < n) {
      const c = s.charCodeAt(rk);
      if (isAlnumCode(c) || c === 64 || c === 46) rk++;
      else break;
    }
    if (rk > r) end = rk;
  }
  const text = s.slice(i, end);
  return { end: end, text: text, href: text };
}

// Try to form a link/image when `]` is found at index j. `br` is the
// bracket node. Returns the index just past the link syntax, or -1.
// Order: inline link, full/collapsed reference, shortcut reference.
function tryLink(s, j, n, br, nodes, brackets, refs) {
  let href = null, title = null, end = -1;
  const k = j + 1;
  if (k < n && s.charCodeAt(k) === 40) { // ( inline
    let p = skipWs(s, k + 1, n);
    const d = parseDest(s, p, n);
    if (d) {
      p = skipWs(s, d[1], n);
      let t = null;
      if (p < n) {
        const tt = parseTitle(s, p, n);
        if (tt) { t = tt[0]; p = tt[1]; }
      }
      p = skipWs(s, p, n);
      if (p < n && s.charCodeAt(p) === 41) { href = d[0]; title = t; end = p + 1; }
    }
    // an inline link that fails falls back to a shortcut reference
    if (href === null) {
      const norm = normalizeLabel(s.slice(br.start, j));
      const ref = refs.get(norm);
      if (ref) { href = ref.dest; title = ref.title; end = j + 1; }
    }
  } else if (k < n && s.charCodeAt(k) === 91) { // [ reference
    let m = k + 1;
    let label = null;
    while (m < n) {
      const c = s.charCodeAt(m);
      if (c === 92 && m + 1 < n && isAsciiPunctCode(s.charCodeAt(m + 1))) { m += 2; continue; }
      if (c === 93) { label = s.slice(k + 1, m); break; }
      m++;
    }
    if (label !== null) {
      const norm = label === '' ? normalizeLabel(s.slice(br.start, j)) : normalizeLabel(label);
      const ref = refs.get(norm);
      if (ref) { href = ref.dest; title = ref.title; end = m + 1; }
    }
    // a failed full/collapsed reference does NOT fall back to a
    // shortcut: `[foo]` stays literal so `[bar]` can link (cm-571)
  } else { // shortcut
    const norm = normalizeLabel(s.slice(br.start, j));
    const ref = refs.get(norm);
    if (ref) { href = ref.dest; title = ref.title; end = j + 1; }
  }
  if (href === null) return -1;
  const clean = cleanUrl(href);
  if (clean === null) return -1;
  // a link's text may not contain another bracket link (an autolink
  // inside it is fine, and an image's alt may contain either)
  if (!br.img) {
    for (let k2 = br.nodeIdx + 1; k2 < nodes.length; k2++) {
      if (nodes[k2].t === 6 && !nodes[k2].auto) return -1;
    }
  }
  const children = nodes.splice(br.nodeIdx + 1);
  // an extended autolink (www/http/email) inside a link's text is
  // unformed when the outer link forms (doc-01): it renders as plain
  // text. An explicit `<...>` autolink (no `ext`) stays a link.
  for (let k2 = 0; k2 < children.length; k2++) {
    if (children[k2].t === 6 && children[k2].ext) {
      children[k2] = { t: 0, s: children[k2].ch[0].s };
    }
  }
  while (brackets.length && brackets[brackets.length - 1].nodeIdx >= br.nodeIdx) brackets.pop();
  if (br.img) nodes[br.nodeIdx] = { t: 7, src: clean, title: title, ch: children };
  else nodes[br.nodeIdx] = { t: 6, href: clean, title: title, ch: children };
  return end;
}

function altText(nodes) {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.t === 0 || nd.t === 1 || nd.t === 2) out += nd.s;
    else if (nd.t === 3) { if (nd.len > 0) out += nd.ch.repeat(nd.len); }
    else if (nd.t === 4 || nd.t === 5) out += '\n';
    else if (nd.t === 6) out += altText(nd.ch);
    else if (nd.t === 7) out += altText(nd.ch);
    else if (nd.t === 8) out += nd.img ? '![' : '[';
  }
  return out;
}

// Process emphasis / strikethrough delimiters in one node array, in place.
function processEmphasis(nodes) {
  const stack = []; // entries: {node, idx}
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.t !== 3) continue;
    if (node.c) {
      // look for a matching opener
      while (node.len > 0) {
        let opener = null, openerIdx = -1, openerNodeIdx = -1;
        for (let si = stack.length - 1; si >= 0; si--) {
          const e = stack[si];
          const o = e.node;
          if (o.ch !== node.ch || !o.o) continue;
          // odd-match rule: blocked when the sum is a multiple of 3,
          // unless both lengths are multiples of 3
          if ((o.c || node.o) && (o.len + node.len) % 3 === 0 &&
              !(o.len % 3 === 0 && node.len % 3 === 0)) continue;
          // a single closer must not split a double opener when a later
          // double closer could still form a strong with it: `**a *b*c* d**`
          // keeps the `**` strong and leaves the middle `*` literal.
          // (A triple opener is fine: using 1 leaves 2 for the strong.)
          if (node.len === 1 && o.len === 2) {
            let laterStrong = false;
            for (let nj = ni + 1; nj < nodes.length; nj++) {
              const nd = nodes[nj];
              if (nd.t === 3 && nd.ch === node.ch && nd.len >= 2 && nd.c) { laterStrong = true; break; }
            }
            if (laterStrong) continue;
          }
          opener = o; openerIdx = si; openerNodeIdx = e.idx; break;
        }
        if (!opener) break;
        const use = (opener.len >= 2 && node.len >= 2) ? 2 : 1;
        const tag = node.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
        opener.opens.push(tag);
        opener.len -= use;
        node.closes.push(tag);
        node.len -= use;
        if (opener.len === 0) stack.splice(openerIdx, 1);
        // marked rule (doc-07/11/26): a standalone `**` closer that can
        // also open (followed by a letter) forming a strong with a `**`
        // opener that cannot close (preceded by whitespace) invalidates
        // an enclosing single `*` opener, so `*a **b**c*` stays literal
        // outside the strong. Only when the closer is fully consumed
        // (a `***` run's leftover still forms the outer em, doc-19).
        // (cm-410: closer cannot open; cm-411: opener can close.)
        if (use === 2 && node.len === 0 && node.o && !opener.c) {
          for (let si = stack.length - 1; si >= 0; si--) {
            const e2 = stack[si];
            if (e2.node.ch === node.ch && e2.node.len === 1 && e2.idx < openerNodeIdx) {
              stack.splice(si, 1);
              break;
            }
          }
        }
        // unmatched openers strictly between the opener and this closer
        // now sit inside the emphasis just formed: they can no longer
        // match anything outside it (that would cross the boundary)
        for (let si = stack.length - 1; si >= 0; si--) {
          if (stack[si].idx > openerNodeIdx) stack.splice(si, 1);
        }
      }
    }
    if (node.len > 0 && node.o) stack.push({ node: node, idx: ni });
  }
  return nodes;
}

function renderInline(nodes, refs) {
  processEmphasis(nodes);
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.t === 0) out += esc(nd.s);
    else if (nd.t === 1) out += nd.s;
    else if (nd.t === 2) out += '<code>' + escCode(nd.s) + '</code>';
    else if (nd.t === 3) {
      for (let k = 0; k < nd.closes.length; k++) out += '</' + nd.closes[k] + '>';
      if (nd.len > 0) out += nd.ch.repeat(nd.len);
      for (let k = nd.opens.length - 1; k >= 0; k--) out += '<' + nd.opens[k] + '>';
    }
    else if (nd.t === 4) out += '<br>';
    else if (nd.t === 5) out += '\n';
    else if (nd.t === 6) {
      out += '<a href="' + esc(nd.href) + '"';
      if (nd.title !== null && nd.title !== undefined) out += ' title="' + esc(nd.title) + '"';
      out += '>' + renderInline(nd.ch, refs) + '</a>';
    }
    else if (nd.t === 7) {
      processEmphasis(nd.ch);
      out += '<img src="' + esc(nd.src) + '" alt="' + esc(altText(nd.ch)) + '"';
      if (nd.title !== null && nd.title !== undefined) out += ' title="' + esc(nd.title) + '"';
      out += '>';
    }
    else if (nd.t === 8) out += nd.img ? '![' : '[';
  }
  return out;
}

// Scan one inline string into nodes.
function scanInline(s, refs) {
  const nodes = [];
  const brackets = [];
  let text = '';
  const flush = () => { if (text) { nodes.push({ t: 0, s: text }); text = ''; } };
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s.charCodeAt(i);
    if (ch === 92) { // backslash
      const nc = i + 1 < n ? s.charCodeAt(i + 1) : -1;
      if (nc === 10) {
        flush(); nodes.push({ t: 4 }); i += 2;
        // a hard break strips leading spaces/tabs of the next line
        while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
        continue;
      }
      if (nc >= 0 && isAsciiPunctCode(nc)) {
        // an escaped & must not be re-read as an entity when rendered
        if (nc === 38) { flush(); nodes.push({ t: 1, s: '&amp;' }); }
        else text += s[i + 1];
        i += 2; continue;
      }
      text += '\\'; i++; continue;
    }
    if (ch === 10) { // newline
      let k = text.length;
      while (k > 0 && text.charCodeAt(k - 1) === 32) k--;
      if (text.length - k >= 2) {
        text = text.slice(0, k); flush(); nodes.push({ t: 4 });
        i++;
        // a hard break strips leading spaces/tabs of the next line
        while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
      } else { flush(); nodes.push({ t: 5 }); i++; }
      continue;
    }
    if (ch === 96) { // backtick run
      let run = 0;
      while (i + run < n && s.charCodeAt(i + run) === 96) run++;
      let close = -1;
      let j = i + run;
      // a code span inside link text cannot swallow the `]` that closes
      // the link (doc-28) — UNLESS its closer sits inside the link's
      // destination `(...)` (cm-342: `` `link` `` closes at the backtick
      // in `/foo``), in which case the `]` is code content
      const inBr = brackets.length > 0;
      while (j < n) {
        if (inBr && s.charCodeAt(j) === 93) {
          // look for a matching backtick run inside the destination
          // `(...)` or immediately after its `)` (cm-342, cm-525);
          // if none, the `]` closes the link and the span is unclosed
          let k = j + 1, found = -1, paren = -1;
          while (k < n && s.charCodeAt(k) !== 10) {
            if (s.charCodeAt(k) === 41) { paren = k; break; }
            if (s.charCodeAt(k) === 96) {
              let r2 = 0;
              while (k + r2 < n && s.charCodeAt(k + r2) === 96) r2++;
              if (r2 === run) { found = k; break; }
              k += r2;
            } else k++;
          }
          if (found < 0 && paren >= 0) {
            // a matching run immediately after the destination `)`
            let k2 = paren + 1;
            if (k2 < n && s.charCodeAt(k2) === 96) {
              let r2 = 0;
              while (k2 + r2 < n && s.charCodeAt(k2 + r2) === 96) r2++;
              if (r2 === run) found = k2;
            }
          }
          if (found < 0) break;
          close = found; break;
        }
        if (s.charCodeAt(j) === 96) {
          let r2 = 0;
          while (j + r2 < n && s.charCodeAt(j + r2) === 96) r2++;
          if (r2 === run) { close = j; break; }
          j += r2;
        } else j++;
      }
      if (close < 0) { text += '`'.repeat(run); i += run; continue; }
      let content = s.slice(i + run, close);
      if (content.indexOf('\n') >= 0) content = content.replace(/\n/g, ' ');
      if (content.length >= 2 && content.charCodeAt(0) === 32 &&
          content.charCodeAt(content.length - 1) === 32 && /[^ ]/.test(content)) {
        content = content.slice(1, -1);
      }
      flush();
      nodes.push({ t: 2, s: content });
      i = close + run;
      continue;
    }
    if (ch === 42 || ch === 95 || ch === 126) { // * _ ~
      let run = 0;
      while (i + run < n && s.charCodeAt(i + run) === ch) run++;
      if (ch === 126 && run >= 3) { text += '~'.repeat(run); i += run; continue; }
      const before = i > 0 ? s.charCodeAt(i - 1) : -1;
      const after = i + run < n ? s.charCodeAt(i + run) : -1;
      const beforeWs = before < 0 || isWsCode(before);
      const afterWs = after < 0 || isWsCode(after);
      const beforePunct = before >= 0 && isPunctCode(before);
      const afterPunct = after >= 0 && isPunctCode(after);
      const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
      const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);
      let canOpen, canClose;
      if (ch === 95) {
        canOpen = leftFlanking && (!rightFlanking || beforePunct);
        canClose = rightFlanking && (!leftFlanking || afterPunct);
      } else {
        canOpen = leftFlanking; canClose = rightFlanking;
      }
      // a run that can neither open nor close is literal text; keeping
      // it in the text accumulator also keeps email local parts intact
      if (!canOpen && !canClose) { text += s.slice(i, i + run); i += run; continue; }
      flush();
      nodes.push({ t: 3, ch: ch === 42 ? '*' : ch === 95 ? '_' : '~', len: run, o: canOpen, c: canClose, opens: [], closes: [] });
      i += run;
      continue;
    }
    if (ch === 91 || (ch === 33 && i + 1 < n && s.charCodeAt(i + 1) === 91)) { // [ or ![
      const img = ch === 33;
      const start = img ? i + 2 : i + 1;
      flush();
      const br = { t: 8, img: img, start: start, nodeIdx: nodes.length };
      nodes.push(br);
      brackets.push(br);
      i = start;
      continue;
    }
    if (ch === 93) { // ]
      if (brackets.length) {
        flush();
        const br = brackets[brackets.length - 1];
        const end = tryLink(s, i, n, br, nodes, brackets, refs);
        if (end >= 0) { i = end; continue; }
        brackets.pop();
      }
      text += ']'; i++;
      continue;
    }
    if (ch === 60) { // < autolink / raw HTML
      let handled = false;
      const gt = s.indexOf('>', i + 1);
      if (gt > i + 1) {
        const inner = s.slice(i + 1, gt);
        // URI autolink: scheme (2-32 chars) + ':' + no spaces/controls/</>
        let ok = false;
        let schemeLen = 0;
        if (isAlphaCode(inner.charCodeAt(0))) {
          let k = 1;
          while (k < inner.length && k < 32) {
            const c = inner.charCodeAt(k);
            if (isAlnumCode(c) || c === 43 || c === 46 || c === 45) k++;
            else break;
          }
          if (k >= 2 && k < inner.length && inner.charCodeAt(k) === 58) {
            schemeLen = k;
            ok = true;
            for (let m = k + 1; m < inner.length; m++) {
              const c = inner.charCodeAt(m);
              if (c === 32 || c === 9 || c === 10 || c === 60 || c === 62 || c < 32 || c === 127) { ok = false; break; }
            }
          }
        }
        if (ok) {
          const href = cleanUrl(inner);
          if (href !== null) {
            flush();
            nodes.push({ t: 6, href: href, title: null, ch: [{ t: 0, s: inner }], auto: true });
            i = gt + 1; handled = true;
          }
        }
        if (!handled) {
          // email autolink
          const em = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(inner);
          if (em) {
            flush();
            nodes.push({ t: 6, href: 'mailto:' + inner, title: null, ch: [{ t: 0, s: inner }], auto: true });
            i = gt + 1; handled = true;
          }
        }
      }
      if (!handled) {
        // raw HTML
        let rawEnd = -1;
        if (s.startsWith('<!--', i)) {
          if (s.startsWith('<!-->', i)) rawEnd = i + 5;
          else if (s.startsWith('<!--->', i)) rawEnd = i + 6;
          else {
            const e = s.indexOf('-->', i + 4);
            if (e >= 0) rawEnd = e + 3;
          }
        } else if (s.startsWith('<?', i)) {
          const e = s.indexOf('?>', i + 2);
          if (e >= 0) rawEnd = e + 2;
        } else if (s.startsWith('<![CDATA[', i)) {
          const e = s.indexOf(']]>', i + 9);
          if (e >= 0) rawEnd = e + 3;
        } else if (s.startsWith('<!', i) && i + 2 < n && isAlphaCode(s.charCodeAt(i + 2))) {
          const e = s.indexOf('>', i + 2);
          if (e >= 0) rawEnd = e + 1;
        } else {
          const te = parseTag(s, i, n);
          if (te > 0) rawEnd = te;
        }
        if (rawEnd > 0) {
          flush();
          nodes.push({ t: 1, s: s.slice(i, rawEnd) });
          i = rawEnd;
          continue;
        }
        text += '<'; i++;
        continue;
      }
      continue;
    }
    if (ch === 38) { // & entity
      const elen = entityAt(s, i, n);
      if (elen > 0) {
        if (s.charCodeAt(i + 1) === 35) {
          const dec = decodeNumeric(s, i, n);
          // a decoded & must not be re-read as an entity when rendered
          if (dec === '&') { flush(); nodes.push({ t: 1, s: '&amp;' }); }
          else text += dec;
        } else {
          flush();
          nodes.push({ t: 1, s: s.slice(i, i + elen) });
        }
        i += elen;
        continue;
      }
      text += '&'; i++;
      continue;
    }
    if (ch === 119 || ch === 104 || ch === 87 || ch === 72) { // w / h / W / H : www. / http(s)://
      // extended autolinks DO form inside brackets (doc-39): if the
      // outer bracket later forms a link, the autolink is allowed
      // inside link text; if it does not form, the autolink stands
      const au = tryExtUrl(s, i, n, brackets.length > 0);
      if (au) {
        flush();
        nodes.push({ t: 6, href: au.href, title: null, ch: [{ t: 0, s: au.text }], auto: true, ext: true });
        i = au.end;
        continue;
      }
      text += s[i]; i++;
      continue;
    }
    if (ch === 109 || ch === 120 || ch === 77 || ch === 88) { // m / x / M / X : mailto: / xmpp:
      const pr = tryProtocol(s, i, n);
      if (pr) {
        flush();
        nodes.push({ t: 6, href: pr.href, title: null, ch: [{ t: 0, s: pr.text }], auto: true });
        i = pr.end;
        continue;
      }
      text += s[i]; i++;
      continue;
    }
    if (ch === 64) { // @ : email autolink
      // extended autolinks DO form inside brackets (doc-39), same as URLs
      const em = tryExtEmail(s, i, n, text, nodes);
      if (em) {
        text = text.slice(0, text.length - em.localLen);
        flush();
        nodes.push({ t: 6, href: em.href, title: null, ch: [{ t: 0, s: em.text }], auto: true, ext: true });
        i = em.end;
        continue;
      }
      text += '@'; i++;
      continue;
    }
    text += s[i];
    i++;
  }
  flush();
  return nodes;
}

function inline(s, refs) {
  return renderInline(scanInline(s, refs), refs);
}

// ---- block rendering ----
function renderBlocks(blocks, refs, out, tight) {
  for (let i = 0; i < blocks.length; i++) renderBlock(blocks[i], refs, out, tight, null);
}

function renderItem(item, listTight, refs, out) {
  out.push('<li>');
  const cb = item.task === null ? null :
    item.task === 'x' ? '<input checked="" disabled="" type="checkbox"> '
                      : '<input disabled="" type="checkbox"> ';
  if (item.ch.length === 0) {
    if (cb) out.push(cb);
    out.push('</li>\n');
    return;
  }
  renderBlock(item.ch[0], refs, out, listTight, cb);
  for (let i = 1; i < item.ch.length; i++) renderBlock(item.ch[i], refs, out, listTight, null);
  out.push('</li>\n');
}

function renderBlock(b, refs, out, tight, cb) {
  switch (b.t) {
    case 'para': {
      const text = inline(b.lines.join('\n'), refs);
      if (tight) {
        if (cb) out.push(cb);
        out.push(text);
      } else {
        out.push('<p>');
        if (cb) out.push(cb);
        out.push(text);
        out.push('</p>\n');
      }
      break;
    }
    case 'head': {
      out.push('<h' + b.level + '>');
      out.push(inline(b.text, refs));
      out.push('</h' + b.level + '>\n');
      break;
    }
    case 'code': {
      if (b.fenced && b.info) out.push('<pre><code class="language-' + b.info + '">');
      else out.push('<pre><code>');
      out.push(escCode(b.lines.length ? b.lines.join('\n') + '\n' : ''));
      out.push('</code></pre>\n');
      break;
    }
    case 'html': {
      if (cb) out.push(cb);
      out.push(b.lines.join('\n') + (b.trailNl ? '\n' : ''));
      break;
    }
    case 'hr': {
      if (cb) out.push(cb);
      out.push('<hr>\n');
      break;
    }
    case 'quote': {
      if (cb) out.push(cb);
      out.push('<blockquote>\n');
      renderBlocks(b.ch, refs, out, false);
      out.push('</blockquote>\n');
      break;
    }
    case 'list': {
      if (cb) out.push(cb);
      if (b.ordered) out.push(b.start !== 1 ? '<ol start="' + b.start + '">\n' : '<ol>\n');
      else out.push('<ul>\n');
      for (let i = 0; i < b.ch.length; i++) renderItem(b.ch[i], b.tight, refs, out);
      out.push(b.ordered ? '</ol>\n' : '</ul>\n');
      break;
    }
    case 'table': {
      if (cb) out.push(cb);
      out.push('<table>\n<thead>\n<tr>\n');
      for (let i = 0; i < b.head.length; i++) {
        const a = b.align[i];
        out.push(a ? '<th align="' + a + '">' : '<th>');
        out.push(inline(b.head[i], refs));
        out.push('</th>\n');
      }
      out.push('</tr>\n</thead>\n');
      if (b.rows.length) {
        out.push('<tbody>');
        for (let r = 0; r < b.rows.length; r++) {
          out.push('<tr>\n');
          const row = b.rows[r];
          for (let i = 0; i < b.head.length; i++) {
            const a = b.align[i];
            out.push(a ? '<td align="' + a + '">' : '<td>');
            out.push(inline(i < row.length ? row[i] : '', refs));
            out.push('</td>\n');
          }
          out.push('</tr>\n');
        }
        out.push('</tbody>');
      }
      out.push('</table>\n');
      break;
    }
  }
}

export function parse(markdown) {
  let src = typeof markdown === 'string' ? markdown : String(markdown);
  src = src.replace(/\r\n?/g, '\n');
  const endsWithNl = src.endsWith('\n');
  const lines = src.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const refs = new Map();
  const doc = blockParse(lines, refs);
  // HTML blocks: a trailing newline is emitted only when marked's raw
  // match would include one — cond 6 only at the very end of the input,
  // cond 1-5 whenever the next line is not blank (or at end of input).
  (function setTrail(b) {
    if (b.t === 'html') {
      const isLast = b.lastLine === lines.length - 1;
      // a tab-only next line is NOT blank for this rule (doc-15): only
      // an empty or spaces-only line suppresses the trailing newline
      let nextBlank = false;
      if (!isLast) {
        const nl = lines[b.lastLine + 1];
        nextBlank = nl.length === 0 || /^[ ]+$/.test(nl);
      }
      b.trailNl = b.cond <= 5 ? (isLast ? endsWithNl : !nextBlank) : (isLast && endsWithNl);
    }
    if (b.ch) for (let i = 0; i < b.ch.length; i++) setTrail(b.ch[i]);
  })(doc);
  const out = [];
  renderBlocks(doc.ch, refs, out, false);
  return out.join('');
}
