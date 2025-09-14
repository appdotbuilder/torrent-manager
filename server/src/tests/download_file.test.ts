import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable, torrentFilesTable } from '../db/schema';
import { type DownloadFileInput } from '../schema';
import { downloadFile } from '../handlers/download_file';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test data
const testUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    password_hash: 'hashed_password'
};

const testTorrent = {
    id: 'torrent-1',
    user_id: 'user-1',
    name: 'Test Movie',
    info_hash: 'abcd1234',
    total_size: '1000000000',
    status: 'completed' as const,
    file_path: '' // Will be set in tests
};

const testTorrentFile = {
    id: 'file-1',
    torrent_id: 'torrent-1',
    file_path: 'movie.mp4',
    file_size: '500000000',
    is_directory: false
};

const testInput: DownloadFileInput = {
    torrent_id: 'torrent-1',
    file_path: 'movie.mp4'
};

describe('downloadFile', () => {
    let tempDir: string;
    let testFilePath: string;

    beforeEach(async () => {
        await createDB();
        
        // Create temporary directory for test files
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-test-'));
        testFilePath = path.join(tempDir, 'movie.mp4');
        
        // Create test file
        await fs.writeFile(testFilePath, Buffer.from('test file content'));
        
        // Insert test user
        await db.insert(usersTable)
            .values(testUser)
            .execute();
    });

    afterEach(async () => {
        await resetDB();
        
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should download file successfully', async () => {
        // Insert completed torrent with file path
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert torrent file
        await db.insert(torrentFilesTable)
            .values(testTorrentFile)
            .execute();

        const result = await downloadFile(testInput, 'user-1');

        expect(result).not.toBeNull();
        expect(result!.fileName).toEqual('movie.mp4');
        expect(result!.mimeType).toEqual('video/mp4');
        expect(result!.fileBuffer).toBeInstanceOf(Buffer);
        expect(result!.fileBuffer.toString()).toEqual('test file content');
    });

    it('should return null for non-existent torrent', async () => {
        const result = await downloadFile(testInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when torrent does not belong to user', async () => {
        // Insert other user first
        await db.insert(usersTable)
            .values({
                id: 'other-user',
                email: 'other@example.com',
                name: 'Other User',
                password_hash: 'hashed_password'
            })
            .execute();

        // Insert torrent for different user
        await db.insert(torrentsTable)
            .values({ ...testTorrent, user_id: 'other-user', file_path: tempDir })
            .execute();

        // Insert torrent file
        await db.insert(torrentFilesTable)
            .values(testTorrentFile)
            .execute();

        const result = await downloadFile(testInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when torrent is not completed', async () => {
        // Insert downloading torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, status: 'downloading', file_path: tempDir })
            .execute();

        // Insert torrent file
        await db.insert(torrentFilesTable)
            .values(testTorrentFile)
            .execute();

        const result = await downloadFile(testInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when file does not exist in torrent', async () => {
        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Don't insert torrent file record

        const result = await downloadFile(testInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when trying to download directory', async () => {
        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert directory entry
        await db.insert(torrentFilesTable)
            .values({
                ...testTorrentFile,
                file_path: 'subfolder',
                is_directory: true
            })
            .execute();

        const directoryInput: DownloadFileInput = {
            torrent_id: 'torrent-1',
            file_path: 'subfolder'
        };

        const result = await downloadFile(directoryInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when torrent has no file_path', async () => {
        // Insert torrent without file_path
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: null })
            .execute();

        // Insert torrent file
        await db.insert(torrentFilesTable)
            .values(testTorrentFile)
            .execute();

        const result = await downloadFile(testInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should return null when file does not exist on disk', async () => {
        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert torrent file for non-existent file
        await db.insert(torrentFilesTable)
            .values({
                ...testTorrentFile,
                file_path: 'nonexistent.txt'
            })
            .execute();

        const nonExistentInput: DownloadFileInput = {
            torrent_id: 'torrent-1',
            file_path: 'nonexistent.txt'
        };

        const result = await downloadFile(nonExistentInput, 'user-1');
        expect(result).toBeNull();
    });

    it('should prevent path traversal attacks', async () => {
        // Create file outside torrent directory
        const outsideFile = path.join(os.tmpdir(), 'outside.txt');
        await fs.writeFile(outsideFile, 'sensitive data');

        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert torrent file with path traversal attempt
        const pathTraversalPath = '../outside.txt';
        await db.insert(torrentFilesTable)
            .values({
                ...testTorrentFile,
                file_path: pathTraversalPath
            })
            .execute();

        const pathTraversalInput: DownloadFileInput = {
            torrent_id: 'torrent-1',
            file_path: pathTraversalPath
        };

        const result = await downloadFile(pathTraversalInput, 'user-1');
        expect(result).toBeNull();

        // Clean up
        await fs.unlink(outsideFile).catch(() => {});
    });

    it('should handle files in subdirectories', async () => {
        // Create subdirectory and file
        const subDir = path.join(tempDir, 'subfolder');
        await fs.mkdir(subDir, { recursive: true });
        const subFilePath = path.join(subDir, 'subtitle.srt');
        await fs.writeFile(subFilePath, 'subtitle content');

        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert torrent file for subdirectory file
        await db.insert(torrentFilesTable)
            .values({
                ...testTorrentFile,
                id: 'file-2',
                file_path: 'subfolder/subtitle.srt'
            })
            .execute();

        const subFileInput: DownloadFileInput = {
            torrent_id: 'torrent-1',
            file_path: 'subfolder/subtitle.srt'
        };

        const result = await downloadFile(subFileInput, 'user-1');

        expect(result).not.toBeNull();
        expect(result!.fileName).toEqual('subtitle.srt');
        expect(result!.mimeType).toEqual('application/x-subrip');
        expect(result!.fileBuffer.toString()).toEqual('subtitle content');
    });

    it('should handle unknown file types with default mime type', async () => {
        // Create file with unknown extension
        const unknownFilePath = path.join(tempDir, 'data.unknown');
        await fs.writeFile(unknownFilePath, 'unknown file content');

        // Insert completed torrent
        await db.insert(torrentsTable)
            .values({ ...testTorrent, file_path: tempDir })
            .execute();

        // Insert torrent file for unknown type
        await db.insert(torrentFilesTable)
            .values({
                ...testTorrentFile,
                file_path: 'data.unknown'
            })
            .execute();

        const unknownInput: DownloadFileInput = {
            torrent_id: 'torrent-1',
            file_path: 'data.unknown'
        };

        const result = await downloadFile(unknownInput, 'user-1');

        expect(result).not.toBeNull();
        expect(result!.fileName).toEqual('data.unknown');
        expect(result!.mimeType).toEqual('application/octet-stream');
        expect(result!.fileBuffer.toString()).toEqual('unknown file content');
    });
});