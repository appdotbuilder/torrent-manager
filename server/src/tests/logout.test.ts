import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, sessionsTable } from '../db/schema';
import { type LogoutInput, logoutUser } from '../handlers/logout';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('logoutUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should delete an existing session', async () => {
    // Create test user first
    const userId = randomUUID();
    await db.insert(usersTable)
      .values({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed_password'
      })
      .execute();

    // Create test session
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    await db.insert(sessionsTable)
      .values({
        id: sessionId,
        user_id: userId,
        expires_at: expiresAt
      })
      .execute();

    // Verify session exists
    const sessionsBefore = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .execute();
    
    expect(sessionsBefore).toHaveLength(1);

    // Logout user
    const input: LogoutInput = {
      session_id: sessionId
    };

    const result = await logoutUser(input);
    
    // Should return success
    expect(result.success).toBe(true);

    // Verify session was deleted
    const sessionsAfter = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .execute();
    
    expect(sessionsAfter).toHaveLength(0);
  });

  it('should return success for non-existent session', async () => {
    // Attempt to logout with non-existent session ID
    const input: LogoutInput = {
      session_id: 'non-existent-session-id'
    };

    const result = await logoutUser(input);
    
    // Should still return success for security reasons
    expect(result.success).toBe(true);
  });

  it('should not affect other sessions', async () => {
    // Create test user
    const userId = randomUUID();
    await db.insert(usersTable)
      .values({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed_password'
      })
      .execute();

    // Create multiple test sessions
    const session1Id = randomUUID();
    const session2Id = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db.insert(sessionsTable)
      .values([
        {
          id: session1Id,
          user_id: userId,
          expires_at: expiresAt
        },
        {
          id: session2Id,
          user_id: userId,
          expires_at: expiresAt
        }
      ])
      .execute();

    // Verify both sessions exist
    const sessionsBefore = await db.select()
      .from(sessionsTable)
      .execute();
    
    expect(sessionsBefore).toHaveLength(2);

    // Logout one session
    const input: LogoutInput = {
      session_id: session1Id
    };

    const result = await logoutUser(input);
    expect(result.success).toBe(true);

    // Verify only one session was deleted
    const sessionsAfter = await db.select()
      .from(sessionsTable)
      .execute();
    
    expect(sessionsAfter).toHaveLength(1);
    expect(sessionsAfter[0].id).toBe(session2Id);

    // Verify the correct session was deleted
    const deletedSession = await db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, session1Id))
      .execute();
    
    expect(deletedSession).toHaveLength(0);
  });

  it('should handle multiple users sessions correctly', async () => {
    // Create two test users
    const user1Id = randomUUID();
    const user2Id = randomUUID();
    
    await db.insert(usersTable)
      .values([
        {
          id: user1Id,
          email: 'user1@example.com',
          name: 'User 1',
          password_hash: 'hashed_password1'
        },
        {
          id: user2Id,
          email: 'user2@example.com',
          name: 'User 2',
          password_hash: 'hashed_password2'
        }
      ])
      .execute();

    // Create sessions for both users
    const user1SessionId = randomUUID();
    const user2SessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db.insert(sessionsTable)
      .values([
        {
          id: user1SessionId,
          user_id: user1Id,
          expires_at: expiresAt
        },
        {
          id: user2SessionId,
          user_id: user2Id,
          expires_at: expiresAt
        }
      ])
      .execute();

    // Logout user1's session
    const input: LogoutInput = {
      session_id: user1SessionId
    };

    const result = await logoutUser(input);
    expect(result.success).toBe(true);

    // Verify only user1's session was deleted
    const remainingSessions = await db.select()
      .from(sessionsTable)
      .execute();
    
    expect(remainingSessions).toHaveLength(1);
    expect(remainingSessions[0].id).toBe(user2SessionId);
    expect(remainingSessions[0].user_id).toBe(user2Id);
  });
});