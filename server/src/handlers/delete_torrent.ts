import { db } from '../db';
import { torrentsTable, torrentFilesTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface DeleteTorrentInput {
  torrent_id: string;
}

export const deleteTorrent = async (
  input: DeleteTorrentInput,
  userId: string
): Promise<{ success: boolean }> => {
  try {
    // First verify the torrent exists and belongs to the user
    const existingTorrent = await db.select()
      .from(torrentsTable)
      .where(
        and(
          eq(torrentsTable.id, input.torrent_id),
          eq(torrentsTable.user_id, userId)
        )
      )
      .execute();

    if (existingTorrent.length === 0) {
      throw new Error('Torrent not found or access denied');
    }

    // Delete related torrent files first (due to foreign key constraint)
    await db.delete(torrentFilesTable)
      .where(eq(torrentFilesTable.torrent_id, input.torrent_id))
      .execute();

    // Delete the torrent record
    await db.delete(torrentsTable)
      .where(
        and(
          eq(torrentsTable.id, input.torrent_id),
          eq(torrentsTable.user_id, userId)
        )
      )
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Torrent deletion failed:', error);
    throw error;
  }
};