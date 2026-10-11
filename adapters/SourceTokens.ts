/** Small lexical reader for assertion messages and native test macros. Comments stay outside calls. */
export interface SourceToken { type: "string" | "symbol" | "identifier"; value: string; start: number; end: number }

export class SourceTokens {
  read(source: string, language: string) {
    const tokens: SourceToken[] = [];
    let position = 0;
    while (position < source.length) {
      const start = position;
      const character = source[position];
      if (/\s/.test(character)) {
        position++;
      } else if (source.startsWith("//", position) || (language === "godot" && character === "#")) {
        const end = source.indexOf("\n", position);
        position = end < 0 ? source.length : end;
      } else if (source.startsWith("/*", position)) {
        const end = source.indexOf("*/", position + 2);
        position = end < 0 ? source.length : end + 2;
      } else if (language === "cpp" && source.startsWith('R"', position)) {
        const opening = source.indexOf("(", position + 2);
        const delimiter = source.slice(position + 2, opening);
        const closing = source.indexOf(`)${delimiter}"`, opening + 1);
        position = closing < 0 ? source.length : closing + delimiter.length + 2;
        tokens.push({ type: "string", value: source.slice(opening + 1, closing), start, end: position });
      } else if (["'", '"'].includes(character)) {
        const triple = language === "godot" && source.startsWith(character.repeat(3), position);
        const quote = triple ? character.repeat(3) : character;
        position += quote.length;
        let value = "";
        while (position < source.length && !source.startsWith(quote, position)) {
          if (source[position] === "\\") {
            const escape = source[++position];
            value += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escape] ?? escape;
            position++;
          } else {
            value += source[position++];
          }
        }
        position += quote.length;
        tokens.push({ type: "string", value, start, end: position });
      } else if (/[A-Za-z_]/.test(character)) {
        position++;
        while (/[A-Za-z_0-9]/.test(source[position] ?? "" ) && position < source.length) position++;
        tokens.push({ type: "identifier", value: source.slice(start, position), start, end: position });
      } else {
        tokens.push({ type: "symbol", value: character, start, end: ++position });
      }
    }
    return tokens;
  }

  retrieveCall(tokens: SourceToken[], index: number) {
    const argumentsList: SourceToken[][] = [[]];
    let depth = 1;
    let cursor = index + 2;
    while (cursor < tokens.length && depth > 0) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value) && token.type === "symbol") depth++;
      if ([")", "]", "}"].includes(token.value) && token.type === "symbol") depth--;
      if (depth === 1 && token.value === "," && token.type === "symbol") argumentsList.push([]);
      else if (depth > 0) argumentsList.at(-1)!.push(token);
      cursor++;
    }
    return { arguments: argumentsList, endIndex: cursor, end: tokens[cursor - 1]?.end };
  }
}
