import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { resumeTorrent, type ResumeTorrentInput } from '../handlers/resume_torrent';

// Test user data
const testUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  password_hash: 'hashed_password'
};

const otherUser = {
  id: 'user-456',
  email: 'other@example.com',
  name: 'Other User',
  password_hash: 'hashed_password'
};

// Test torrent data
const testTorrent = {
  id: 'torrent-123',
  user_id: testUser.id,
  name: 'Test Torrent',
  info_hash: 'abc123def456',
  magnet_link: 'magnet:?xt=urn:btih:abc123def456',
  file_path: '/downloads/test',
  total_size: '1000000000', // 1GB as string for numeric column
  downloaded_size: '500000000', // 500MB as string
  progress: '50.00', // 50% as string
  download_speed: '1000000.00', // 1MB/s as string
  upload_speed: '500000.00', // 500KB/s as string
  peers: 10,
  seeds: 5,
  status: 'paused' as const // Start in paused state for resume testing
};

describe('resumeTorrent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should resume a paused torrent', async () => {
    // Create test user and torrent
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(testTorrent).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    const result = await resumeTorrent(input, testUser.id);

    // Verify success response
    expect(result.success).toBe(true);

    // Verify torrent status was updated to 'downloading'
    const updatedTorrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, testTorrent.id))
      .execute();

    expect(updatedTorrents).toHaveLength(1);
    expect(updatedTorrents[0].status).toBe('downloading');
    expect(updatedTorrents[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle already downloading torrent gracefully', async () => {
    // Create torrent that's already downloading
    const downloadingTorrent = {
      ...testTorrent,
      status: 'downloading' as const
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(downloadingTorrent).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    const result = await resumeTorrent(input, testUser.id);

    // Should succeed without error
    expect(result.success).toBe(true);

    // Status should remain 'downloading'
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, testTorrent.id))
      .execute();

    expect(torrents[0].status).toBe('downloading');
  });

  it('should resume a seeding torrent', async () => {
    // Create torrent that's seeding
    const seedingTorrent = {
      ...testTorrent,
      status: 'seeding' as const,
      progress: '100.00', // Completed
      downloaded_size: testTorrent.total_size
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(seedingTorrent).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    const result = await resumeTorrent(input, testUser.id);

    expect(result.success).toBe(true);

    // Status should be updated to 'downloading'
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, testTorrent.id))
      .execute();

    expect(torrents[0].status).toBe('downloading');
  });

  it('should throw error for non-existent torrent', async () => {
    await db.insert(usersTable).values(testUser).execute();

    const input: ResumeTorrentInput = {
      torrent_id: 'non-existent-torrent'
    };

    await expect(resumeTorrent(input, testUser.id))
      .rejects.toThrow(/torrent not found or access denied/i);
  });

  it('should throw error when torrent belongs to different user', async () => {
    // Create both users and torrent owned by other user
    await db.insert(usersTable).values([testUser, otherUser]).execute();
    await db.insert(torrentsTable).values({
      ...testTorrent,
      user_id: otherUser.id
    }).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    // Try to resume with wrong user
    await expect(resumeTorrent(input, testUser.id))
      .rejects.toThrow(/torrent not found or access denied/i);
  });

  it('should throw error for completed torrent', async () => {
    // Create completed torrent
    const completedTorrent = {
      ...testTorrent,
      status: 'completed' as const,
      progress: '100.00',
      downloaded_size: testTorrent.total_size,
      completed_at: new Date()
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(completedTorrent).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    await expect(resumeTorrent(input, testUser.id))
      .rejects.toThrow(/cannot resume completed torrent/i);
  });

  it('should throw error for torrent in error state', async () => {
    // Create torrent in error state
    const errorTorrent = {
      ...testTorrent,
      status: 'error' as const
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(errorTorrent).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    await expect(resumeTorrent(input, testUser.id))
      .rejects.toThrow(/cannot resume torrent in error state/i);
  });

  it('should update only the specified torrent', async () => {
    // Create multiple torrents for the same user
    const secondTorrent = {
      ...testTorrent,
      id: 'torrent-456',
      name: 'Second Torrent',
      info_hash: 'def789ghi012'
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values([testTorrent, secondTorrent]).execute();

    const input: ResumeTorrentInput = {
      torrent_id: testTorrent.id
    };

    await resumeTorrent(input, testUser.id);

    // Check that only the specified torrent was updated
    const torrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.user_id, testUser.id))
      .execute();

    const updatedTorrent = torrents.find(t => t.id === testTorrent.id);
    const unchangedTorrent = torrents.find(t => t.id === secondTorrent.id);

    expect(updatedTorrent?.status).toBe('downloading');
    expect(unchangedTorrent?.status).toBe('paused'); // Should remain unchanged
  });
});