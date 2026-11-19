export type DiffToken = { text: string; changed: boolean; space: boolean };

function tokens(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function normalize(token: string): string {
  return token.trim().toLowerCase().replace(/[^\w%]+/g, "");
}

/** Word-level diff for side-by-side correction review. */
export function diffWords(original: string, proposed: string): {
  original: DiffToken[];
  proposed: DiffToken[];
} {
  const left = tokens(original);
  const right = tokens(proposed);
  const rows = Math.min(left.length, 140);
  const columns = Math.min(right.length, 140);
  const dp: number[][] = Array.from({ length: rows + 1 }, () =>
    Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      dp[i][j] =
        normalize(left[i]) === normalize(right[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const leftChanged = new Set<number>();
  const rightChanged = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (normalize(left[i]) === normalize(right[j])) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      leftChanged.add(i);
      i += 1;
    } else {
      rightChanged.add(j);
      j += 1;
    }
  }
  while (i < rows) {
    leftChanged.add(i);
    i += 1;
  }
  while (j < columns) {
    rightChanged.add(j);
    j += 1;
  }
  return {
    original: left.map((text, index) => ({
      text,
      changed: leftChanged.has(index),
      space: /\s$/.test(text),
    })),
    proposed: right.map((text, index) => ({
      text,
      changed: rightChanged.has(index),
      space: /\s$/.test(text),
    })),
  };
}
