import {
  boardResponse,
  boardError,
  type BoardResponse,
} from '../contracts/index.js';
export async function fetchBoard(): Promise<BoardResponse> {
  const response = await fetch('/api/actions', { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = boardError.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'Unable to read Actions.',
    );
  }
  return boardResponse.parse(body);
}
