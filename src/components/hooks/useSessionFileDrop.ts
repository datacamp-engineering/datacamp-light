import { useCallback } from 'react';
import type { IJsonRpcSession } from '../../jsonrpc/session';

export function useSessionFileDrop(session: IJsonRpcSession | null) {
  const handleFileDrop = useCallback(
    async (file: File) => {
      if (!session) return;
      try {
        const content = await file.text();
        const result = await session.writeFile({ path: file.name, data: content });
        console.log(`Added ${file.name} (${file.size} bytes) to ${result.cwd || ''}`);
      } catch (uploadError: any) {
        console.warn(`Failed to add ${file.name}:`, uploadError);
      }
    },
    [session],
  );

  return { handleFileDrop };
}
