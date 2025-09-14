import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterInput } from '../schema';
import { registerUser } from '../handlers/register';
import { eq } from 'drizzle-orm';

// Test input data
const testInput: RegisterInput = {
  email: 'test@example.com',
  password: 'securepassword123',
  name: 'Test User'
};

const anotherTestInput: RegisterInput = {
  email: 'another@example.com',
  password: 'anotherpassword456',
  name: 'Another User'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should register a new user successfully', async () => {
    const result = await registerUser(testInput);

    // Verify returned user data
    expect(result.email).toEqual('test@example.com');
    expect(result.name).toEqual('Test User');
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    
    // Verify password hash is not included in response
    expect((result as any).password_hash).toBeUndefined();
  });

  it('should save user to database with hashed password', async () => {
    const result = await registerUser(testInput);

    // Query database to verify user was created
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];
    
    expect(savedUser.email).toEqual('test@example.com');
    expect(savedUser.name).toEqual('Test User');
    expect(savedUser.password_hash).toBeDefined();
    expect(typeof savedUser.password_hash).toBe('string');
    expect(savedUser.password_hash).not.toEqual('securepassword123'); // Should be hashed
    expect(savedUser.password_hash.length).toBeGreaterThan(50); // Hashed passwords are longer
    expect(savedUser.created_at).toBeInstanceOf(Date);
    expect(savedUser.updated_at).toBeInstanceOf(Date);
  });

  it('should generate unique user IDs for different users', async () => {
    const user1 = await registerUser(testInput);
    const user2 = await registerUser(anotherTestInput);

    expect(user1.id).not.toEqual(user2.id);
    expect(typeof user1.id).toBe('string');
    expect(typeof user2.id).toBe('string');
  });

  it('should hash passwords securely', async () => {
    const user1 = await registerUser(testInput);
    const user2 = await registerUser({
      ...anotherTestInput,
      password: 'securepassword123' // Same password as user1
    });

    // Query both users from database
    const users = await db.select()
      .from(usersTable)
      .execute();

    expect(users).toHaveLength(2);
    
    const savedUser1 = users.find(u => u.id === user1.id);
    const savedUser2 = users.find(u => u.id === user2.id);

    expect(savedUser1?.password_hash).toBeDefined();
    expect(savedUser2?.password_hash).toBeDefined();
    
    // Even with same password, hashes should be different (due to salt)
    expect(savedUser1?.password_hash).not.toEqual(savedUser2?.password_hash);
  });

  it('should reject registration with duplicate email', async () => {
    // Register first user
    await registerUser(testInput);

    // Try to register another user with same email
    const duplicateInput: RegisterInput = {
      email: 'test@example.com', // Same email
      password: 'differentpassword',
      name: 'Different Name'
    };

    await expect(registerUser(duplicateInput))
      .rejects
      .toThrow(/already exists/i);
  });

  it('should handle email case sensitivity correctly', async () => {
    // Register user with lowercase email
    await registerUser(testInput);

    // Try to register with uppercase email
    const uppercaseEmailInput: RegisterInput = {
      email: 'TEST@EXAMPLE.COM',
      password: 'differentpassword',
      name: 'Different Name'
    };

    // This should still fail since email should be treated case-sensitively
    // (depending on business requirements - adjust if case-insensitive is desired)
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, 'test@example.com'))
      .execute();

    expect(users).toHaveLength(1);
    
    // The uppercase email should be allowed since it's technically different
    await expect(registerUser(uppercaseEmailInput))
      .resolves
      .toBeDefined();
  });

  it('should verify password can be validated after registration', async () => {
    await registerUser(testInput);

    // Query the saved user
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, 'test@example.com'))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];

    // Verify the password hash can be validated
    const isPasswordValid = await Bun.password.verify(
      'securepassword123',
      savedUser.password_hash
    );
    
    expect(isPasswordValid).toBe(true);

    // Verify wrong password fails validation
    const isWrongPasswordValid = await Bun.password.verify(
      'wrongpassword',
      savedUser.password_hash
    );
    
    expect(isWrongPasswordValid).toBe(false);
  });
});