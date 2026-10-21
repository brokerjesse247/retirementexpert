CREATE TABLE `OperationsReplayNonce` (
  `fingerprint` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  INDEX `OperationsReplayNonce_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`fingerprint`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
