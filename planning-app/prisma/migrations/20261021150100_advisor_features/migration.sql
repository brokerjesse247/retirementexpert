-- AlterTable
ALTER TABLE `IntakeDraft` ADD COLUMN `originAdvisorId` VARCHAR(191) NULL,
    ADD COLUMN `originClientId` VARCHAR(191) NULL,
    ADD COLUMN `originRevision` INTEGER NULL,
    ADD COLUMN `updateExpiresAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Scenario` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `Recommendation` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `scenarioId` VARCHAR(191) NULL,
    ADD COLUMN `sourceAnalysisId` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `Note` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `FollowUpTask` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateTable
CREATE TABLE `AdvisorNarrative` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `scenarioId` VARCHAR(191) NOT NULL,
    `sourceAnalysisId` VARCHAR(191) NOT NULL,
    `encryptedContent` LONGTEXT NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdvisorNarrative_clientId_scenarioId_key`(`clientId`, `scenarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `reviewDate` DATETIME(3) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `outboxId` VARCHAR(191) NULL,
    `draftId` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReviewDelivery_clientId_reviewDate_kind_key`(`clientId`, `reviewDate`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Recommendation_clientId_scenarioId_ruleId_key` ON `Recommendation`(`clientId`, `scenarioId`, `ruleId`);

-- AddForeignKey
ALTER TABLE `AdvisorNarrative` ADD CONSTRAINT `AdvisorNarrative_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewDelivery` ADD CONSTRAINT `ReviewDelivery_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

