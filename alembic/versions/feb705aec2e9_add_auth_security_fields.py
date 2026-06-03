"""add_auth_security_fields

Revision ID: feb705aec2e9
Revises:
Create Date: 2026-06-03 23:10:20.442430
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'feb705aec2e9'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the new auth-security columns. NOT NULL columns are added with
    # server-side defaults so existing rows get sensible values.
    op.add_column(
        'users',
        sa.Column(
            'email_verified',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(), nullable=True))
    op.add_column(
        'users',
        sa.Column(
            'is_demo',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    op.add_column(
        'users',
        sa.Column(
            'failed_login_attempts',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('0'),
        ),
    )
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('deactivated_at', sa.DateTime(), nullable=True))

    # Enforce email uniqueness so concurrent registrations cannot create
    # duplicates. Clean up any pre-existing duplicates first (keep the
    # earliest record per email).
    op.execute(
        """
        DELETE FROM users a USING users b
        WHERE a.email = b.email
          AND a.id <> b.id
          AND a.created_at > b.created_at
        """
    )
    op.create_index('ix_users_email_unique', 'users', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_email_unique', table_name='users')
    op.drop_column('users', 'deactivated_at')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
    op.drop_column('users', 'is_demo')
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'email_verified')
