import { db } from '../db';
import { torrentsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface ResumeTorrentInput {
  torrent_id: string;
}

export interface ResumeTorrentResult {
  success: boolean;
}

export async function resumeTorrent(
  input: ResumeTorrentInput,
  userId: string
): Promise<ResumeTorrentResult> {
  try {
    // First, verify the torrent exists and belongs to the requesting user
    const existingTorrents = await db.select()
      .from(torrentsTable)
      .where(and(
        eq(torrentsTable.id, input.torrent_id),
        eq(torrentsTable.user_id, userId)
      ))
      .execute();

    if (existingTorrents.length === 0) {
      throw new Error(`Torrent not found or access denied`);
    }

    const torrent = existingTorrents[0];

    // Check if torrent is in a state that can be resumed
    if (torrent.status === 'completed') {
      throw new Error('Cannot resume completed torrent');
    }

    if (torrent.status === 'error') {
      throw new Error('Cannot resume torrent in error state');
    }

    if (torrent.status === 'downloading') {
      // Already downloading, no action needed
      return { success: true };
    }

    // Update torrent status to 'downloading'
    await db.update(torrentsTable)
      .set({
        status: 'downloading',
        updated_at: new Date()
      })
      .where(and(
        eq(torrentsTable.id, input.torrent_id),
        eq(torrentsTable.user_id, userId)
      ))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Resume torrent failed:', error);
    throw error;
  }
}