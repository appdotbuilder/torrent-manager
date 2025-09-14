import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, sessionsTable } from '../db/schema';
import { getSession } from '../handlers/get_session';

describe('getSession', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should return session and user data for valid session', async () => {
        // Create test user
        const userId = 'test-user-1';
        const userResult = await db.insert(usersTable)
            .values({
                id: userId,
                email: 'test@example.com',
                name: 'Test User',
                password_hash: 'hashed_password'
            })
            .returning()
            .execute();

        // Create valid session (expires in future)
        const sessionId = 'test-session-1';
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 24);

        await db.insert(sessionsTable)
            .values({
                id: sessionId,
                user_id: userId,
                expires_at: futureDate
            })
            .execute();

        // Test get session
        const result = await getSession(sessionId);

        expect(result).not.toBeNull();
        expect(result!.session.id).toBe(sessionId);
        expect(result!.session.user_id).toBe(userId);
        expect(result!.session.expires_at).toBeInstanceOf(Date);
        expect(result!.session.created_at).toBeInstanceOf(Date);

        expect(result!.user.id).toBe(userId);
        expect(result!.user.email).toBe('test@example.com');
        expect(result!.user.name).toBe('Test User');
        expect(result!.user.created_at).toBeInstanceOf(Date);
        expect(result!.user.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent session', async () => {
        const result = await getSession('non-existent-session');
        expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
        // Create test user
        const userId = 'test-user-2';
        await db.insert(usersTable)
            .values({
                id: userId,
                email: 'expired@example.com',
                name: 'Expired User',
                password_hash: 'hashed_password'
            })
            .execute();

        // Create expired session (expires in past)
        const sessionId = 'expired-session';
        const pastDate = new Date();
        pastDate.setHours(pastDate.getHours() - 1);

        await db.insert(sessionsTable)
            .values({
                id: sessionId,
                user_id: userId,
                expires_at: pastDate
            })
            .execute();

        // Test get session
        const result = await getSession(sessionId);
        expect(result).toBeNull();
    });

    it('should handle sessions that expire exactly now', async () => {
        // Create test user
        const userId = 'test-user-3';
        await db.insert(usersTable)
            .values({
                id: userId,
                email: 'now@example.com',
                name: 'Now User',
                password_hash: 'hashed_password'
            })
            .execute();

        // Create session that expires exactly now
        const sessionId = 'now-session';
        const now = new Date();

        await db.insert(sessionsTable)
            .values({
                id: sessionId,
                user_id: userId,
                expires_at: now
            })
            .execute();

        // Test get session - should return null since expires_at <= now
        const result = await getSession(sessionId);
        expect(result).toBeNull();
    });

    it('should verify session data is correctly joined with user data', async () => {
        // Create multiple users to ensure correct joining
        const user1Id = 'user-1';
        const user2Id = 'user-2';

        await db.insert(usersTable)
            .values([
                {
                    id: user1Id,
                    email: 'user1@example.com',
                    name: 'User One',
                    password_hash: 'hash1'
                },
                {
                    id: user2Id,
                    email: 'user2@example.com',
                    name: 'User Two',
                    password_hash: 'hash2'
                }
            ])
            .execute();

        // Create sessions for both users
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 1);

        await db.insert(sessionsTable)
            .values([
                {
                    id: 'session-1',
                    user_id: user1Id,
                    expires_at: futureDate
                },
                {
                    id: 'session-2',
                    user_id: user2Id,
                    expires_at: futureDate
                }
            ])
            .execute();

        // Test session 1 returns user 1 data
        const result1 = await getSession('session-1');
        expect(result1).not.toBeNull();
        expect(result1!.session.user_id).toBe(user1Id);
        expect(result1!.user.id).toBe(user1Id);
        expect(result1!.user.email).toBe('user1@example.com');
        expect(result1!.user.name).toBe('User One');

        // Test session 2 returns user 2 data
        const result2 = await getSession('session-2');
        expect(result2).not.toBeNull();
        expect(result2!.session.user_id).toBe(user2Id);
        expect(result2!.user.id).toBe(user2Id);
        expect(result2!.user.email).toBe('user2@example.com');
        expect(result2!.user.name).toBe('User Two');
    });

    it('should handle database constraints properly', async () => {
        // Create test user
        const userId = 'test-user-4';
        await db.insert(usersTable)
            .values({
                id: userId,
                email: 'constraint@example.com',
                name: 'Constraint User',
                password_hash: 'hashed_password'
            })
            .execute();

        // Create session with valid foreign key
        const sessionId = 'valid-fk-session';
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 1);

        await db.insert(sessionsTable)
            .values({
                id: sessionId,
                user_id: userId,
                expires_at: futureDate
            })
            .execute();

        // Verify session exists and is linked correctly
        const result = await getSession(sessionId);
        expect(result).not.toBeNull();
        expect(result!.session.user_id).toBe(userId);
        expect(result!.user.id).toBe(userId);
    });
});