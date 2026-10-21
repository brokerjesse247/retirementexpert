ALTER TABLE `Advisor` ADD COLUMN `reportSettingsEncrypted` LONGTEXT NULL;
ALTER TABLE `Client` ADD COLUMN `retentionHold` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `AnalysisResult` ADD COLUMN `inputRevision` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `assumptionsVersion` VARCHAR(80) NOT NULL DEFAULT 'legacy',
  ADD COLUMN `snapshotChecksum` CHAR(64) NULL;
ALTER TABLE `Report` ADD COLUMN `requestKey` CHAR(64) NULL,
  ADD COLUMN `status` ENUM('QUEUED','GENERATING','READY','FAILED') NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN `encryptedPdf` LONGBLOB NULL,
  ADD COLUMN `errorCode` VARCHAR(80) NULL,
  ADD COLUMN `buildStartedAt` DATETIME(3) NULL,
  ADD COLUMN `completedAt` DATETIME(3) NULL,
  ADD COLUMN `retainUntil` DATETIME(3) NULL;
CREATE UNIQUE INDEX `Report_requestKey_key` ON `Report`(`requestKey`);
ALTER TABLE `AssumptionYear` ADD COLUMN `advisorId` VARCHAR(191) NULL;
DROP INDEX `AssumptionYear_year_key_key` ON `AssumptionYear`;
CREATE UNIQUE INDEX `AssumptionYear_advisorId_year_key_key` ON `AssumptionYear`(`advisorId`,`year`,`key`);
