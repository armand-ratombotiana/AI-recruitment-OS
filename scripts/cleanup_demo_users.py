"""Clean up demo user duplicates from the DB."""
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    dbname="airos",
    user="airos",
    password="airos_dev_password",
)
cur = conn.cursor()

# Show all demo users
cur.execute("""
    SELECT id, email, full_name, is_demo, email_verified, failed_login_attempts, locked_until, created_at
    FROM users
    WHERE email = 'demo@airos.io'
    ORDER BY created_at
""")
print("Existing demo users:")
for row in cur.fetchall():
    print(" ", row)

# Keep the most recent, delete the rest
cur.execute("""
    DELETE FROM users
    WHERE id NOT IN (
        SELECT id FROM users WHERE email = 'demo@airos.io' ORDER BY created_at DESC LIMIT 1
    )
    AND email = 'demo@airos.io'
""")
print(f"Deleted {cur.rowcount} duplicate demo users")
conn.commit()
cur.close()
conn.close()
print("Done.")
