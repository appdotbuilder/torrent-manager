import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable, torrentFilesTable } from '../db/schema';
import { getTorrentDetails } from '../handlers/get_torrent_details';

describe('getTorrentDetails', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should return torrent details with files for valid user', async () => {
        // Create a test user
        const userId = 'test-user-1';
        await db.insert(usersTable).values({
            id: userId,
            email: 'test@example.com',
            name: 'Test User',
            password_hash: 'hashed_password'
        });

        // Create a test torrent
        const torrentId = 'test-torrent-1';
        await db.insert(torrentsTable).values({
            id: torrentId,
            user_id: userId,
            name: 'Test Torrent',
            info_hash: 'abc123def456',
            magnet_link: 'magnet:?xt=urn:btih:abc123def456',
            file_path: '/downloads/test-torrent',
            total_size: '1073741824', // 1GB as string
            downloaded_size: '536870912', // 512MB as string
            progress: '50.00',
            download_speed: '1048576.50', // ~1MB/s
            upload_speed: '524288.25', // ~512KB/s
            peers: 10,
            seeds: 5,
            status: 'downloading'
        });

        // Create test files for the torrent
        await db.insert(torrentFilesTable).values([
            {
                id: 'file-1',
                torrent_id: torrentId,
                file_path: 'movie.mkv',
                file_size: '1000000000', // ~1GB as string
                is_directory: false
            },
            {
                id: 'file-2',
                torrent_id: torrentId,
                file_path: 'subtitles.srt',
                file_size: '73741824', // ~70MB as string
                is_directory: false
            }
        ]);

        const result = await getTorrentDetails(torrentId, userId);

        expect(result).toBeDefined();
        expect(result!.torrent.id).toEqual(torrentId);
        expect(result!.torrent.name).toEqual('Test Torrent');
        expect(result!.torrent.user_id).toEqual(userId);
        expect(result!.torrent.info_hash).toEqual('abc123def456');
        expect(result!.torrent.magnet_link).toEqual('magnet:?xt=urn:btih:abc123def456');
        expect(result!.torrent.file_path).toEqual('/downloads/test-torrent');
        expect(result!.torrent.status).toEqual('downloading');
        expect(result!.torrent.peers).toEqual(10);
        expect(result!.torrent.seeds).toEqual(5);

        // Check numeric conversions
        expect(typeof result!.torrent.total_size).toEqual('number');
        expect(result!.torrent.total_size).toEqual(1073741824);
        expect(typeof result!.torrent.downloaded_size).toEqual('number');
        expect(result!.torrent.downloaded_size).toEqual(536870912);
        expect(typeof result!.torrent.progress).toEqual('number');
        expect(result!.torrent.progress).toEqual(50.00);
        expect(typeof result!.torrent.download_speed).toEqual('number');
        expect(result!.torrent.download_speed).toEqual(1048576.50);
        expect(typeof result!.torrent.upload_speed).toEqual('number');
        expect(result!.torrent.upload_speed).toEqual(524288.25);

        // Check dates
        expect(result!.torrent.created_at).toBeInstanceOf(Date);
        expect(result!.torrent.updated_at).toBeInstanceOf(Date);

        // Check files
        expect(result!.files).toHaveLength(2);
        
        const movieFile = result!.files.find(f => f.file_path === 'movie.mkv');
        expect(movieFile).toBeDefined();
        expect(movieFile!.torrent_id).toEqual(torrentId);
        expect(typeof movieFile!.file_size).toEqual('number');
        expect(movieFile!.file_size).toEqual(1000000000);
        expect(movieFile!.is_directory).toEqual(false);
        expect(movieFile!.created_at).toBeInstanceOf(Date);

        const subtitlesFile = result!.files.find(f => f.file_path === 'subtitles.srt');
        expect(subtitlesFile).toBeDefined();
        expect(subtitlesFile!.torrent_id).toEqual(torrentId);
        expect(typeof subtitlesFile!.file_size).toEqual('number');
        expect(subtitlesFile!.file_size).toEqual(73741824);
        expect(subtitlesFile!.is_directory).toEqual(false);
    });

    it('should return null for non-existent torrent', async () => {
        // Create a test user
        const userId = 'test-user-1';
        await db.insert(usersTable).values({
            id: userId,
            email: 'test@example.com',
            name: 'Test User',
            password_hash: 'hashed_password'
        });

        const result = await getTorrentDetails('non-existent-torrent', userId);

        expect(result).toBeNull();
    });

    it('should return null when torrent belongs to different user', async () => {
        // Create two test users
        const userId1 = 'test-user-1';
        const userId2 = 'test-user-2';
        await db.insert(usersTable).values([
            {
                id: userId1,
                email: 'test1@example.com',
                name: 'Test User 1',
                password_hash: 'hashed_password'
            },
            {
                id: userId2,
                email: 'test2@example.com',
                name: 'Test User 2',
                password_hash: 'hashed_password'
            }
        ]);

        // Create a torrent for user 1
        const torrentId = 'test-torrent-1';
        await db.insert(torrentsTable).values({
            id: torrentId,
            user_id: userId1,
            name: 'Test Torrent',
            info_hash: 'abc123def456',
            total_size: '1073741824',
            downloaded_size: '536870912',
            progress: '50.00',
            download_speed: '1048576.00',
            upload_speed: '524288.00',
            peers: 10,
            seeds: 5,
            status: 'downloading'
        });

        // Try to access torrent as user 2
        const result = await getTorrentDetails(torrentId, userId2);

        expect(result).toBeNull();
    });

    it('should return torrent with empty files array when no files exist', async () => {
        // Create a test user
        const userId = 'test-user-1';
        await db.insert(usersTable).values({
            id: userId,
            email: 'test@example.com',
            name: 'Test User',
            password_hash: 'hashed_password'
        });

        // Create a torrent without files
        const torrentId = 'test-torrent-1';
        await db.insert(torrentsTable).values({
            id: torrentId,
            user_id: userId,
            name: 'Test Torrent',
            info_hash: 'abc123def456',
            total_size: '1073741824',
            downloaded_size: '0',
            progress: '0.00',
            download_speed: '0.00',
            upload_speed: '0.00',
            peers: 0,
            seeds: 0,
            status: 'paused'
        });

        const result = await getTorrentDetails(torrentId, userId);

        expect(result).toBeDefined();
        expect(result!.torrent.id).toEqual(torrentId);
        expect(result!.torrent.name).toEqual('Test Torrent');
        expect(result!.torrent.status).toEqual('paused');
        expect(result!.files).toHaveLength(0);
        expect(Array.isArray(result!.files)).toBe(true);
    });

    it('should handle directory files correctly', async () => {
        // Create a test user
        const userId = 'test-user-1';
        await db.insert(usersTable).values({
            id: userId,
            email: 'test@example.com',
            name: 'Test User',
            password_hash: 'hashed_password'
        });

        // Create a test torrent
        const torrentId = 'test-torrent-1';
        await db.insert(torrentsTable).values({
            id: torrentId,
            user_id: userId,
            name: 'Test Torrent with Directories',
            info_hash: 'abc123def456',
            total_size: '2147483648',
            downloaded_size: '2147483648',
            progress: '100.00',
            download_speed: '0.00',
            upload_speed: '1048576.00',
            peers: 15,
            seeds: 30,
            status: 'completed'
        });

        // Create files including directories
        await db.insert(torrentFilesTable).values([
            {
                id: 'file-1',
                torrent_id: torrentId,
                file_path: 'Season 1',
                file_size: '0', // Directories typically have 0 size
                is_directory: true
            },
            {
                id: 'file-2',
                torrent_id: torrentId,
                file_path: 'Season 1/Episode 01.mkv',
                file_size: '1073741824',
                is_directory: false
            },
            {
                id: 'file-3',
                torrent_id: torrentId,
                file_path: 'Season 1/Episode 02.mkv',
                file_size: '1073741824',
                is_directory: false
            }
        ]);

        const result = await getTorrentDetails(torrentId, userId);

        expect(result).toBeDefined();
        expect(result!.torrent.status).toEqual('completed');
        expect(result!.files).toHaveLength(3);

        const directory = result!.files.find(f => f.is_directory);
        expect(directory).toBeDefined();
        expect(directory!.file_path).toEqual('Season 1');
        expect(directory!.file_size).toEqual(0);
        expect(directory!.is_directory).toBe(true);

        const episodes = result!.files.filter(f => !f.is_directory);
        expect(episodes).toHaveLength(2);
        episodes.forEach(episode => {
            expect(episode.file_size).toEqual(1073741824);
            expect(episode.is_directory).toBe(false);
        });
    });
});