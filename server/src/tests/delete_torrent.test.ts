import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable, torrentFilesTable } from '../db/schema';
import { deleteTorrent, type DeleteTorrentInput } from '../handlers/delete_torrent';
import { eq, and } from 'drizzle-orm';

describe('deleteTorrent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: string;
  let otherUserId: string;
  let testTorrentId: string;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'hash123'
        },
        {
          id: 'user-2',
          email: 'other@example.com',
          name: 'Other User',
          password_hash: 'hash456'
        }
      ])
      .returning()
      .execute();

    testUserId = users[0].id;
    otherUserId = users[1].id;

    // Create test torrent
    const torrents = await db.insert(torrentsTable)
      .values({
        id: 'torrent-1',
        user_id: testUserId,
        name: 'Test Torrent',
        info_hash: 'abc123def456',
        total_size: '1000000000',
        downloaded_size: '500000000',
        progress: '50.00',
        download_speed: '1000.50',
        upload_speed: '500.25',
        peers: 5,
        seeds: 10,
        status: 'downloading'
      })
      .returning()
      .execute();

    testTorrentId = torrents[0].id;

    // Create test torrent files
    await db.insert(torrentFilesTable)
      .values([
        {
          id: 'file-1',
          torrent_id: testTorrentId,
          file_path: 'video.mp4',
          file_size: '800000000',
          is_directory: false
        },
        {
          id: 'file-2',
          torrent_id: testTorrentId,
          file_path: 'subtitles.srt',
          file_size: '50000',
          is_directory: false
        }
      ])
      .execute();
  });

  it('should delete torrent and related files successfully', async () => {
    const input: DeleteTorrentInput = {
      torrent_id: testTorrentId
    };

    const result = await deleteTorrent(input, testUserId);

    expect(result.success).toBe(true);

    // Verify torrent is deleted
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, testTorrentId))
      .execute();

    expect(torrents).toHaveLength(0);

    // Verify torrent files are deleted
    const torrentFiles = await db.select()
      .from(torrentFilesTable)
      .where(eq(torrentFilesTable.torrent_id, testTorrentId))
      .execute();

    expect(torrentFiles).toHaveLength(0);
  });

  it('should throw error when torrent does not exist', async () => {
    const input: DeleteTorrentInput = {
      torrent_id: 'non-existent-torrent'
    };

    expect(deleteTorrent(input, testUserId)).rejects.toThrow(/not found or access denied/i);
  });

  it('should throw error when user tries to delete another user\'s torrent', async () => {
    const input: DeleteTorrentInput = {
      torrent_id: testTorrentId
    };

    expect(deleteTorrent(input, otherUserId)).rejects.toThrow(/not found or access denied/i);

    // Verify torrent still exists
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, testTorrentId))
      .execute();

    expect(torrents).toHaveLength(1);
  });

  it('should handle torrent without files', async () => {
    // Create torrent without files
    const torrentWithoutFiles = await db.insert(torrentsTable)
      .values({
        id: 'torrent-no-files',
        user_id: testUserId,
        name: 'Empty Torrent',
        info_hash: 'xyz789abc123',
        total_size: '0',
        downloaded_size: '0',
        progress: '0.00',
        download_speed: '0.00',
        upload_speed: '0.00',
        peers: 0,
        seeds: 0,
        status: 'paused'
      })
      .returning()
      .execute();

    const input: DeleteTorrentInput = {
      torrent_id: torrentWithoutFiles[0].id
    };

    const result = await deleteTorrent(input, testUserId);

    expect(result.success).toBe(true);

    // Verify torrent is deleted
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, torrentWithoutFiles[0].id))
      .execute();

    expect(torrents).toHaveLength(0);
  });

  it('should only delete specified torrent and not affect other torrents', async () => {
    // Create another torrent for the same user
    const anotherTorrent = await db.insert(torrentsTable)
      .values({
        id: 'torrent-2',
        user_id: testUserId,
        name: 'Another Torrent',
        info_hash: 'def456ghi789',
        total_size: '2000000000',
        downloaded_size: '0',
        progress: '0.00',
        download_speed: '0.00',
        upload_speed: '0.00',
        peers: 0,
        seeds: 0,
        status: 'downloading'
      })
      .returning()
      .execute();

    const input: DeleteTorrentInput = {
      torrent_id: testTorrentId
    };

    const result = await deleteTorrent(input, testUserId);

    expect(result.success).toBe(true);

    // Verify only the specified torrent is deleted
    const remainingTorrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.user_id, testUserId))
      .execute();

    expect(remainingTorrents).toHaveLength(1);
    expect(remainingTorrents[0].id).toBe(anotherTorrent[0].id);
  });
});