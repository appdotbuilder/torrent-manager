import { db } from '../db';
import { torrentsTable } from '../db/schema';
import { type Torrent } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function getUserTorrents(userId: string): Promise<Torrent[]> {
  try {
    // Query torrents for the user, ordered by created_at (newest first)
    const results = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.user_id, userId))
      .orderBy(desc(torrentsTable.created_at))
      .execute();

    // Convert numeric fields from strings to numbers before returning
    return results.map(torrent => ({
      ...torrent,
      total_size: parseFloat(torrent.total_size),
      downloaded_size: parseFloat(torrent.downloaded_size),
      progress: parseFloat(torrent.progress),
      download_speed: parseFloat(torrent.download_speed),
      upload_speed: parseFloat(torrent.upload_speed)
    }));
  } catch (error) {
    console.error('Failed to get user torrents:', error);
    throw error;
  }
}