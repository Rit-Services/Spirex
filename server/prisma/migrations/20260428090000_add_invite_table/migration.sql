-- Invite table — backs the "send invite email so user picks their own
-- password" flow. tokenHash is a sha256 of the random token sent in the email
-- so the raw token is never stored at rest.
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_userId_idx" ON "Invite"("userId");
CREATE INDEX "Invite_expiresAt_idx" ON "Invite"("expiresAt");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
