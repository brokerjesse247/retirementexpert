export type AdvisorSession = {
  advisor: { id: string; name: string; email: string } | null;
  csrfToken: string | null;
  twoFactorEnabled: boolean;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonRecord | JsonValue[];
export type JsonRecord = { [key: string]: JsonValue };

export type ClientSummary = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  submittedAt: string | null;
  status: string;
  updatedAt: string | null;
  investableAssets?: number | null;
  nextReviewDate?: string | null;
};

export type ClientDetailResponse = {
  client: { id: string; name: string; email: string; status: string; submittedAt?: string | null; updatedAt?: string | null };
  data: JsonRecord;
  csrfToken: string;
  revision: number;
};
