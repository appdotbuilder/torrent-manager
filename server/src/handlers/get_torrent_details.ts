import { db } from '../db';
import { torrentsTable, torrentFilesTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { type Torrent, type TorrentFile } from '../schema';

export interface TorrentDetailsResponse {
    torrent: Torrent;
    files: TorrentFile[];
}

export async function getTorrentDetails(
    torrentId: string,
    userId: string
): Promise<TorrentDetailsResponse | null> {
    try {
        // Query for the torrent with user verification
        const torrentResults = await db.select()
            .from(torrentsTable)
            .where(and(
                eq(torrentsTable.id, torrentId),
                eq(torrentsTable.user_id, userId)
            ))
            .execute();

        // Return null if torrent not found or doesn't belong to user
        if (torrentResults.length === 0) {
            return null;
        }

        const torrentRecord = torrentResults[0];

        // Convert numeric fields to numbers for the torrent
        const torrent: Torrent = {
            ...torrentRecord,
            total_size: parseFloat(torrentRecord.total_size),
            downloaded_size: parseFloat(torrentRecord.downloaded_size),
            progress: parseFloat(torrentRecord.progress),
            download_speed: parseFloat(torrentRecord.download_speed),
            upload_speed: parseFloat(torrentRecord.upload_speed)
        };

        // Query for all files associated with the torrent
        const fileResults = await db.select()
            .from(torrentFilesTable)
            .where(eq(torrentFilesTable.torrent_id, torrentId))
            .execute();

        // Convert numeric fields to numbers for the files
        const files: TorrentFile[] = fileResults.map(fileRecord => ({
            ...fileRecord,
            file_size: parseFloat(fileRecord.file_size)
        }));

        return {
            torrent,
            files
        };
    } catch (error) {
        console.error('Failed to get torrent details:', error);
        throw error;
    }
}