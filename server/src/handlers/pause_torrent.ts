import { db } from '../db';
import { torrentsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface PauseTorrentInput {
    torrent_id: string;
}

export async function pauseTorrent(
    input: PauseTorrentInput,
    userId: string
): Promise<{ success: boolean }> {
    try {
        // Update torrent status to 'paused', but only if it belongs to the requesting user
        const result = await db.update(torrentsTable)
            .set({
                status: 'paused',
                updated_at: new Date()
            })
            .where(and(
                eq(torrentsTable.id, input.torrent_id),
                eq(torrentsTable.user_id, userId)
            ))
            .returning({ id: torrentsTable.id })
            .execute();

        // If no rows were affected, the torrent either doesn't exist or doesn't belong to the user
        if (result.length === 0) {
            throw new Error('Torrent not found or access denied');
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to pause torrent:', error);
        throw error;
    }
}