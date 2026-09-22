import { randomUUID } from 'node:crypto';

export const newActionId = (): string => randomUUID();
export const currentTimestamp = (): string => new Date().toISOString();
