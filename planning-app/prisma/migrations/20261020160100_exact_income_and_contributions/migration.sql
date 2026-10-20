ALTER TABLE `Person`
  ADD COLUMN `employeeContributionPct` DECIMAL(7,4) NULL,
  ADD COLUMN `employerMatchPct` DECIMAL(7,4) NULL;
ALTER TABLE `IncomeStream`
  ADD COLUMN `annualCents` BIGINT NULL,
  ADD COLUMN `isColaLinked` BOOLEAN NULL;
