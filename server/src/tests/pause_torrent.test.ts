import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable } from '../db/schema';
import { pauseTorrent, type PauseTorrentInput } from '../handlers/pause_torrent';
import { eq } from 'drizzle-orm';

describe('pauseTorrent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should pause a torrent successfully', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed-password'
      })
      .returning()
      .execute();

    // Create test torrent
    const torrent = await db.insert(torrentsTable)
      .values({
        id: 'torrent-1',
        user_id: 'user-1',
        name: 'Test Torrent',
        info_hash: 'testhash123',
        magnet_link: 'magnet:?xt=urn:btih:testhash123',
        total_size: '1000000',
        downloaded_size: '500000',
        progress: '50.00',
        download_speed: '1000.50',
        upload_speed: '500.25',
        peers: 5,
        seeds: 3,
        status: 'downloading'
      })
      .returning()
      .execute();

    const input: PauseTorrentInput = {
      torrent_id: 'torrent-1'
    };

    const result = await pauseTorrent(input, 'user-1');

    expect(result.success).toBe(true);

    // Verify torrent status was updated to 'paused'
    const updatedTorrent = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, 'torrent-1'))
      .execute();

    expect(updatedTorrent).toHaveLength(1);
    expect(updatedTorrent[0].status).toBe('paused');
    expect(updatedTorrent[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error when torrent does not exist', async () => {
    // Create test user
    await db.insert(usersTable)
      .values({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed-password'
      })
      .execute();

    const input: PauseTorrentInput = {
      torrent_id: 'non-existent-torrent'
    };

    await expect(pauseTorrent(input, 'user-1'))
      .rejects
      .toThrow(/torrent not found or access denied/i);
  });

  it('should throw error when user does not own the torrent', async () => {
    // Create two test users
    await db.insert(usersTable)
      .values([
        {
          id: 'user-1',
          email: 'user1@example.com',
          name: 'User 1',
          password_hash: 'hashed-password-1'
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          name: 'User 2',
          password_hash: 'hashed-password-2'
        }
      ])
      .execute();

    // Create torrent owned by user-1
    await db.insert(torrentsTable)
      .values({
        id: 'torrent-1',
        user_id: 'user-1',
        name: 'User 1 Torrent',
        info_hash: 'testhash123',
        magnet_link: 'magnet:?xt=urn:btih:testhash123',
        total_size: '1000000',
        status: 'downloading'
      })
      .execute();

    const input: PauseTorrentInput = {
      torrent_id: 'torrent-1'
    };

    // Try to pause with user-2's ID
    await expect(pauseTorrent(input, 'user-2'))
      .rejects
      .toThrow(/torrent not found or access denied/i);

    // Verify torrent status was not changed
    const torrent = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, 'torrent-1'))
      .execute();

    expect(torrent[0].status).toBe('downloading');
  });

  it('should work with torrents in different statuses', async () => {
    // Create test user
    await db.insert(usersTable)
      .values({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed-password'
      })
      .execute();

    // Create torrent with 'seeding' status
    await db.insert(torrentsTable)
      .values({
        id: 'torrent-1',
        user_id: 'user-1',
        name: 'Seeding Torrent',
        info_hash: 'testhash123',
        total_size: '2000000',
        downloaded_size: '2000000',
        progress: '100.00',
        status: 'seeding'
      })
      .execute();

    const input: PauseTorrentInput = {
      torrent_id: 'torrent-1'
    };

    const result = await pauseTorrent(input, 'user-1');

    expect(result.success).toBe(true);

    // Verify status changed from 'seeding' to 'paused'
    const updatedTorrent = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, 'torrent-1'))
      .execute();

    expect(updatedTorrent[0].status).toBe('paused');
  });

  it('should update timestamp when pausing torrent', async () => {
    // Create test user
    await db.insert(usersTable)
      .values({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed-password'
      })
      .execute();

    // Create torrent and get original timestamp
    const originalTorrent = await db.insert(torrentsTable)
      .values({
        id: 'torrent-1',
        user_id: 'user-1',
        name: 'Test Torrent',
        info_hash: 'testhash123',
        total_size: '1000000',
        status: 'downloading'
      })
      .returning()
      .execute();

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const input: PauseTorrentInput = {
      torrent_id: 'torrent-1'
    };

    await pauseTorrent(input, 'user-1');

    // Verify updated_at timestamp was changed
    const updatedTorrent = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.id, 'torrent-1'))
      .execute();

    expect(updatedTorrent[0].updated_at.getTime())
      .toBeGreaterThan(originalTorrent[0].updated_at.getTime());
  });
});