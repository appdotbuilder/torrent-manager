import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, torrentsTable } from '../db/schema';
import { getUserTorrents } from '../handlers/get_user_torrents';
import { eq } from 'drizzle-orm';

describe('getUserTorrents', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const testUser = {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    password_hash: 'hashed_password'
  };

  const testTorrent1 = {
    id: 'torrent-1',
    user_id: 'test-user-1',
    name: 'Test Movie 1',
    info_hash: 'abc123def456',
    magnet_link: 'magnet:?xt=urn:btih:abc123def456',
    file_path: '/downloads/test-movie-1',
    total_size: '1073741824', // 1GB as string for numeric column
    downloaded_size: '536870912', // 512MB as string
    progress: '50.00', // 50% as string
    download_speed: '1048576.00', // 1MB/s as string
    upload_speed: '524288.00', // 512KB/s as string
    peers: 5,
    seeds: 10,
    status: 'downloading' as const
  };

  const testTorrent2 = {
    id: 'torrent-2',
    user_id: 'test-user-1',
    name: 'Test Movie 2',
    info_hash: 'def456ghi789',
    magnet_link: 'magnet:?xt=urn:btih:def456ghi789',
    file_path: '/downloads/test-movie-2',
    total_size: '2147483648', // 2GB as string
    downloaded_size: '2147483648', // 2GB as string
    progress: '100.00', // 100% as string
    download_speed: '0.00', // 0 as string
    upload_speed: '262144.00', // 256KB/s as string
    peers: 0,
    seeds: 15,
    status: 'completed' as const
  };

  it('should return empty array for user with no torrents', async () => {
    // Create user but no torrents
    await db.insert(usersTable).values(testUser).execute();

    const result = await getUserTorrents('test-user-1');

    expect(result).toEqual([]);
  });

  it('should return user torrents with correct numeric conversions', async () => {
    // Create user and torrents
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values([testTorrent1, testTorrent2]).execute();

    const result = await getUserTorrents('test-user-1');

    expect(result).toHaveLength(2);

    // Verify numeric fields are converted to numbers
    expect(typeof result[0].total_size).toBe('number');
    expect(typeof result[0].downloaded_size).toBe('number');
    expect(typeof result[0].progress).toBe('number');
    expect(typeof result[0].download_speed).toBe('number');
    expect(typeof result[0].upload_speed).toBe('number');

    // Check actual values
    const torrent1Result = result.find(t => t.id === 'torrent-1');
    expect(torrent1Result).toBeDefined();
    expect(torrent1Result!.name).toEqual('Test Movie 1');
    expect(torrent1Result!.total_size).toEqual(1073741824);
    expect(torrent1Result!.downloaded_size).toEqual(536870912);
    expect(torrent1Result!.progress).toEqual(50.00);
    expect(torrent1Result!.download_speed).toEqual(1048576.00);
    expect(torrent1Result!.upload_speed).toEqual(524288.00);
    expect(torrent1Result!.peers).toEqual(5);
    expect(torrent1Result!.seeds).toEqual(10);
    expect(torrent1Result!.status).toEqual('downloading');
  });

  it('should return torrents ordered by created_at (newest first)', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    // Insert first torrent
    await db.insert(torrentsTable).values(testTorrent1).execute();
    
    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Insert second torrent (should be newer)
    await db.insert(torrentsTable).values(testTorrent2).execute();

    const result = await getUserTorrents('test-user-1');

    expect(result).toHaveLength(2);
    // First result should be the most recently created (torrent-2)
    expect(result[0].id).toEqual('torrent-2');
    expect(result[1].id).toEqual('torrent-1');
    
    // Verify created_at ordering
    expect(result[0].created_at >= result[1].created_at).toBe(true);
  });

  it('should only return torrents for the specified user', async () => {
    const otherUser = {
      id: 'other-user',
      email: 'other@example.com',
      name: 'Other User',
      password_hash: 'other_hashed_password'
    };

    const otherUserTorrent = {
      id: 'other-torrent',
      user_id: 'other-user',
      name: 'Other Movie',
      info_hash: 'xyz789abc123',
      magnet_link: 'magnet:?xt=urn:btih:xyz789abc123',
      file_path: '/downloads/other-movie',
      total_size: '1000000000',
      downloaded_size: '0',
      progress: '0.00',
      download_speed: '0.00',
      upload_speed: '0.00',
      peers: 0,
      seeds: 0,
      status: 'paused' as const
    };

    // Create both users and their torrents
    await db.insert(usersTable).values([testUser, otherUser]).execute();
    await db.insert(torrentsTable).values([testTorrent1, otherUserTorrent]).execute();

    const result = await getUserTorrents('test-user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toEqual('torrent-1');
    expect(result[0].user_id).toEqual('test-user-1');
  });

  it('should handle torrents with null optional fields', async () => {
    const torrentWithNulls = {
      id: 'torrent-with-nulls',
      user_id: 'test-user-1',
      name: 'Torrent with nulls',
      info_hash: 'nulls123test456',
      magnet_link: null, // Nullable field
      file_path: null, // Nullable field
      total_size: '1000000',
      downloaded_size: '0',
      progress: '0.00',
      download_speed: '0.00',
      upload_speed: '0.00',
      peers: 0,
      seeds: 0,
      status: 'error' as const,
      completed_at: null // Nullable field
    };

    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(torrentWithNulls).execute();

    const result = await getUserTorrents('test-user-1');

    expect(result).toHaveLength(1);
    expect(result[0].magnet_link).toBeNull();
    expect(result[0].file_path).toBeNull();
    expect(result[0].completed_at).toBeNull();
    expect(result[0].status).toEqual('error');
  });

  it('should verify torrents are saved correctly in database', async () => {
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(torrentsTable).values(testTorrent1).execute();

    // Verify in database
    const savedTorrents = await db.select()
      .from(torrentsTable)
      .where(eq(torrentsTable.user_id, 'test-user-1'))
      .execute();

    expect(savedTorrents).toHaveLength(1);
    expect(savedTorrents[0].name).toEqual('Test Movie 1');
    expect(savedTorrents[0].info_hash).toEqual('abc123def456');
    expect(savedTorrents[0].created_at).toBeInstanceOf(Date);
    
    // Verify numeric fields are stored as strings in database
    expect(typeof savedTorrents[0].total_size).toBe('string');
    expect(savedTorrents[0].total_size).toEqual('1073741824');
  });
});