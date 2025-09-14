import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, sessionsTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { loginUser } from '../handlers/login';
import { eq } from 'drizzle-orm';
import { hash } from 'argon2';
import { nanoid } from 'nanoid';

describe('loginUser', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    // Helper function to create a test user
    const createTestUser = async (email: string = 'test@example.com', password: string = 'testpassword123') => {
        const userId = nanoid();
        const passwordHash = await hash(password);
        
        await db.insert(usersTable)
            .values({
                id: userId,
                email,
                name: 'Test User',
                password_hash: passwordHash,
            })
            .execute();

        return { userId, email, password };
    };

    it('should login user with valid credentials', async () => {
        // Create test user
        const { email, password } = await createTestUser();

        const input: LoginInput = {
            email,
            password,
        };

        const result = await loginUser(input);

        // Verify user data
        expect(result.user.email).toEqual(email);
        expect(result.user.name).toEqual('Test User');
        expect(result.user.id).toBeDefined();
        expect(result.user.created_at).toBeInstanceOf(Date);
        expect(result.user.updated_at).toBeInstanceOf(Date);

        // Verify session data
        expect(result.session.id).toBeDefined();
        expect(result.session.user_id).toEqual(result.user.id);
        expect(result.session.expires_at).toBeInstanceOf(Date);
        expect(result.session.created_at).toBeInstanceOf(Date);

        // Verify session expires in approximately 7 days
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const timeDiff = Math.abs(result.session.expires_at.getTime() - sevenDaysFromNow.getTime());
        expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });

    it('should create session in database', async () => {
        // Create test user
        const { email, password, userId } = await createTestUser();

        const input: LoginInput = {
            email,
            password,
        };

        const result = await loginUser(input);

        // Verify session was saved to database
        const sessions = await db.select()
            .from(sessionsTable)
            .where(eq(sessionsTable.id, result.session.id))
            .execute();

        expect(sessions).toHaveLength(1);
        expect(sessions[0].user_id).toEqual(userId);
        expect(sessions[0].expires_at).toBeInstanceOf(Date);
        expect(sessions[0].created_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent email', async () => {
        const input: LoginInput = {
            email: 'nonexistent@example.com',
            password: 'anypassword',
        };

        await expect(loginUser(input)).rejects.toThrow(/invalid credentials/i);
    });

    it('should throw error for incorrect password', async () => {
        // Create test user
        const { email } = await createTestUser('test@example.com', 'correctpassword');

        const input: LoginInput = {
            email,
            password: 'wrongpassword',
        };

        await expect(loginUser(input)).rejects.toThrow(/invalid credentials/i);
    });

    it('should handle case-sensitive email correctly', async () => {
        // Create test user with lowercase email
        const { password } = await createTestUser('test@example.com', 'testpassword123');

        // Try to login with uppercase email
        const input: LoginInput = {
            email: 'TEST@EXAMPLE.COM',
            password,
        };

        // Should fail because email is case-sensitive
        await expect(loginUser(input)).rejects.toThrow(/invalid credentials/i);
    });

    it('should work with different valid email formats', async () => {
        const testEmails = [
            'user@domain.com',
            'test.email+tag@example.org',
            'firstname.lastname@company.co.uk'
        ];

        for (const email of testEmails) {
            const password = 'testpassword123';
            await createTestUser(email, password);

            const input: LoginInput = {
                email,
                password,
            };

            const result = await loginUser(input);
            expect(result.user.email).toEqual(email);
            expect(result.session.user_id).toEqual(result.user.id);
        }
    });

    it('should create unique session ids for multiple logins', async () => {
        // Create test user
        const { email, password } = await createTestUser();

        const input: LoginInput = {
            email,
            password,
        };

        // Login multiple times
        const result1 = await loginUser(input);
        const result2 = await loginUser(input);
        const result3 = await loginUser(input);

        // Each session should have a unique ID
        expect(result1.session.id).not.toEqual(result2.session.id);
        expect(result1.session.id).not.toEqual(result3.session.id);
        expect(result2.session.id).not.toEqual(result3.session.id);

        // All sessions should belong to the same user
        expect(result1.session.user_id).toEqual(result2.session.user_id);
        expect(result1.session.user_id).toEqual(result3.session.user_id);

        // Verify all sessions are in database
        const sessions = await db.select()
            .from(sessionsTable)
            .where(eq(sessionsTable.user_id, result1.user.id))
            .execute();

        expect(sessions).toHaveLength(3);
    });
});