import { Prisma } from '@prisma/client';
import { db } from '../db';
import { ApiError } from '../auth/http';
import type { CronReplayStore } from './jobs';

export const databaseReplayStore: CronReplayStore = {
  async consumeOnce(fingerprint, expiresAt) {
    try {
      await db.operationsReplayNonce.create({ data: { fingerprint, expiresAt } });
      await db.operationsReplayNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw new ApiError(503, 'Scheduled-operation replay storage is unavailable.');
    }
  },
};
