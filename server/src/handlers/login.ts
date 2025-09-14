import { db } from '../db';
import { usersTable, sessionsTable } from '../db/schema';
import { type LoginInput, type User, type Session } from '../schema';
import { eq } from 'drizzle-orm';
import { verify } from 'argon2';
import { nanoid } from 'nanoid';

export interface LoginResponse {
    user: User;
    session: Session;
}

export async function loginUser(input: LoginInput): Promise<LoginResponse> {
    try {
        // 1. Find user by email in the database
        const users = await db.select()
            .from(usersTable)
            .where(eq(usersTable.email, input.email))
            .execute();

        if (users.length === 0) {
            throw new Error('Invalid credentials');
        }

        const user = users[0];

        // 2. Verify password against stored hash
        const isValidPassword = await verify(user.password_hash, input.password);
        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // 3. Create a new session for the user
        const sessionId = nanoid();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        const sessionResult = await db.insert(sessionsTable)
            .values({
                id: sessionId,
                user_id: user.id,
                expires_at: expiresAt,
            })
            .returning()
            .execute();

        const session = sessionResult[0];

        // 4. Return user and session data (excluding password hash)
        const userResponse: User = {
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };

        const sessionResponse: Session = {
            id: session.id,
            user_id: session.user_id,
            expires_at: session.expires_at,
            created_at: session.created_at,
        };

        return {
            user: userResponse,
            session: sessionResponse,
        };
    } catch (error) {
        console.error('Login failed:', error);
        throw error;
    }
}