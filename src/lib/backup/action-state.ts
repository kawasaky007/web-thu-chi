export type BackupActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: string[];
  imported?: number;
  skipped?: number;
};

export const initialBackupActionState: BackupActionState = { status: "idle" };
