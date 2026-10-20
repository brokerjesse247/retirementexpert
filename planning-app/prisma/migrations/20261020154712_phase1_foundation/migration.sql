-- CreateTable
CREATE TABLE `Advisor` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(64) NULL,
    `licenseNumbers` TEXT NULL,
    `totpSecretEncrypted` LONGTEXT NULL,
    `recoveryCodeHashes` LONGTEXT NULL,
    `totpEnabledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Advisor_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdvisorSession` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `csrfToken` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AdvisorSession_tokenHash_key`(`tokenHash`),
    INDEX `AdvisorSession_advisorId_lastSeenAt_idx`(`advisorId`, `lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `csrfToken` CHAR(64) NOT NULL,
    `encryptedEnrollmentSecret` LONGTEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuthChallenge_tokenHash_key`(`tokenHash`),
    INDEX `AuthChallenge_advisorId_expiresAt_idx`(`advisorId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_advisorId_expiresAt_idx`(`advisorId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateLimit` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `windowStart` DATETIME(3) NOT NULL,
    `blockedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RateLimit_scope_keyHash_key`(`scope`, `keyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntakeDraft` (
    `id` VARCHAR(191) NOT NULL,
    `sessionTokenHash` CHAR(64) NOT NULL,
    `csrfToken` CHAR(64) NOT NULL,
    `encryptedData` LONGTEXT NOT NULL,
    `email` VARCHAR(320) NULL,
    `step` INTEGER NOT NULL DEFAULT 1,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `submittedAt` DATETIME(3) NULL,
    `consentedAt` DATETIME(3) NULL,
    `consentVersion` VARCHAR(64) NULL,
    `clientId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `IntakeDraft_sessionTokenHash_key`(`sessionTokenHash`),
    UNIQUE INDEX `IntakeDraft_clientId_key`(`clientId`),
    INDEX `IntakeDraft_email_updatedAt_idx`(`email`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DraftAccessGrant` (
    `id` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `purpose` ENUM('RESUME') NOT NULL DEFAULT 'RESUME',
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DraftAccessGrant_tokenHash_key`(`tokenHash`),
    INDEX `DraftAccessGrant_draftId_expiresAt_idx`(`draftId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NOT NULL,
    `status` ENUM('NEW', 'IN_REVIEW', 'REPORT_GENERATED', 'PRESENTED', 'IMPLEMENTING', 'ANNUAL_REVIEW_DUE', 'ARCHIVED') NOT NULL DEFAULT 'NEW',
    `firstName` VARCHAR(120) NOT NULL,
    `lastName` VARCHAR(120) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `encryptedData` LONGTEXT NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `nextReviewDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Client_advisorId_status_submittedAt_idx`(`advisorId`, `status`, `submittedAt`),
    INDEX `Client_advisorId_updatedAt_idx`(`advisorId`, `updatedAt`),
    INDEX `Client_advisorId_email_idx`(`advisorId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Person` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `role` ENUM('PRIMARY', 'SPOUSE') NOT NULL,
    `firstName` VARCHAR(120) NOT NULL,
    `lastName` VARCHAR(120) NOT NULL,
    `dob` DATETIME(3) NULL,
    `retirementAge` INTEGER NULL,
    `earnedIncomeCents` BIGINT NULL,
    `piaCents` BIGINT NULL,

    UNIQUE INDEX `Person_clientId_role_key`(`clientId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `owner` ENUM('PRIMARY', 'SPOUSE', 'HOUSEHOLD') NOT NULL DEFAULT 'HOUSEHOLD',
    `type` ENUM('K401_PRETAX', 'ROTH_401K', 'TRAD_IRA', 'ROTH_IRA', 'HSA', 'BROKERAGE', 'CASH', 'ANNUITY', 'CASH_VALUE_LIFE') NOT NULL,
    `balanceCents` BIGINT NOT NULL,
    `costBasisCents` BIGINT NULL,
    `annualContributionCents` BIGINT NULL,
    `employerMatchPct` DECIMAL(7, 4) NULL,

    INDEX `Account_clientId_type_idx`(`clientId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeStream` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `personRole` ENUM('PRIMARY', 'SPOUSE') NULL,
    `type` ENUM('PENSION', 'ANNUITY', 'RENTAL', 'PART_TIME', 'OTHER') NOT NULL,
    `monthlyCents` BIGINT NULL,
    `startAge` INTEGER NULL,
    `endAge` INTEGER NULL,
    `colaPct` DECIMAL(7, 4) NULL,
    `survivorPct` DECIMAL(7, 4) NULL,

    INDEX `IncomeStream_clientId_type_idx`(`clientId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(64) NOT NULL,
    `amountCents` BIGINT NULL,
    `isEssential` BOOLEAN NULL,

    INDEX `Expense_clientId_kind_idx`(`clientId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Goal` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `amountCents` BIGINT NULL,
    `targetYear` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Debt` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `balanceCents` BIGINT NULL,
    `ratePct` DECIMAL(7, 4) NULL,
    `monthlyPaymentCents` BIGINT NULL,
    `payoffYear` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstateDocs` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `willStatus` VARCHAR(16) NULL,
    `trustStatus` VARCHAR(16) NULL,
    `financialPoaStatus` VARCHAR(16) NULL,
    `healthcareDirectiveStatus` VARCHAR(16) NULL,
    `beneficiariesStatus` VARCHAR(16) NULL,
    `beneficiariesUpdatedYear` INTEGER NULL,

    UNIQUE INDEX `EstateDocs_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskProfile` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `profile` VARCHAR(32) NOT NULL,
    `answers` TEXT NOT NULL,

    UNIQUE INDEX `RiskProfile_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(64) NOT NULL,
    `consentedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ConsentRecord_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Upload` (
    `id` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `advisorId` VARCHAR(191) NULL,
    `name` VARCHAR(180) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `encryptedBytes` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Upload_draftId_key`(`draftId`),
    UNIQUE INDEX `Upload_clientId_key`(`clientId`),
    INDEX `Upload_advisorId_createdAt_idx`(`advisorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailOutbox` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NULL,
    `kind` VARCHAR(64) NOT NULL,
    `recipientHash` CHAR(64) NOT NULL,
    `encryptedPayload` LONGTEXT NOT NULL,
    `status` ENUM('PENDING', 'SENDING', 'RETRY', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastErrorCode` VARCHAR(80) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmailOutbox_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `advisorId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(80) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_clientId_createdAt_idx`(`clientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scenario` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `encryptedOverrides` LONGTEXT NOT NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisResult` (
    `id` VARCHAR(191) NOT NULL,
    `scenarioId` VARCHAR(191) NOT NULL,
    `engineVersion` VARCHAR(64) NOT NULL,
    `assumptionsYear` INTEGER NOT NULL,
    `encryptedSnapshot` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recommendation` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(32) NULL,
    `priority` VARCHAR(16) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `encryptedContent` LONGTEXT NOT NULL,
    `status` ENUM('PROPOSED', 'APPROVED', 'EDITED', 'REMOVED') NOT NULL DEFAULT 'PROPOSED',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `analysisResultId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `encryptedSnapshot` LONGTEXT NOT NULL,
    `checksum` CHAR(64) NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    UNIQUE INDEX `Report_clientId_version_key`(`clientId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `encryptedBody` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FollowUpTask` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `encryptedContent` LONGTEXT NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssumptionYear` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `encryptedValue` LONGTEXT NOT NULL,
    `sourceUrl` VARCHAR(2048) NULL,
    `verifiedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AssumptionYear_year_key_key`(`year`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdvisorSession` ADD CONSTRAINT `AdvisorSession_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthChallenge` ADD CONSTRAINT `AuthChallenge_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntakeDraft` ADD CONSTRAINT `IntakeDraft_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DraftAccessGrant` ADD CONSTRAINT `DraftAccessGrant_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `IntakeDraft`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Person` ADD CONSTRAINT `Person_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeStream` ADD CONSTRAINT `IncomeStream_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goal` ADD CONSTRAINT `Goal_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Debt` ADD CONSTRAINT `Debt_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstateDocs` ADD CONSTRAINT `EstateDocs_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskProfile` ADD CONSTRAINT `RiskProfile_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsentRecord` ADD CONSTRAINT `ConsentRecord_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Upload` ADD CONSTRAINT `Upload_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `IntakeDraft`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Upload` ADD CONSTRAINT `Upload_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Upload` ADD CONSTRAINT `Upload_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailOutbox` ADD CONSTRAINT `EmailOutbox_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_advisorId_fkey` FOREIGN KEY (`advisorId`) REFERENCES `Advisor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scenario` ADD CONSTRAINT `Scenario_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisResult` ADD CONSTRAINT `AnalysisResult_scenarioId_fkey` FOREIGN KEY (`scenarioId`) REFERENCES `Scenario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recommendation` ADD CONSTRAINT `Recommendation_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_analysisResultId_fkey` FOREIGN KEY (`analysisResultId`) REFERENCES `AnalysisResult`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUpTask` ADD CONSTRAINT `FollowUpTask_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

