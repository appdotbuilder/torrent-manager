import { db } from '../db';
import { torrentsTable } from '../db/schema';
import { type UpdateTorrentStatusInput, type Torrent } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function updateTorrentStatus(
    input: UpdateTorrentStatusInput,
    userId: string
): Promise<Torrent> {
    try {
        // Build update object with only provided fields
        const updateData: any = {
            status: input.status,
            updated_at: new Date(),
        };

        // Add optional fields if provided
        if (input.downloaded_size !== undefined) {
            updateData.downloaded_size = input.downloaded_size.toString();
        }

        if (input.progress !== undefined) {
            updateData.progress = input.progress.toString();
        }

        if (input.download_speed !== undefined) {
            updateData.download_speed = input.download_speed.toString();
        }

        if (input.upload_speed !== undefined) {
            updateData.upload_speed = input.upload_speed.toString();
        }

        if (input.peers !== undefined) {
            updateData.peers = input.peers;
        }

        if (input.seeds !== undefined) {
            updateData.seeds = input.seeds;
        }

        // Set completed_at timestamp if status is 'completed'
        if (input.status === 'completed') {
            updateData.completed_at = new Date();
        }

        // Update the torrent, ensuring it belongs to the user
        const result = await db.update(torrentsTable)
            .set(updateData)
            .where(and(
                eq(torrentsTable.id, input.torrent_id),
                eq(torrentsTable.user_id, userId)
            ))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error('Torrent not found or does not belong to user');
        }

        // Convert numeric fields back to numbers before returning
        const torrent = result[0];
        return {
            ...torrent,
            total_size: parseFloat(torrent.total_size),
            downloaded_size: parseFloat(torrent.downloaded_size),
            progress: parseFloat(torrent.progress),
            download_speed: parseFloat(torrent.download_speed),
            upload_speed: parseFloat(torrent.upload_speed),
        };
    } catch (error) {
        console.error('Torrent status update failed:', error);
        throw error;
    }
}