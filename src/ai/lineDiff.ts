export interface LineChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/**
 * Computes line-by-line differences between original and updated code using
 * Longest Common Subsequence (LCS).
 */
export function computeLineDiff(originalText: string, updatedText: string): LineChange[] {
  const originalLines = originalText.split('\n');
  const updatedLines = updatedText.split('\n');

  const originalLength = originalLines.length;
  const updatedLength = updatedLines.length;

  // Build LCS matrix
  const matrix: number[][] = Array.from({ length: originalLength + 1 }, () =>
    new Array(updatedLength + 1).fill(0),
  );

  for (let originalIndex = 0; originalIndex < originalLength; originalIndex++) {
    for (let updatedIndex = 0; updatedIndex < updatedLength; updatedIndex++) {
      if (originalLines[originalIndex] === updatedLines[updatedIndex]) {
        matrix[originalIndex + 1][updatedIndex + 1] =
          matrix[originalIndex][updatedIndex] + 1;
      } else {
        matrix[originalIndex + 1][updatedIndex + 1] = Math.max(
          matrix[originalIndex + 1][updatedIndex],
          matrix[originalIndex][updatedIndex + 1],
        );
      }
    }
  }

  // Backtrack to reconstruct the diff
  const changes: LineChange[] = [];
  let currentOriginalIndex = originalLength;
  let currentUpdatedIndex = updatedLength;

  while (currentOriginalIndex > 0 || currentUpdatedIndex > 0) {
    if (
      currentOriginalIndex > 0 &&
      currentUpdatedIndex > 0 &&
      originalLines[currentOriginalIndex - 1] === updatedLines[currentUpdatedIndex - 1]
    ) {
      changes.unshift({
        value: originalLines[currentOriginalIndex - 1],
      });
      currentOriginalIndex--;
      currentUpdatedIndex--;
    } else if (
      currentUpdatedIndex > 0 &&
      (currentOriginalIndex === 0 ||
        matrix[currentOriginalIndex][currentUpdatedIndex - 1] >=
          matrix[currentOriginalIndex - 1][currentUpdatedIndex])
    ) {
      changes.unshift({
        added: true,
        value: updatedLines[currentUpdatedIndex - 1],
      });
      currentUpdatedIndex--;
    } else if (
      currentOriginalIndex > 0 &&
      (currentUpdatedIndex === 0 ||
        matrix[currentOriginalIndex][currentUpdatedIndex - 1] <
          matrix[currentOriginalIndex - 1][currentUpdatedIndex])
    ) {
      changes.unshift({
        removed: true,
        value: originalLines[currentOriginalIndex - 1],
      });
      currentOriginalIndex--;
    }
  }

  return changes;
}
