-- CreateTable
CREATE TABLE "JiraConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apiTokenCipher" TEXT NOT NULL,
    "accountId" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraConnection_userId_key" ON "JiraConnection"("userId");

-- AddForeignKey
ALTER TABLE "JiraConnection" ADD CONSTRAINT "JiraConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
