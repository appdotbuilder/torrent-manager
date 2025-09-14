import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable } from '../db/schema';
import { type UpdateTorrentStatusInput } from '../schema';
import { updateTorrentStatus } from '../handlers/update_torrent_status';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    password_hash: 'hashed_password',
};

// Test torrent data
const testTorrent = {
    id: 'torrent-1',
    user_id: 'user-1',
    name: 'Test Torrent',
    info_hash: 'test-hash-123',
    magnet_link: 'magnet:?xt=urn:btih:test-hash-123',
    file_path: null,
    total_size: '1000000',
    downloaded_size: '500000',
    progress: '50.00',
    download_speed: '1024.50',
    upload_speed: '512.25',
    peers: 10,
    seeds: 5,
    status: 'downloading' as const,
};

// Another user's torrent for access control testing
const otherUserTorrent = {
    id: 'torrent-2',
    user_id: 'user-2',
    name: 'Other User Torrent',
    info_hash: 'other-hash-456',
    magnet_link: 'magnet:?xt=urn:btih:other-hash-456',
    file_path: null,
    total_size: '2000000',
    downloaded_size: '0',
    progress: '0.00',
    download_speed: '0.00',
    upload_speed: '0.00',
    peers: 0,
    seeds: 0,
    status: 'downloading' as const,
};

const otherUser = {
    id: 'user-2',
    email: 'other@example.com',
    name: 'Other User',
    password_hash: 'hashed_password_2',
};

describe('updateTorrentStatus', () => {
    beforeEach(async () => {
        await createDB();
        
        // Create test users
        await db.insert(usersTable).values([testUser, otherUser]).execute();
        
        // Create test torrents
        await db.insert(torrentsTable).values([testTorrent, otherUserTorrent]).execute();
    });

    afterEach(resetDB);

    it('should update torrent status with all fields', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'completed',
            downloaded_size: 1000000,
            progress: 100.0,
            download_speed: 0,
            upload_speed: 256.75,
            peers: 15,
            seeds: 8,
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        // Verify returned data
        expect(result.id).toEqual('torrent-1');
        expect(result.status).toEqual('completed');
        expect(result.downloaded_size).toEqual(1000000);
        expect(result.progress).toEqual(100.0);
        expect(result.download_speed).toEqual(0);
        expect(result.upload_speed).toEqual(256.75);
        expect(result.peers).toEqual(15);
        expect(result.seeds).toEqual(8);
        expect(result.completed_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);

        // Verify database was updated
        const dbTorrent = await db.select()
            .from(torrentsTable)
            .where(eq(torrentsTable.id, 'torrent-1'))
            .execute();

        expect(dbTorrent).toHaveLength(1);
        expect(dbTorrent[0].status).toEqual('completed');
        expect(parseFloat(dbTorrent[0].downloaded_size)).toEqual(1000000);
        expect(parseFloat(dbTorrent[0].progress)).toEqual(100.0);
        expect(parseFloat(dbTorrent[0].upload_speed)).toEqual(256.75);
        expect(dbTorrent[0].completed_at).toBeInstanceOf(Date);
    });

    it('should update torrent status with partial fields', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'paused',
            progress: 75.5,
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        expect(result.status).toEqual('paused');
        expect(result.progress).toEqual(75.5);
        // Other fields should remain unchanged
        expect(result.downloaded_size).toEqual(500000);
        expect(result.download_speed).toEqual(1024.5);
        expect(result.peers).toEqual(10);
        expect(result.seeds).toEqual(5);
        expect(result.completed_at).toBeNull();
    });

    it('should set completed_at when status is completed', async () => {
        const beforeTime = new Date();
        
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'completed',
            progress: 100.0,
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        expect(result.status).toEqual('completed');
        expect(result.completed_at).toBeInstanceOf(Date);
        if (result.completed_at) {
            expect(result.completed_at.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        }
    });

    it('should not set completed_at for non-completed status', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'seeding',
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        expect(result.status).toEqual('seeding');
        expect(result.completed_at).toBeNull();
    });

    it('should handle numeric type conversions correctly', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'downloading',
            downloaded_size: 750000,
            progress: 75.25,
            download_speed: 2048.75,
            upload_speed: 1024.25,
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        // Verify numeric fields are returned as numbers
        expect(typeof result.downloaded_size).toEqual('number');
        expect(typeof result.progress).toEqual('number');
        expect(typeof result.download_speed).toEqual('number');
        expect(typeof result.upload_speed).toEqual('number');
        
        expect(result.downloaded_size).toEqual(750000);
        expect(result.progress).toEqual(75.25);
        expect(result.download_speed).toEqual(2048.75);
        expect(result.upload_speed).toEqual(1024.25);
    });

    it('should throw error when torrent does not exist', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'non-existent-torrent',
            status: 'completed',
        };

        await expect(updateTorrentStatus(updateInput, 'user-1'))
            .rejects.toThrow(/torrent not found/i);
    });

    it('should throw error when torrent belongs to different user', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-2', // This torrent belongs to user-2
            status: 'completed',
        };

        await expect(updateTorrentStatus(updateInput, 'user-1'))
            .rejects.toThrow(/torrent not found/i);
    });

    it('should update torrent for correct user when multiple users exist', async () => {
        // First, verify we can update user-1's torrent
        const updateInput1: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'completed',
        };

        const result1 = await updateTorrentStatus(updateInput1, 'user-1');
        expect(result1.status).toEqual('completed');

        // Then update user-2's torrent with different user ID
        const updateInput2: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-2',
            status: 'paused',
        };

        const result2 = await updateTorrentStatus(updateInput2, 'user-2');
        expect(result2.status).toEqual('paused');
        expect(result2.user_id).toEqual('user-2');
    });

    it('should handle zero values correctly', async () => {
        const updateInput: UpdateTorrentStatusInput = {
            torrent_id: 'torrent-1',
            status: 'paused',
            download_speed: 0,
            upload_speed: 0,
            peers: 0,
            seeds: 0,
        };

        const result = await updateTorrentStatus(updateInput, 'user-1');

        expect(result.download_speed).toEqual(0);
        expect(result.upload_speed).toEqual(0);
        expect(result.peers).toEqual(0);
        expect(result.seeds).toEqual(0);
    });
});