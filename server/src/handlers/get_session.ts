import { db } from '../db';
import { sessionsTable, usersTable } from '../db/schema';
import { type Session, type User } from '../schema';
import { eq, gt } from 'drizzle-orm';

export interface GetSessionResponse {
    session: Session;
    user: User;
}

export async function getSession(sessionId: string): Promise<GetSessionResponse | null> {
    try {
        // Query session with joined user data
        const result = await db.select()
            .from(sessionsTable)
            .innerJoin(usersTable, eq(sessionsTable.user_id, usersTable.id))
            .where(eq(sessionsTable.id, sessionId))
            .execute();

        if (result.length === 0) {
            return null;
        }

        const { sessions: sessionData, users: userData } = result[0];

        // Check if session has expired
        const now = new Date();
        if (sessionData.expires_at <= now) {
            return null;
        }

        // Return session and user data
        return {
            session: {
                id: sessionData.id,
                user_id: sessionData.user_id,
                expires_at: sessionData.expires_at,
                created_at: sessionData.created_at,
            },
            user: {
                id: userData.id,
                email: userData.email,
                name: userData.name,
                created_at: userData.created_at,
                updated_at: userData.updated_at,
            }
        };
    } catch (error) {
        console.error('Session retrieval failed:', error);
        throw error;
    }
}